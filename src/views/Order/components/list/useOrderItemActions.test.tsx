/* @vitest-environment jsdom */

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/services/apiClient'
import { orderOptimistic } from '@/services/orderOptimistic'
import { orderTombstones } from '@/services/orderTombstones'
import { subscribeOrdersResync } from '@/services/orderResync'
import { useOrderStore } from '@/store/order'
import {
  DEFAULT_ORDER_FORM_VALUE,
  STEP_STATUS,
  type OrderRecord,
} from '@/types'
import { useOrderItemActions } from './useOrderItemActions'

const mocks = vi.hoisted(() => ({
  toggleStep: vi.fn(),
  toggleServed: vi.fn(),
  remove: vi.fn(),
}))

vi.mock('@/services/orderRepository', () => ({
  orderRepository: {
    toggleStep: mocks.toggleStep,
    toggleServed: mocks.toggleServed,
    remove: mocks.remove,
  },
}))

const makeOrder = (
  id: string,
  overrides: Partial<OrderRecord> = {},
): OrderRecord => ({
  ...DEFAULT_ORDER_FORM_VALUE,
  id,
  version: 1,
  displayNo: id,
  totalPriceCents: 1500,
  stapleStepStatusCode: STEP_STATUS.notStarted,
  meatStepStatusCode: STEP_STATUS.notStarted,
  createdAt: '2025-01-01T00:00:00+08:00',
  updatedAt: '2025-01-01T00:00:00+08:00',
  completedAt: null,
  ...overrides,
})

const flushAsync = async () => {
  for (let i = 0; i < 50; i += 1) {
    await Promise.resolve()
  }
}

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const resetStores = () => {
  localStorage.clear()
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

describe('useOrderItemActions optimistic mutations', () => {
  beforeEach(() => {
    resetStores()
    orderTombstones.reset()
    mocks.toggleStep.mockReset()
    mocks.toggleServed.mockReset()
    mocks.remove.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('applies the toggle optimistically without bumping the version and sends expectedVersion', async () => {
    const record = makeOrder('a', { version: 5, note: 'original' })
    useOrderStore.getState().upsertOrder(record)

    const serverRecord = makeOrder('a', {
      version: 6,
      note: 'server-after-toggle',
      stapleStepStatusCode: STEP_STATUS.completed,
    })
    mocks.toggleStep.mockResolvedValue(serverRecord)

    const { result } = renderHook(() => useOrderItemActions(record))

    act(() => {
      result.current.handleToggleStapleStep()
    })

    // The optimistic copy keeps the pre-mutation server version: the client
    // must not claim a version only the server can mint.
    const optimistic = useOrderStore.getState().ordersById['a']
    expect(optimistic?.version).toBe(5)
    expect(optimistic?.stapleStepStatusCode).toBe(STEP_STATUS.completed)

    expect(mocks.toggleStep).toHaveBeenCalledWith('a', 'staple', 5)

    await act(async () => {
      await flushAsync()
    })

    // The mutation response is authoritative: the full server record,
    // including the new version, replaces the optimistic copy.
    expect(useOrderStore.getState().ordersById['a']).toEqual(serverRecord)
    expect(orderOptimistic.hasPending('a')).toBe(false)
  })

  it('sends expectedVersion for served toggles', async () => {
    const record = makeOrder('a', {
      version: 9,
      stapleStepStatusCode: STEP_STATUS.completed,
      meatStepStatusCode: STEP_STATUS.completed,
    })
    useOrderStore.getState().upsertOrder(record)

    const serverRecord = makeOrder('a', {
      version: 10,
      stapleStepStatusCode: STEP_STATUS.completed,
      meatStepStatusCode: STEP_STATUS.completed,
      completedAt: '2025-01-01T00:01:00+08:00',
    })
    mocks.toggleServed.mockResolvedValue(serverRecord)

    const { result } = renderHook(() => useOrderItemActions(record))

    act(() => {
      result.current.handleServeMeal()
    })

    expect(mocks.toggleServed).toHaveBeenCalledWith('a', 9)

    await act(async () => {
      await flushAsync()
    })

    expect(useOrderStore.getState().ordersById['a']).toEqual(serverRecord)
  })

  it('rolls back and requests an authoritative resync on 409 order_conflict', async () => {
    const record = makeOrder('a', { version: 7, note: 'original' })
    useOrderStore.getState().upsertOrder(record)

    mocks.toggleStep.mockRejectedValue(
      new ApiError(409, 'order_conflict', '订单已被其他操作修改。'),
    )

    const resync = vi.fn()
    const stopResync = subscribeOrdersResync(resync)

    const { result } = renderHook(() => useOrderItemActions(record))

    act(() => {
      result.current.handleToggleMeatStep()
    })

    await act(async () => {
      await flushAsync()
    })

    // The stale optimistic state is gone and the pending marker cleared; the
    // conflict triggers a refetch of the authoritative state instead of a
    // blind retry of the same expectedVersion.
    expect(useOrderStore.getState().ordersById['a']).toEqual(record)
    expect(orderOptimistic.hasPending('a')).toBe(false)
    expect(resync).toHaveBeenCalledTimes(1)
    expect(result.current.mutationError).toBe('订单已被其他操作修改。')

    stopResync()
  })

  it('rolls back on a generic failure without requesting a resync', async () => {
    const record = makeOrder('a', { version: 7, note: 'original' })
    useOrderStore.getState().upsertOrder(record)

    mocks.toggleStep.mockRejectedValue(new Error('Failed to fetch'))

    const resync = vi.fn()
    const stopResync = subscribeOrdersResync(resync)

    const { result } = renderHook(() => useOrderItemActions(record))

    act(() => {
      result.current.handleToggleMeatStep()
    })

    await act(async () => {
      await flushAsync()
    })

    expect(useOrderStore.getState().ordersById['a']).toEqual(record)
    expect(orderOptimistic.hasPending('a')).toBe(false)
    expect(resync).not.toHaveBeenCalled()
    expect(result.current.mutationError).toBe('Failed to fetch')

    stopResync()
  })

  it('journals a confirmed toggle as an authoritative upsert effect', async () => {
    const record = makeOrder('a', { version: 5, note: 'original' })
    useOrderStore.getState().upsertOrder(record)

    const marker = orderOptimistic.captureSnapshotMarker()

    const serverRecord = makeOrder('a', {
      version: 6,
      note: 'server-after-toggle',
      stapleStepStatusCode: STEP_STATUS.completed,
    })
    mocks.toggleStep.mockResolvedValue(serverRecord)

    const { result } = renderHook(() => useOrderItemActions(record))

    act(() => {
      result.current.handleToggleStapleStep()
    })

    await act(async () => {
      await flushAsync()
    })

    // A snapshot that overlaps this mutation can replay the confirmed result
    // even when the WS echo has not arrived yet.
    expect(orderOptimistic.effectsAfter(marker)).toEqual([
      { type: 'upsert', order: serverRecord, seq: expect.any(Number) },
    ])
  })

  it('journals a confirmed delete as a remove effect', async () => {
    const record = makeOrder('a', { version: 5, note: 'original' })
    useOrderStore.getState().upsertOrder(record)

    const marker = orderOptimistic.captureSnapshotMarker()
    mocks.remove.mockResolvedValue(undefined)

    const { result } = renderHook(() => useOrderItemActions(record))

    act(() => {
      void result.current.handleRemove()
    })

    await act(async () => {
      await flushAsync()
    })

    expect(useOrderStore.getState().ordersById['a']).toBeUndefined()

    // A snapshot that overlaps this delete cannot resurrect the order.
    expect(orderOptimistic.effectsAfter(marker)).toEqual([
      { type: 'remove', id: 'a', seq: expect.any(Number) },
    ])

    // The same delete registers the session-wide terminal tombstone, so the
    // normal realtime path (outside any reconciliation) cannot resurrect the
    // id with a delayed upsert either.
    expect(orderTombstones.has('a')).toBe(true)
  })

  it('does not let a late mutation response downgrade a newer realtime state', async () => {
    const record = makeOrder('a', { version: 10, note: 'original' })
    useOrderStore.getState().upsertOrder(record)

    const pendingResponse = deferred<OrderRecord>()
    mocks.toggleStep.mockReturnValue(pendingResponse.promise)

    const { result } = renderHook(() => useOrderItemActions(record))

    act(() => {
      result.current.handleToggleStapleStep()
    })

    // The store holds the optimistic copy (v10) while the mutation is in
    // flight; another client commits v12 and the realtime channel applies it.
    act(() => {
      useOrderStore.getState().upsertOrder(
        makeOrder('a', { version: 12, note: 'remote-v12' }),
      )
    })

    // Our own HTTP response (v11) settles later: the authoritative merge
    // must not downgrade the store back to v11.
    await act(async () => {
      pendingResponse.resolve(
        makeOrder('a', {
          version: 11,
          note: 'local-v11',
          stapleStepStatusCode: STEP_STATUS.completed,
        }),
      )
      await flushAsync()
    })

    const order = useOrderStore.getState().ordersById['a']
    expect(order?.version).toBe(12)
    expect(order?.note).toBe('remote-v12')
    expect(orderOptimistic.hasPending('a')).toBe(false)
  })

  it('does not let a conflict rollback downgrade a newer realtime state', async () => {
    const record = makeOrder('a', { version: 10, note: 'original' })
    useOrderStore.getState().upsertOrder(record)

    mocks.toggleStep.mockRejectedValue(
      new ApiError(409, 'order_conflict', '订单已被其他操作修改。'),
    )

    const resync = vi.fn()
    const stopResync = subscribeOrdersResync(resync)

    const { result } = renderHook(() => useOrderItemActions(record))

    act(() => {
      result.current.handleToggleStapleStep()
    })

    // Another client commits v11 while the mutation is in flight: the
    // authoritative realtime state must survive the rollback of the stale
    // optimistic copy (v10).
    act(() => {
      useOrderStore.getState().upsertOrder(
        makeOrder('a', { version: 11, note: 'remote-v11' }),
      )
    })

    await act(async () => {
      await flushAsync()
    })

    const order = useOrderStore.getState().ordersById['a']
    expect(order?.version).toBe(11)
    expect(order?.note).toBe('remote-v11')
    expect(orderOptimistic.hasPending('a')).toBe(false)
    expect(resync).toHaveBeenCalledTimes(1)
    expect(result.current.mutationError).toBe('订单已被其他操作修改。')

    stopResync()
  })
})