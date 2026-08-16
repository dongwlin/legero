/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_ORDER_FORM_VALUE,
  STEP_STATUS,
  type OrderRecord,
} from '@/types'
import { useOrderStore } from './order'

const makeOrder = (
  id: string,
  version: number,
  note: string,
): OrderRecord => ({
  ...DEFAULT_ORDER_FORM_VALUE,
  id,
  version,
  displayNo: id,
  totalPriceCents: 1500,
  stapleStepStatusCode: STEP_STATUS.notStarted,
  meatStepStatusCode: STEP_STATUS.notStarted,
  createdAt: '2025-01-01T00:00:00+08:00',
  updatedAt: '2025-01-01T00:00:00+08:00',
  completedAt: null,
  note,
})

describe('order store authoritative merge', () => {
  beforeEach(() => {
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
  })

  it('upsertIfNewer applies only strictly higher versions', () => {
    useOrderStore.getState().upsertIfNewer(makeOrder('a', 10, 'v10'))
    expect(useOrderStore.getState().ordersById['a']?.note).toBe('v10')

    // An equal version is the same server commit: idempotent, no overwrite.
    useOrderStore.getState().upsertIfNewer(makeOrder('a', 10, 'echo-v10'))
    expect(useOrderStore.getState().ordersById['a']?.note).toBe('v10')

    // A higher version always wins.
    useOrderStore.getState().upsertIfNewer(makeOrder('a', 12, 'v12'))
    useOrderStore.getState().upsertIfNewer(makeOrder('a', 11, 'v11-stale'))
    expect(useOrderStore.getState().ordersById['a']?.version).toBe(12)
    expect(useOrderStore.getState().ordersById['a']?.note).toBe('v12')
  })

  it('upsertIfNewer inserts records absent from the store', () => {
    useOrderStore.getState().upsertIfNewer(makeOrder('a', 3, 'fresh'))
    const order = useOrderStore.getState().ordersById['a']
    expect(order?.version).toBe(3)
    expect(order?.note).toBe('fresh')
  })

  it('upsertOrdersIfNewer consolidates a batch on the highest version', () => {
    useOrderStore.getState().upsertOrdersIfNewer([
      makeOrder('b', 7, 'b-v7'),
      // Deliberately out of order: the higher version must win regardless of
      // arrival order within the batch.
      makeOrder('a', 12, 'a-v12'),
      makeOrder('a', 11, 'a-v11'),
    ])

    const { ordersById } = useOrderStore.getState()
    expect(ordersById['a']?.version).toBe(12)
    expect(ordersById['a']?.note).toBe('a-v12')
    expect(ordersById['b']?.version).toBe(7)

    // A stale batch against the store is ignored.
    useOrderStore.getState().upsertOrdersIfNewer([
      makeOrder('a', 10, 'a-stale'),
    ])
    expect(useOrderStore.getState().ordersById['a']?.note).toBe('a-v12')
  })
})