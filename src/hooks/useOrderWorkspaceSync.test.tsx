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
  captureSnapshotMarker: vi.fn(),
  idsToProtect: vi.fn(),
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
  orderOptimistic: {
    hasPending: mocks.hasPending,
    captureSnapshotMarker: mocks.captureSnapshotMarker,
    idsToProtect: mocks.idsToProtect,
  },
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
  version: 1,
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
    mocks.captureSnapshotMarker
      .mockReset()
      .mockReturnValue({ seq: 0, pendingIds: [] })
    mocks.idsToProtect.mockReset().mockReturnValue(new Set())
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
    mocks.idsToProtect.mockReturnValue(new Set(['a']))

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

  it('keeps the optimistic record when no WS echo arrives before the snapshot lands', async () => {
    const snapshot = deferred<OrderRecord[]>()
    mocks.listOrders.mockReturnValue(snapshot.promise)
    mocks.hasPending.mockReturnValue(true)
    mocks.idsToProtect.mockReturnValue(new Set(['a']))

    renderHook(() => useOrderWorkspaceSync())
    const ws = subscriptionCallbacks!

    act(() => {
      ws.onSubscriptionStatus('SUBSCRIBED')
    })

    // The user toggles order a while the snapshot is in flight: the
    // optimistic record lands in the store, but the WS echo has not arrived,
    // so no realtime event mentions a. The marker captured at snapshot start
    // must still protect it at commit.
    const optimisticA = makeOrder('a', '2025-01-01T00:00:00+08:00', {
      note: 'optimistic',
    })
    act(() => {
      useOrderStore.getState().upsertOrder(optimisticA)
    })

    expect(mocks.captureSnapshotMarker).toHaveBeenCalledTimes(1)
    expect(mocks.captureSnapshotMarker.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.listOrders.mock.invocationCallOrder[0],
    )

    await act(async () => {
      snapshot.resolve([
        makeOrder('a', '2025-01-01T00:00:00+08:00', { note: 'stale' }),
      ])
      await flushAsync()
    })

    // The stale snapshot must not clobber the optimistic record.
    expect(mocks.idsToProtect).toHaveBeenCalledTimes(1)
    expect(useOrderStore.getState().ordersById['a']?.note).toBe('optimistic')
  })

  it('lets a newer realtime upsert win over a completed local mutation (success path)', async () => {
    const snapshot = deferred<OrderRecord[]>()
    mocks.listOrders.mockReturnValue(snapshot.promise)
    mocks.hasPending.mockReturnValue(false)
    mocks.idsToProtect.mockReturnValue(new Set(['a']))

    renderHook(() => useOrderWorkspaceSync())
    const ws = subscriptionCallbacks!

    act(() => {
      ws.onSubscriptionStatus('SUBSCRIBED')
    })

    // The user's mutation began while the snapshot was in flight and already
    // completed: the store holds the server-confirmed result.
    const localA1 = makeOrder('a', '2025-01-01T00:00:00+08:00', {
      updatedAt: '2025-01-01T00:00:02+08:00',
      note: 'local-completed',
    })
    act(() => {
      useOrderStore.getState().upsertOrder(localA1)
    })

    // Another client updates a after our mutation committed; the server
    // broadcasts the newer state while the snapshot is still in flight.
    act(() => {
      ws.onUpsert(
        makeOrder('a', '2025-01-01T00:00:00+08:00', {
          updatedAt: '2025-01-01T00:00:03+08:00',
          note: 'remote-newer',
        }),
      )
    })

    await act(async () => {
      snapshot.resolve([
        makeOrder('a', '2025-01-01T00:00:00+08:00', {
          updatedAt: '2025-01-01T00:00:01+08:00',
          note: 'stale-snapshot',
        }),
      ])
      await flushAsync()
    })

    // The realtime event is newer than the settled local mutation: it must
    // win over both the local result and the stale snapshot.
    expect(useOrderStore.getState().ordersById['a']?.note).toBe('remote-newer')
  })

  it('lets a newer realtime upsert win over a completed local mutation when the snapshot fails', async () => {
    const snapshot = deferred<OrderRecord[]>()
    mocks.listOrders.mockReturnValue(snapshot.promise)
    mocks.hasPending.mockReturnValue(false)
    mocks.idsToProtect.mockReturnValue(new Set(['a']))

    renderHook(() => useOrderWorkspaceSync())
    const ws = subscriptionCallbacks!

    act(() => {
      ws.onSubscriptionStatus('SUBSCRIBED')
    })

    const localA1 = makeOrder('a', '2025-01-01T00:00:00+08:00', {
      updatedAt: '2025-01-01T00:00:02+08:00',
      note: 'local-completed',
    })
    act(() => {
      useOrderStore.getState().upsertOrder(localA1)
    })

    act(() => {
      ws.onUpsert(
        makeOrder('a', '2025-01-01T00:00:00+08:00', {
          updatedAt: '2025-01-01T00:00:03+08:00',
          note: 'remote-newer',
        }),
      )
    })

    await act(async () => {
      snapshot.reject(new Error('Failed to fetch'))
      await flushAsync()
    })

    // The failure replay must not defer the newer event: it supersedes the
    // completed local mutation.
    expect(useOrderStore.getState().ordersById['a']?.note).toBe('remote-newer')
  })

  it('keeps the completed local mutation when no realtime event arrived before the snapshot lands', async () => {
    const snapshot = deferred<OrderRecord[]>()
    mocks.listOrders.mockReturnValue(snapshot.promise)
    mocks.hasPending.mockReturnValue(false)
    mocks.idsToProtect.mockReturnValue(new Set(['a']))

    renderHook(() => useOrderWorkspaceSync())
    const ws = subscriptionCallbacks!

    act(() => {
      ws.onSubscriptionStatus('SUBSCRIBED')
    })

    // The mutation settles during the snapshot; no WS event mentions a, so
    // the marker must still keep the server-confirmed record over the stale
    // snapshot.
    const serverA1 = makeOrder('a', '2025-01-01T00:00:00+08:00', {
      updatedAt: '2025-01-01T00:00:02+08:00',
      note: 'server-confirmed',
    })
    act(() => {
      useOrderStore.getState().upsertOrder(serverA1)
    })

    await act(async () => {
      snapshot.resolve([
        makeOrder('a', '2025-01-01T00:00:00+08:00', {
          updatedAt: '2025-01-01T00:00:01+08:00',
          note: 'stale-snapshot',
        }),
      ])
      await flushAsync()
    })

    expect(useOrderStore.getState().ordersById['a']?.note).toBe('server-confirmed')
  })

  it('keeps the completed local mutation when the buffered event carries the same server version', async () => {
    const snapshot = deferred<OrderRecord[]>()
    mocks.listOrders.mockReturnValue(snapshot.promise)
    mocks.hasPending.mockReturnValue(false)
    mocks.idsToProtect.mockReturnValue(new Set(['a']))

    renderHook(() => useOrderWorkspaceSync())
    const ws = subscriptionCallbacks!

    act(() => {
      ws.onSubscriptionStatus('SUBSCRIBED')
    })

    const serverA1 = makeOrder('a', '2025-01-01T00:00:00+08:00', {
      updatedAt: '2025-01-01T00:00:02+08:00',
      note: 'server-confirmed',
    })
    act(() => {
      useOrderStore.getState().upsertOrder(serverA1)
    })

    // The server echoes the same commit over WS: same version, only its
    // serialization differs from the HTTP response already in the store.
    act(() => {
      ws.onUpsert(
        makeOrder('a', '2025-01-01T00:00:00+08:00', {
          updatedAt: '2025-01-01T00:00:02+08:00',
          note: 'echo-variant',
        }),
      )
    })

    await act(async () => {
      snapshot.resolve([
        makeOrder('a', '2025-01-01T00:00:00+08:00', {
          updatedAt: '2025-01-01T00:00:01+08:00',
          note: 'stale-snapshot',
        }),
      ])
      await flushAsync()
    })

    // The event is not strictly newer than the settled local result, so the
    // local result stays authoritative.
    expect(useOrderStore.getState().ordersById['a']?.note).toBe('server-confirmed')
  })

  it('does not let a failed snapshot replay clobber a protected optimistic record', async () => {
    const snapshot = deferred<OrderRecord[]>()
    mocks.listOrders.mockReturnValue(snapshot.promise)
    mocks.hasPending.mockReturnValue(true)
    mocks.idsToProtect.mockReturnValue(new Set(['a']))

    renderHook(() => useOrderWorkspaceSync())
    const ws = subscriptionCallbacks!

    act(() => {
      ws.onSubscriptionStatus('SUBSCRIBED')
    })

    const optimisticA = makeOrder('a', '2025-01-01T00:00:00+08:00', {
      note: 'optimistic',
    })
    act(() => {
      useOrderStore.getState().upsertOrder(optimisticA)
    })

    // The WS echo arrives while the snapshot is in flight and the mutation
    // is still pending.
    act(() => {
      ws.onUpsert(makeOrder('a', '2025-01-01T00:00:00+08:00', { note: 'server-echo' }))
    })

    await act(async () => {
      snapshot.reject(new Error('Failed to fetch'))
      await flushAsync()
    })

    // The buffered echo replay must not clobber the optimistic record: the
    // pending mutation's completion owns the authoritative state.
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

  it('keeps an order absent after upsert then clear(all) when the follow-up snapshot fails', async () => {
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

    const oldOrder = makeOrder('a', '2020-01-01T10:00:00+08:00')

    await act(async () => {
      first.resolve([oldOrder])
      await flushAsync()
    })
    expect(useOrderStore.getState().ordersById['a']).toBeDefined()

    // The server sends upsert a and then a full clear, both before the next
    // rAF flush. Client execution order must stay upsert -> clear, so the
    // clear wipes the flushed upsert instead of the upsert resurrecting the
    // order after the clear.
    act(() => {
      ws.onUpsert(oldOrder)
      ws.onClear({ clearedCount: 1, mode: 'all' })
    })

    expect(useOrderStore.getState().ordersById).toEqual({})

    // The non-blocking follow-up snapshot fails: the order must stay absent.
    await act(async () => {
      second.reject(new Error('Failed to fetch'))
      await flushAsync()
    })

    expect(useOrderStore.getState().ordersById).toEqual({})
  })

  it('keeps an old order absent after upsert then clear(before_today) when the follow-up snapshot fails', async () => {
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
    const oldOrder = makeOrder('a', '2020-01-01T10:00:00+08:00')

    await act(async () => {
      first.resolve([today, oldOrder])
      await flushAsync()
    })

    // The server sends upsert a and then a before_today clear, both before
    // the next rAF flush: the old order must not be re-applied after the
    // clear has dropped it.
    act(() => {
      ws.onUpsert(oldOrder)
      ws.onClear({ clearedCount: 1, mode: 'before_today' })
    })

    expect(useOrderStore.getState().ordersById['a']).toBeUndefined()
    expect(useOrderStore.getState().ordersById['today']).toEqual(today)

    // The non-blocking follow-up snapshot fails: the old order stays absent,
    // today's order stays put.
    await act(async () => {
      second.reject(new Error('Failed to fetch'))
      await flushAsync()
    })

    expect(useOrderStore.getState().ordersById['a']).toBeUndefined()
    expect(useOrderStore.getState().ordersById['today']).toEqual(today)
  })
})
