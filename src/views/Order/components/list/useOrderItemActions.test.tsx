/* @vitest-environment jsdom */

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/services/apiClient'
import { orderOptimistic } from '@/services/orderOptimistic'
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
})