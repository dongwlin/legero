/* @vitest-environment jsdom */

import { act, cleanup, renderHook } from '@testing-library/react'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

dayjs.extend(utc)
dayjs.extend(timezone)
import { useAuthStore } from '@/store/auth'
import { useOrderStore } from '@/store/order'
import {
  DEFAULT_ORDER_FORM_VALUE,
  STEP_STATUS,
  type OrderRecord,
} from '@/types'
import { useOrderWorkspaceSync } from './useOrderWorkspaceSync'

const mocks = vi.hoisted(() => ({
  subscribeToWorkspaceOrders: vi.fn(),
  unsubscribe: vi.fn(),
  listOrders: vi.fn(),
  hasPending: vi.fn(),
}))

vi.mock('@/services/orderRealtime', () => ({
  orderRealtime: {
    subscribeToWorkspaceOrders: mocks.subscribeToWorkspaceOrders,
    unsubscribe: mocks.unsubscribe,
  },
}))

vi.mock('@/services/orderRepository', () => ({
  orderRepository: { list: mocks.listOrders },
}))

vi.mock('@/services/orderOptimistic', () => ({
  orderOptimistic: { hasPending: mocks.hasPending },
}))

type SubscriptionCallbacks = {
  onUpsert: (order: OrderRecord) => void
  onRemove: (id: string) => void
  onClear: (event: { clearedCount: number; mode: string }) => void
  onSubscriptionStatus: (status: string) => void
}

let subscriptionCallbacks: SubscriptionCallbacks | null = null

const makeOrder = (
  id: string,
  createdAt: string,
  overrides: Partial<OrderRecord> = {},
): OrderRecord => ({
  ...DEFAULT_ORDER_FORM_VALUE,
  id,
  displayNo: id,
  totalPriceCents: 1500,
  stapleStepStatusCode: STEP_STATUS.notStarted,
  meatStepStatusCode: STEP_STATUS.notStarted,
  createdAt,
  updatedAt: createdAt,
  completedAt: null,
  ...overrides,
})

// The current calendar day in the business timezone (Asia/Shanghai), as the
// server's before_today clear boundary uses the same definition.
const todayKeyInShanghai = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())

const todayOrder = (id: string): OrderRecord =>
  makeOrder(id, `${todayKeyInShanghai()}T10:00:00+08:00`)

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const flushAsync = async () => {
  for (let i = 0; i < 50; i += 1) {
    await Promise.resolve()
  }
}

const resetStores = () => {
  localStorage.clear()
  useAuthStore.setState({
    status: 'authenticated',
    user: { id: 'u1', phone: '13800000001', role: 'owner' },
    permissions: [],
    serverTime: '2025-01-01T00:00:00+08:00',
    workspaceStatus: 'ready',
    activeWorkspace: { id: 'w1', name: '测试门店', role: 'owner' },
    errorMessage: null,
  })
  useOrderStore.setState({
    ordersById: {},
    orderDisplayIds: [],
    filter: 'all',
    updateTargetID: '',
    isQuickCalcMode: false,
    quickCalcSelectedOrderIds: [],
    lastHydratedAt: null,
    status: 'idle',
    errorMessage: null,
  })
}

describe('useOrderWorkspaceSync snapshot reconciliation', () => {
  beforeEach(() => {
    resetStores()
    subscriptionCallbacks = null
    mocks.subscribeToWorkspaceOrders.mockReset().mockImplementation(
      (options: SubscriptionCallbacks) => {
        subscriptionCallbacks = options
        return { close: vi.fn() }
      },
    )
    mocks.unsubscribe.mockReset().mockResolvedValue(undefined)
    mocks.listOrders.mockReset().mockResolvedValue([])
    mocks.hasPending.mockReset().mockReturnValue(false)
  })

  afterEach(() => {
    cleanup()
  })

  it('does not clobber realtime updates received while the snapshot is in flight', async () => {
    const snapshot = deferred<OrderRecord[]>()
    mocks.listOrders.mockReturnValue(snapshot.promise)

    renderHook(() => useOrderWorkspaceSync())
    expect(subscriptionCallbacks).not.toBeNull()
    const ws = subscriptionCallbacks!

    // The initial subscribe: SUBSCRIBED starts the first reconciliation.
    act(() => {
      ws.onSubscriptionStatus('SUBSCRIBED')
    })
    expect(mocks.listOrders).toHaveBeenCalledTimes(1)

    const orderA = makeOrder('a', '2025-01-01T00:00:00+08:00')
    const orderB = makeOrder('b', '2025-01-02T00:00:00+08:00')
    const orderC = makeOrder('c', '2025-01-03T00:00:00+08:00')

    // While the snapshot is in flight: b is created and a is deleted.
    act(() => {
      ws.onUpsert(orderB)
      ws.onRemove('a')
    })

    // The snapshot (read before those events) finally returns.
    await act(async () => {
      snapshot.resolve([orderA, orderC])
      await flushAsync()
    })

    const { ordersById, status } = useOrderStore.getState()
    expect(ordersById['a']).toBeUndefined()
    expect(ordersById['b']).toEqual(orderB)
    expect(ordersById['c']).toEqual(orderC)
    expect(status).toBe('ready')
  })

  it('does not drop the realtime upsert of an optimistically-pending order during the snapshot', async () => {
    const snapshot = deferred<OrderRecord[]>()
    mocks.listOrders.mockReturnValue(snapshot.promise)
    mocks.hasPending.mockReturnValue(true)

    renderHook(() => useOrderWorkspaceSync())
    const ws = subscriptionCallbacks!

    act(() => {
      ws.onSubscriptionStatus('SUBSCRIBED')
    })

    // The user toggles order a: the mutation is pending, and the server
    // echoes the change over WS while the snapshot is still in flight.
    const serverA = makeOrder('a', '2025-01-01T00:00:00+08:00', { note: 'server' })
    act(() => {
      ws.onUpsert(serverA)
    })

    // The mutation finishes before the snapshot lands: the buffered server
    // event is no longer deferred and must win over the stale snapshot.
    mocks.hasPending.mockReturnValue(false)

    await act(async () => {
      snapshot.resolve([
        makeOrder('a', '2025-01-01T00:00:00+08:00', { note: 'stale' }),
      ])
      await flushAsync()
    })

    expect(useOrderStore.getState().ordersById['a']?.note).toBe('server')
  })

  it('keeps the optimistic record when the mutation is still pending at snapshot commit', async () => {
    const snapshot = deferred<OrderRecord[]>()
    mocks.listOrders.mockReturnValue(snapshot.promise)
    mocks.hasPending.mockReturnValue(true)

    renderHook(() => useOrderWorkspaceSync())
    const ws = subscriptionCallbacks!

    act(() => {
      ws.onSubscriptionStatus('SUBSCRIBED')
    })

    // The optimistic mutation applied its local record to the store.
    const optimisticA = makeOrder('a', '2025-01-01T00:00:00+08:00', {
      note: 'optimistic',
    })
    useOrderStore.getState().upsertOrder(optimisticA)

    // The server echo arrives while the mutation is still pending.
    act(() => {
      ws.onUpsert(makeOrder('a', '2025-01-01T00:00:00+08:00', { note: 'server-echo' }))
    })

    await act(async () => {
      snapshot.resolve([
        makeOrder('a', '2025-01-01T00:00:00+08:00', { note: 'stale' }),
      ])
      await flushAsync()
    })

    // Neither the stale snapshot nor the server echo may clobber the
    // optimistic record: the pending mutation's completion owns the
    // authoritative state.
    expect(useOrderStore.getState().ordersById['a']?.note).toBe('optimistic')
  })

  it('keeps the newest version of an order upserted during the snapshot', async () => {
    const snapshot = deferred<OrderRecord[]>()
    mocks.listOrders.mockReturnValue(snapshot.promise)

    renderHook(() => useOrderWorkspaceSync())
    const ws = subscriptionCallbacks!

    act(() => {
      ws.onSubscriptionStatus('SUBSCRIBED')
    })

    act(() => {
      ws.onUpsert(makeOrder('a', '2025-01-01T00:00:00+08:00', { note: 'v1' }))
      ws.onUpsert(makeOrder('a', '2025-01-01T00:00:00+08:00', { note: 'v2' }))
    })

    await act(async () => {
      snapshot.resolve([
        makeOrder('a', '2025-01-01T00:00:00+08:00', { note: 'snapshot' }),
      ])
      await flushAsync()
    })

    expect(useOrderStore.getState().ordersById['a']?.note).toBe('v2')
  })

  it('lets a remove received during the snapshot win over the snapshot', async () => {
    const snapshot = deferred<OrderRecord[]>()
    mocks.listOrders.mockReturnValue(snapshot.promise)

    renderHook(() => useOrderWorkspaceSync())
    const ws = subscriptionCallbacks!

    act(() => {
      ws.onSubscriptionStatus('SUBSCRIBED')
    })

    act(() => {
      ws.onUpsert(makeOrder('a', '2025-01-01T00:00:00+08:00'))
      ws.onRemove('a')
    })

    await act(async () => {
      snapshot.resolve([makeOrder('a', '2025-01-01T00:00:00+08:00')])
      await flushAsync()
    })

    expect(useOrderStore.getState().ordersById['a']).toBeUndefined()
  })

  it('replays a clear received during the snapshot and refetches afterwards', async () => {
    const first = deferred<OrderRecord[]>()
    const second = deferred<OrderRecord[]>()
    mocks.listOrders
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)

    renderHook(() => useOrderWorkspaceSync())
    const ws = subscriptionCallbacks!

    act(() => {
      ws.onSubscriptionStatus('SUBSCRIBED')
    })
    expect(mocks.listOrders).toHaveBeenCalledTimes(1)

    act(() => {
      ws.onClear({ clearedCount: 2, mode: 'all' })
    })

    await act(async () => {
      first.resolve([
        makeOrder('a', '2025-01-01T00:00:00+08:00'),
        makeOrder('b', '2025-01-02T00:00:00+08:00'),
      ])
      await flushAsync()
    })

    // The buffered clear empties the workspace, and the clear-triggered
    // follow-up snapshot is already in flight.
    expect(useOrderStore.getState().ordersById).toEqual({})
    expect(mocks.listOrders).toHaveBeenCalledTimes(2)

    await act(async () => {
      second.resolve([])
      await flushAsync()
    })

    expect(useOrderStore.getState().ordersById).toEqual({})
    expect(useOrderStore.getState().status).toBe('ready')
  })

  it('keeps today orders when a before_today clear is received during the snapshot', async () => {
    const first = deferred<OrderRecord[]>()
    const second = deferred<OrderRecord[]>()
    mocks.listOrders
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)

    renderHook(() => useOrderWorkspaceSync())
    const ws = subscriptionCallbacks!

    act(() => {
      ws.onSubscriptionStatus('SUBSCRIBED')
    })
    expect(mocks.listOrders).toHaveBeenCalledTimes(1)

    const today = todayOrder('today')
    const yesterday = makeOrder('yesterday', '2020-01-01T10:00:00+08:00')

    act(() => {
      ws.onClear({ clearedCount: 1, mode: 'before_today' })
    })

    await act(async () => {
      first.resolve([today, yesterday])
      await flushAsync()
    })

    // The reconciled snapshot drops pre-today orders but keeps today's, and
    // the clear-triggered follow-up snapshot is already in flight.
    expect(useOrderStore.getState().ordersById['today']).toEqual(today)
    expect(useOrderStore.getState().ordersById['yesterday']).toBeUndefined()
    expect(mocks.listOrders).toHaveBeenCalledTimes(2)

    await act(async () => {
      second.resolve([today])
      await flushAsync()
    })

    expect(useOrderStore.getState().ordersById['today']).toEqual(today)
    expect(useOrderStore.getState().ordersById['yesterday']).toBeUndefined()
    expect(useOrderStore.getState().status).toBe('ready')
  })

  it('keeps today orders even when the follow-up snapshot after a before_today clear fails', async () => {
    const first = deferred<OrderRecord[]>()
    const second = deferred<OrderRecord[]>()
    mocks.listOrders
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)

    renderHook(() => useOrderWorkspaceSync())
    const ws = subscriptionCallbacks!

    act(() => {
      ws.onSubscriptionStatus('SUBSCRIBED')
    })

    const today = todayOrder('today')
    const yesterday = makeOrder('yesterday', '2020-01-01T10:00:00+08:00')

    act(() => {
      ws.onClear({ clearedCount: 1, mode: 'before_today' })
    })

    await act(async () => {
      first.resolve([today, yesterday])
      await flushAsync()
    })

    // The non-blocking follow-up snapshot fails: the locally-reconciled
    // state must survive — today's order stays, yesterday's stays gone.
    await act(async () => {
      second.reject(new Error('Failed to fetch'))
      await flushAsync()
    })

    expect(useOrderStore.getState().ordersById['today']).toEqual(today)
    expect(useOrderStore.getState().ordersById['yesterday']).toBeUndefined()
    expect(useOrderStore.getState().status).toBe('ready')
  })

  it('does not drop realtime events received while a failed snapshot was in flight', async () => {
    const snapshot = deferred<OrderRecord[]>()
    mocks.listOrders.mockReturnValue(snapshot.promise)

    renderHook(() => useOrderWorkspaceSync())
    const ws = subscriptionCallbacks!

    act(() => {
      ws.onSubscriptionStatus('SUBSCRIBED')
    })

    const orderB = makeOrder('b', '2025-01-02T00:00:00+08:00')
    act(() => {
      ws.onUpsert(orderB)
    })

    await act(async () => {
      snapshot.reject(new Error('Failed to fetch'))
      await flushAsync()
    })

    const { ordersById, status, errorMessage } = useOrderStore.getState()
    expect(ordersById['b']).toEqual(orderB)
    expect(status).toBe('error')
    expect(errorMessage).toBe('Failed to fetch')
  })

  it('reconciles again on reconnect with the same buffering mechanism', async () => {
    const first = deferred<OrderRecord[]>()
    const second = deferred<OrderRecord[]>()
    mocks.listOrders
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)

    renderHook(() => useOrderWorkspaceSync())
    const ws = subscriptionCallbacks!

    act(() => {
      ws.onSubscriptionStatus('SUBSCRIBED')
    })

    await act(async () => {
      first.resolve([])
      await flushAsync()
    })
    expect(useOrderStore.getState().status).toBe('ready')

    // Reconnect: SUBSCRIBED fires again, starting a second reconciliation.
    act(() => {
      ws.onSubscriptionStatus('SUBSCRIBED')
    })
    expect(mocks.listOrders).toHaveBeenCalledTimes(2)

    const orderB = makeOrder('b', '2025-01-02T00:00:00+08:00')
    act(() => {
      ws.onUpsert(orderB)
    })

    await act(async () => {
      second.resolve([])
      await flushAsync()
    })

    expect(useOrderStore.getState().ordersById['b']).toEqual(orderB)
  })

  it('applies realtime events immediately when no reconciliation is in flight', async () => {
    mocks.listOrders.mockResolvedValue([])

    renderHook(() => useOrderWorkspaceSync())
    const ws = subscriptionCallbacks!

    act(() => {
      ws.onSubscriptionStatus('SUBSCRIBED')
    })

    await act(async () => {
      await flushAsync()
    })
    expect(useOrderStore.getState().status).toBe('ready')

    const orderB = makeOrder('b', '2025-01-02T00:00:00+08:00')
    act(() => {
      ws.onUpsert(orderB)
    })

    // The rAF-batched flush applies it on the next frame.
    await act(async () => {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve())
      })
    })

    expect(useOrderStore.getState().ordersById['b']).toEqual(orderB)
  })

  it('applies a clear immediately when no reconciliation is in flight, even if the follow-up snapshot fails', async () => {
    const first = deferred<OrderRecord[]>()
    const second = deferred<OrderRecord[]>()
    mocks.listOrders
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)

    renderHook(() => useOrderWorkspaceSync())
    const ws = subscriptionCallbacks!

    act(() => {
      ws.onSubscriptionStatus('SUBSCRIBED')
    })

    await act(async () => {
      first.resolve([
        makeOrder('a', '2025-01-01T00:00:00+08:00'),
        makeOrder('b', '2025-01-02T00:00:00+08:00'),
      ])
      await flushAsync()
    })
    expect(useOrderStore.getState().ordersById['a']).toBeDefined()

    // The clear arrives with no snapshot in flight: it must hit the store
    // immediately, not only after the follow-up snapshot succeeds.
    act(() => {
      ws.onClear({ clearedCount: 2, mode: 'all' })
    })
    expect(useOrderStore.getState().ordersById).toEqual({})

    // The follow-up snapshot fails: the locally-applied clear still holds.
    await act(async () => {
      second.reject(new Error('Failed to fetch'))
      await flushAsync()
    })

    expect(useOrderStore.getState().ordersById).toEqual({})
  })

  it('applies a before_today clear immediately when no reconciliation is in flight', async () => {
    const first = deferred<OrderRecord[]>()
    const second = deferred<OrderRecord[]>()
    mocks.listOrders
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)

    renderHook(() => useOrderWorkspaceSync())
    const ws = subscriptionCallbacks!

    act(() => {
      ws.onSubscriptionStatus('SUBSCRIBED')
    })

    const today = todayOrder('today')
    const yesterday = makeOrder('yesterday', '2020-01-01T10:00:00+08:00')

    await act(async () => {
      first.resolve([today, yesterday])
      await flushAsync()
    })

    act(() => {
      ws.onClear({ clearedCount: 1, mode: 'before_today' })
    })
    expect(useOrderStore.getState().ordersById['today']).toEqual(today)
    expect(useOrderStore.getState().ordersById['yesterday']).toBeUndefined()

    // The follow-up snapshot fails: the locally-applied clear still holds.
    await act(async () => {
      second.reject(new Error('Failed to fetch'))
      await flushAsync()
    })

    expect(useOrderStore.getState().ordersById['today']).toEqual(today)
    expect(useOrderStore.getState().ordersById['yesterday']).toBeUndefined()
  })
})
