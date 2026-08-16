/* @vitest-environment jsdom */

import { act, cleanup, renderHook } from '@testing-library/react'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

dayjs.extend(utc)
dayjs.extend(timezone)
import { requestOrdersResync } from '@/services/orderResync'
import type { LocalMutationEffect } from '@/services/orderOptimistic'
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
  effectsAfter: vi.fn(),
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
    effectsAfter: mocks.effectsAfter,
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
    mocks.effectsAfter.mockReset().mockReturnValue([])
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

  it('lets a higher-version snapshot beat a lower-version optimistic overlay', async () => {
    const snapshot = deferred<OrderRecord[]>()
    mocks.listOrders.mockReturnValue(snapshot.promise)
    mocks.idsToProtect.mockReturnValue(new Set(['a']))

    renderHook(() => useOrderWorkspaceSync())
    const ws = subscriptionCallbacks!

    act(() => {
      ws.onSubscriptionStatus('SUBSCRIBED')
    })

    // The user toggles a while the snapshot is in flight: the optimistic
    // record (v10) lands in the store, but no server confirmation exists yet
    // and no WS event is buffered — the v11 commit happened while the client
    // was offline, so there is no echo to replay.
    const optimistic = makeOrder('a', '2025-01-01T00:00:00+08:00', {
      version: 10,
      note: 'optimistic',
      stapleStepStatusCode: STEP_STATUS.completed,
    })
    act(() => {
      useOrderStore.getState().upsertOrder(optimistic)
    })

    // The snapshot is read from a server state NEWER than the optimistic
    // record's base (v11). The overlay previously compared only against
    // buffered realtime versions, so this authoritative snapshot was
    // downgraded to the stale local optimistic state.
    await act(async () => {
      snapshot.resolve([
        makeOrder('a', '2025-01-01T00:00:00+08:00', {
          version: 11,
          note: 'authoritative-snapshot',
        }),
      ])
      await flushAsync()
    })

    const order = useOrderStore.getState().ordersById['a']
    expect(order?.version).toBe(11)
    expect(order?.note).toBe('authoritative-snapshot')
  })

  it('keeps an edit-form update that completes during the snapshot', async () => {
    const snapshot = deferred<OrderRecord[]>()
    mocks.listOrders.mockReturnValue(snapshot.promise)
    mocks.idsToProtect.mockReturnValue(new Set(['a']))
    const confirmed: LocalMutationEffect = {
      type: 'upsert',
      order: makeOrder('a', '2025-01-01T00:00:00+08:00', {
        version: 11,
        note: 'form-update-confirmed',
      }),
      seq: 1,
    }
    mocks.effectsAfter.mockReturnValue([confirmed])

    renderHook(() => useOrderWorkspaceSync())
    const ws = subscriptionCallbacks!

    act(() => {
      ws.onSubscriptionStatus('SUBSCRIBED')
    })

    // The form's PUT succeeds while the snapshot is in flight: the
    // authoritative v11 response lands in the store and in the journal, but
    // no WS echo is buffered before the snapshot commits.
    act(() => {
      useOrderStore.getState().upsertOrder(confirmed.order)
    })

    // The snapshot (read at v10, before the PUT) returns the stale state.
    await act(async () => {
      snapshot.resolve([
        makeOrder('a', '2025-01-01T00:00:00+08:00', {
          version: 10,
          note: 'stale-snapshot',
        }),
      ])
      await flushAsync()
    })

    // The stale snapshot must not downgrade the confirmed update.
    const order = useOrderStore.getState().ordersById['a']
    expect(order?.version).toBe(11)
    expect(order?.note).toBe('form-update-confirmed')
  })

  it('keeps an order created during the snapshot', async () => {
    const snapshot = deferred<OrderRecord[]>()
    mocks.listOrders.mockReturnValue(snapshot.promise)
    mocks.idsToProtect.mockReturnValue(new Set(['c']))
    const created: LocalMutationEffect = {
      type: 'upsert',
      order: makeOrder('c', '2025-01-03T00:00:00+08:00', {
        version: 1,
        note: 'created',
      }),
      seq: 1,
    }
    mocks.effectsAfter.mockReturnValue([created])

    renderHook(() => useOrderWorkspaceSync())
    const ws = subscriptionCallbacks!

    act(() => {
      ws.onSubscriptionStatus('SUBSCRIBED')
    })

    // The POST response confirms the new order while the snapshot is in
    // flight; its WS echo has not arrived yet.
    act(() => {
      useOrderStore.getState().upsertOrder(created.order)
    })

    // The snapshot was read before the create and does not contain c.
    await act(async () => {
      snapshot.resolve([
        makeOrder('a', '2025-01-01T00:00:00+08:00'),
        makeOrder('b', '2025-01-02T00:00:00+08:00'),
      ])
      await flushAsync()
    })

    // The stale snapshot must not drop the freshly created order.
    expect(useOrderStore.getState().ordersById['c']).toEqual(created.order)
  })

  it('keeps an order deleted during the snapshot absent', async () => {
    const snapshot = deferred<OrderRecord[]>()
    mocks.listOrders.mockReturnValue(snapshot.promise)
    mocks.idsToProtect.mockReturnValue(new Set(['a']))
    mocks.effectsAfter.mockReturnValue([{ type: 'remove', id: 'a', seq: 1 }])

    renderHook(() => useOrderWorkspaceSync())
    const ws = subscriptionCallbacks!

    act(() => {
      ws.onSubscriptionStatus('SUBSCRIBED')
    })

    // The DELETE succeeds while the snapshot is in flight: the store already
    // dropped a, and its WS remove event has not arrived yet.
    act(() => {
      useOrderStore.getState().removeOrder('a')
    })

    // The snapshot was read before the delete and still contains a.
    await act(async () => {
      snapshot.resolve([
        makeOrder('a', '2025-01-01T00:00:00+08:00', { version: 10 }),
      ])
      await flushAsync()
    })

    // The stale snapshot must not resurrect the deleted order.
    expect(useOrderStore.getState().ordersById['a']).toBeUndefined()
  })

  it('does not let a delayed buffered upsert resurrect an order removed during the snapshot', async () => {
    // Review blocker, compaction: within one reconciliation window the WS
    // events are remove a followed by a stale delayed upsert of a. Since
    // the backend never reuses an order id, the remove is a terminal
    // tombstone and the trailing upsert must be dropped.
    const snapshot = deferred<OrderRecord[]>()
    mocks.listOrders.mockReturnValue(snapshot.promise)

    renderHook(() => useOrderWorkspaceSync())
    const ws = subscriptionCallbacks!

    act(() => {
      ws.onSubscriptionStatus('SUBSCRIBED')
    })

    act(() => {
      ws.onRemove('a')
      ws.onUpsert(
        makeOrder('a', '2025-01-01T00:00:00+08:00', {
          version: 11,
          note: 'stale-delayed',
        }),
      )
    })

    await act(async () => {
      snapshot.resolve([
        makeOrder('a', '2025-01-01T00:00:00+08:00', { version: 10 }),
      ])
      await flushAsync()
    })

    expect(useOrderStore.getState().ordersById['a']).toBeUndefined()
  })

  it('does not let a buffered realtime upsert resurrect an order deleted during the snapshot', async () => {
    // Review blocker, success path: another client updates a to v11 while
    // the snapshot is in flight, and the local DELETE confirms before the
    // snapshot lands — but the delete's own WS event has not arrived, so
    // only the old upsert is buffered. The buffered upsert must not win
    // over the confirmed local remove.
    const snapshot = deferred<OrderRecord[]>()
    mocks.listOrders.mockReturnValue(snapshot.promise)
    mocks.idsToProtect.mockReturnValue(new Set(['a']))
    mocks.effectsAfter.mockReturnValue([{ type: 'remove', id: 'a', seq: 2 }])

    renderHook(() => useOrderWorkspaceSync())
    const ws = subscriptionCallbacks!

    act(() => {
      ws.onSubscriptionStatus('SUBSCRIBED')
    })

    act(() => {
      ws.onUpsert(
        makeOrder('a', '2025-01-01T00:00:00+08:00', {
          version: 11,
          note: 'remote-v11',
        }),
      )
    })

    // The DELETE succeeds while the snapshot is still in flight; its WS
    // remove event has not arrived yet, so no remove is buffered.
    act(() => {
      useOrderStore.getState().removeOrder('a')
    })

    await act(async () => {
      snapshot.resolve([
        makeOrder('a', '2025-01-01T00:00:00+08:00', {
          version: 10,
          note: 'stale-snapshot',
        }),
      ])
      await flushAsync()
    })

    // The buffered v11 upsert predates the delete: the server state is
    // already "a absent", so the order must stay absent.
    expect(useOrderStore.getState().ordersById['a']).toBeUndefined()
  })

  it('does not resurrect an order deleted during a failed snapshot via a buffered upsert', async () => {
    // Review blocker, failure path: the buffered upsert would normally be
    // applied onto the store on failure, re-inserting an order the client
    // already deleted and the server no longer has. The confirmed remove
    // tombstone must re-apply after the buffered replay.
    const snapshot = deferred<OrderRecord[]>()
    mocks.listOrders.mockReturnValue(snapshot.promise)
    mocks.effectsAfter.mockReturnValue([{ type: 'remove', id: 'a', seq: 2 }])

    renderHook(() => useOrderWorkspaceSync())
    const ws = subscriptionCallbacks!

    act(() => {
      ws.onSubscriptionStatus('SUBSCRIBED')
    })

    act(() => {
      ws.onUpsert(
        makeOrder('a', '2025-01-01T00:00:00+08:00', {
          version: 11,
          note: 'remote-v11',
        }),
      )
    })

    // The DELETE succeeds while the snapshot is still in flight.
    act(() => {
      useOrderStore.getState().removeOrder('a')
    })

    await act(async () => {
      snapshot.reject(new Error('Failed to fetch'))
      await flushAsync()
    })

    expect(useOrderStore.getState().ordersById['a']).toBeUndefined()
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
    // completed: the store holds the server-confirmed result (version 11).
    // Note the malicious case the review calls out: the local result and the
    // remote event share the identical updatedAt, so only `version` can
    // order them.
    const sharedUpdatedAt = '2026-08-16T14:20:30+08:00'
    const localA1 = makeOrder('a', '2025-01-01T00:00:00+08:00', {
      version: 11,
      updatedAt: sharedUpdatedAt,
      note: 'local-completed',
    })
    act(() => {
      useOrderStore.getState().upsertOrder(localA1)
    })

    // Another client updates a after our mutation committed; the server
    // broadcasts the newer state (version 12, same updatedAt) while the
    // snapshot is still in flight.
    act(() => {
      ws.onUpsert(
        makeOrder('a', '2025-01-01T00:00:00+08:00', {
          version: 12,
          updatedAt: sharedUpdatedAt,
          note: 'remote-newer',
        }),
      )
    })

    await act(async () => {
      snapshot.resolve([
        makeOrder('a', '2025-01-01T00:00:00+08:00', {
          version: 10,
          updatedAt: '2025-01-01T00:00:01+08:00',
          note: 'stale-snapshot',
        }),
      ])
      await flushAsync()
    })

    // The realtime event has a higher version than the settled local
    // mutation: it must win over both the local result and the stale
    // snapshot, even though their updatedAt values are identical.
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
      version: 11,
      note: 'local-completed',
    })
    act(() => {
      useOrderStore.getState().upsertOrder(localA1)
    })

    act(() => {
      ws.onUpsert(
        makeOrder('a', '2025-01-01T00:00:00+08:00', {
          version: 12,
          note: 'remote-newer',
        }),
      )
    })

    await act(async () => {
      snapshot.reject(new Error('Failed to fetch'))
      await flushAsync()
    })

    // The failure replay must not defer the newer event: version 12
    // supersedes the completed local mutation (version 11).
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
    // the marker must still keep the server-confirmed record (version 11)
    // over the stale snapshot (version 10).
    const serverA1 = makeOrder('a', '2025-01-01T00:00:00+08:00', {
      version: 11,
      note: 'server-confirmed',
    })
    act(() => {
      useOrderStore.getState().upsertOrder(serverA1)
    })

    await act(async () => {
      snapshot.resolve([
        makeOrder('a', '2025-01-01T00:00:00+08:00', {
          version: 10,
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
      version: 11,
      note: 'server-confirmed',
    })
    act(() => {
      useOrderStore.getState().upsertOrder(serverA1)
    })

    // The server echoes the same commit over WS: same version (11), only
    // its serialization differs from the HTTP response already in the store.
    act(() => {
      ws.onUpsert(
        makeOrder('a', '2025-01-01T00:00:00+08:00', {
          version: 11,
          note: 'echo-variant',
        }),
      )
    })

    await act(async () => {
      snapshot.resolve([
        makeOrder('a', '2025-01-01T00:00:00+08:00', {
          version: 10,
          note: 'stale-snapshot',
        }),
      ])
      await flushAsync()
    })

    // The event is not strictly newer (same version) than the settled local
    // result, so the local result stays authoritative.
    expect(useOrderStore.getState().ordersById['a']?.note).toBe('server-confirmed')
  })

  it('keeps the completed local mutation when the buffered event has a lower version', async () => {
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
      version: 11,
      note: 'local-completed',
    })
    act(() => {
      useOrderStore.getState().upsertOrder(localA1)
    })

    // A delayed stale event (version 10) arrives while the snapshot is in
    // flight: it must not overwrite the settled local mutation (version 11).
    act(() => {
      ws.onUpsert(
        makeOrder('a', '2025-01-01T00:00:00+08:00', {
          version: 10,
          note: 'stale-delayed',
        }),
      )
    })

    await act(async () => {
      snapshot.resolve([
        makeOrder('a', '2025-01-01T00:00:00+08:00', {
          version: 9,
          note: 'stale-snapshot',
        }),
      ])
      await flushAsync()
    })

    expect(useOrderStore.getState().ordersById['a']?.note).toBe('local-completed')
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
      ws.onUpsert(
        makeOrder('a', '2025-01-01T00:00:00+08:00', { version: 10, note: 'first' }),
      )
      ws.onUpsert(
        makeOrder('a', '2025-01-01T00:00:00+08:00', { version: 11, note: 'second' }),
      )
    })

    await act(async () => {
      snapshot.resolve([
        makeOrder('a', '2025-01-01T00:00:00+08:00', { version: 9, note: 'snapshot' }),
      ])
      await flushAsync()
    })

    expect(useOrderStore.getState().ordersById['a']?.note).toBe('second')
  })

  it('does not let a delayed lower-version upsert downgrade the snapshot during reconciliation', async () => {
    const snapshot = deferred<OrderRecord[]>()
    mocks.listOrders.mockReturnValue(snapshot.promise)

    renderHook(() => useOrderWorkspaceSync())
    const ws = subscriptionCallbacks!

    act(() => {
      ws.onSubscriptionStatus('SUBSCRIBED')
    })

    // A delayed stale upsert (version 11) is buffered while the snapshot is
    // in flight; the snapshot itself already carries version 12.
    act(() => {
      ws.onUpsert(
        makeOrder('a', '2025-01-01T00:00:00+08:00', {
          version: 11,
          note: 'stale-delayed',
        }),
      )
    })

    await act(async () => {
      snapshot.resolve([
        makeOrder('a', '2025-01-01T00:00:00+08:00', {
          version: 12,
          note: 'snapshot-v12',
        }),
      ])
      await flushAsync()
    })

    // The stale event cannot lower the store back to version 11.
    expect(useOrderStore.getState().ordersById['a']?.note).toBe('snapshot-v12')
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

  it('does not let a delayed stale realtime event overwrite a newer store record', async () => {
    mocks.listOrders.mockResolvedValue([
      makeOrder('a', '2025-01-01T00:00:00+08:00', {
        version: 12,
        note: 'authoritative-v12',
      }),
    ])

    renderHook(() => useOrderWorkspaceSync())
    const ws = subscriptionCallbacks!

    act(() => {
      ws.onSubscriptionStatus('SUBSCRIBED')
    })

    await act(async () => {
      await flushAsync()
    })
    expect(useOrderStore.getState().ordersById['a']?.version).toBe(12)

    // The delayed realtime event carries an older version (11): it must be
    // ignored even though the snapshot is long settled.
    act(() => {
      ws.onUpsert(
        makeOrder('a', '2025-01-01T00:00:00+08:00', {
          version: 11,
          note: 'stale-delayed',
        }),
      )
    })

    await act(async () => {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve())
      })
    })

    const order = useOrderStore.getState().ordersById['a']
    expect(order?.version).toBe(12)
    expect(order?.note).toBe('authoritative-v12')
  })

  it('treats a duplicate realtime event with the same version as idempotent', async () => {
    mocks.listOrders.mockResolvedValue([
      makeOrder('a', '2025-01-01T00:00:00+08:00', {
        version: 12,
        note: 'authoritative-v12',
      }),
    ])

    renderHook(() => useOrderWorkspaceSync())
    const ws = subscriptionCallbacks!

    act(() => {
      ws.onSubscriptionStatus('SUBSCRIBED')
    })

    await act(async () => {
      await flushAsync()
    })
    expect(useOrderStore.getState().ordersById['a']?.version).toBe(12)

    // The WS echo of the same commit (same version) must not overwrite the
    // record already stored from the snapshot.
    act(() => {
      ws.onUpsert(
        makeOrder('a', '2025-01-01T00:00:00+08:00', {
          version: 12,
          note: 'echo-variant',
        }),
      )
    })

    await act(async () => {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve())
      })
    })

    const order = useOrderStore.getState().ordersById['a']
    expect(order?.version).toBe(12)
    expect(order?.note).toBe('authoritative-v12')
  })

  it('consolidates out-of-order upserts in one batch on the highest version', async () => {
    mocks.listOrders.mockResolvedValue([
      makeOrder('a', '2025-01-01T00:00:00+08:00', {
        version: 10,
        note: 'v10',
      }),
    ])

    renderHook(() => useOrderWorkspaceSync())
    const ws = subscriptionCallbacks!

    act(() => {
      ws.onSubscriptionStatus('SUBSCRIBED')
    })

    await act(async () => {
      await flushAsync()
    })

    // A newer update (v12) and a delayed stale one (v11) arrive in the same
    // batch; the flush must apply only the highest version.
    act(() => {
      ws.onUpsert(
        makeOrder('a', '2025-01-01T00:00:00+08:00', {
          version: 12,
          note: 'v12',
        }),
      )
      ws.onUpsert(
        makeOrder('a', '2025-01-01T00:00:00+08:00', {
          version: 11,
          note: 'v11-delayed',
        }),
      )
    })

    await act(async () => {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve())
      })
    })

    const order = useOrderStore.getState().ordersById['a']
    expect(order?.version).toBe(12)
    expect(order?.note).toBe('v12')
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

  it('reconciles against a fresh snapshot when a resync is requested (409 recovery)', async () => {
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

    // A mutation was rejected with 409 order_conflict elsewhere in the UI:
    // the resync request must refetch the authoritative snapshot and replay
    // buffered realtime events over it.
    act(() => {
      requestOrdersResync()
    })
    expect(mocks.listOrders).toHaveBeenCalledTimes(2)

    const orderB = makeOrder('b', '2025-01-02T00:00:00+08:00', { version: 3 })
    act(() => {
      ws.onUpsert(orderB)
    })

    await act(async () => {
      second.resolve([orderB])
      await flushAsync()
    })

    expect(useOrderStore.getState().ordersById['b']).toEqual(orderB)
    expect(useOrderStore.getState().status).toBe('ready')
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

  it('applies a higher-version realtime upsert while the mutation is still pending', async () => {
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

    // The user's mutation is still pending: the store holds the optimistic
    // copy at the pre-mutation server version (10).
    const optimisticA = makeOrder('a', '2025-01-01T00:00:00+08:00', {
      version: 10,
      note: 'optimistic',
    })
    act(() => {
      useOrderStore.getState().upsertOrder(optimisticA)
    })

    // Another client commits v12 while the mutation is pending: the realtime
    // event is authoritative and must win over the optimistic prediction,
    // even though the local HTTP response has not returned yet.
    act(() => {
      ws.onUpsert(
        makeOrder('a', '2025-01-01T00:00:00+08:00', {
          version: 12,
          note: 'remote-v12',
        }),
      )
    })

    await act(async () => {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve())
      })
    })

    const order = useOrderStore.getState().ordersById['a']
    expect(order?.version).toBe(12)
    expect(order?.note).toBe('remote-v12')
  })

  it('keeps the optimistic record when the realtime echo carries the same version while the mutation is pending', async () => {
    mocks.listOrders.mockResolvedValue([])

    renderHook(() => useOrderWorkspaceSync())
    const ws = subscriptionCallbacks!

    act(() => {
      ws.onSubscriptionStatus('SUBSCRIBED')
    })

    await act(async () => {
      await flushAsync()
    })

    const optimisticA = makeOrder('a', '2025-01-01T00:00:00+08:00', {
      version: 10,
      note: 'optimistic',
    })
    act(() => {
      useOrderStore.getState().upsertOrder(optimisticA)
    })

    // The echo of the pre-mutation server state (same version) must not
    // overwrite the optimistic prediction of the still-pending mutation.
    act(() => {
      ws.onUpsert(
        makeOrder('a', '2025-01-01T00:00:00+08:00', {
          version: 10,
          note: 'echo-v10',
        }),
      )
    })

    await act(async () => {
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve())
      })
    })

    expect(useOrderStore.getState().ordersById['a']?.note).toBe('optimistic')
  })

  it('lets a higher-version buffered event win over a still-pending optimistic mutation at snapshot commit', async () => {
    const snapshot = deferred<OrderRecord[]>()
    mocks.listOrders.mockReturnValue(snapshot.promise)
    mocks.idsToProtect.mockReturnValue(new Set(['a']))

    renderHook(() => useOrderWorkspaceSync())
    const ws = subscriptionCallbacks!

    act(() => {
      ws.onSubscriptionStatus('SUBSCRIBED')
    })

    const optimisticA = makeOrder('a', '2025-01-01T00:00:00+08:00', {
      version: 10,
      note: 'optimistic',
    })
    act(() => {
      useOrderStore.getState().upsertOrder(optimisticA)
    })

    // Another client commits v12 while the snapshot is in flight and the
    // mutation is still pending: the buffered event is authoritative state
    // the pending mutation's completion or rollback cannot supersede.
    act(() => {
      ws.onUpsert(
        makeOrder('a', '2025-01-01T00:00:00+08:00', {
          version: 12,
          note: 'remote-v12',
        }),
      )
    })

    await act(async () => {
      snapshot.resolve([
        makeOrder('a', '2025-01-01T00:00:00+08:00', {
          version: 10,
          note: 'stale-snapshot',
        }),
      ])
      await flushAsync()
    })

    const order = useOrderStore.getState().ordersById['a']
    expect(order?.version).toBe(12)
    expect(order?.note).toBe('remote-v12')
  })

  it('lets a higher-version buffered event win over a still-pending optimistic mutation when the snapshot fails', async () => {
    const snapshot = deferred<OrderRecord[]>()
    mocks.listOrders.mockReturnValue(snapshot.promise)

    renderHook(() => useOrderWorkspaceSync())
    const ws = subscriptionCallbacks!

    act(() => {
      ws.onSubscriptionStatus('SUBSCRIBED')
    })

    const optimisticA = makeOrder('a', '2025-01-01T00:00:00+08:00', {
      version: 10,
      note: 'optimistic',
    })
    act(() => {
      useOrderStore.getState().upsertOrder(optimisticA)
    })

    act(() => {
      ws.onUpsert(
        makeOrder('a', '2025-01-01T00:00:00+08:00', {
          version: 12,
          note: 'remote-v12',
        }),
      )
    })

    await act(async () => {
      snapshot.reject(new Error('Failed to fetch'))
      await flushAsync()
    })

    const order = useOrderStore.getState().ordersById['a']
    expect(order?.version).toBe(12)
    expect(order?.note).toBe('remote-v12')
  })
})
