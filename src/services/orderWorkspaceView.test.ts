import dayjs from 'dayjs'
import { describe, expect, it, vi } from 'vitest'
import { countTodayOrders, selectTodayOrderIds } from '@/services/orderWorkspaceView'
import { DEFAULT_ORDER_FORM_VALUE, STEP_STATUS, type OrderRecord } from '@/types'

const makeOrder = (
  id: string,
  createdAt: string,
  completedAt: string | null = null,
): OrderRecord => ({
  ...DEFAULT_ORDER_FORM_VALUE,
  id,
  version: 1,
  displayNo: id,
  totalPriceCents: 1500,
  stapleStepStatusCode: STEP_STATUS.completed,
  meatStepStatusCode: STEP_STATUS.completed,
  createdAt,
  updatedAt: createdAt,
  completedAt,
})

describe('order workspace view', () => {
  const orders = [
    makeOrder('yesterday', '2026-10-14T15:59:59.999Z'),
    makeOrder('start', '2026-10-14T16:00:00.000Z'),
    makeOrder('early', '2026-10-15T09:00:00+08:00', '2026-10-15T10:00:00+08:00'),
    makeOrder('late', '2026-10-15T18:00:00+09:00', '2026-10-15T12:00:00+08:00'),
    makeOrder('end', '2026-10-15T15:59:59.999Z'),
    makeOrder('tomorrow', '2026-10-15T16:00:00.000Z'),
    makeOrder('invalid', 'invalid'),
  ]
  const ordersById = Object.fromEntries(orders.map((order) => [order.id, order]))
  const ids = orders.map((order) => order.id)
  const referenceTime = '2026-10-15T12:00:00+08:00'

  it('uses a Shanghai business day and preserves timeline order for all and uncompleted', () => {
    expect(selectTodayOrderIds(ordersById, ids, 'all', referenceTime)).toEqual([
      'start', 'early', 'late', 'end',
    ])
    expect(selectTodayOrderIds(ordersById, ids, 'uncompleted', referenceTime)).toEqual([
      'start', 'end',
    ])
    expect(countTodayOrders(ordersById, ids, referenceTime)).toEqual({
      todayCompletedCount: 2,
      uncompletedCount: 2,
    })
  })

  it('sorts completed orders by completion time without changing the source IDs', () => {
    expect(selectTodayOrderIds(ordersById, ids, 'completed', referenceTime)).toEqual([
      'late', 'early',
    ])
    expect(ids).toEqual(orders.map((order) => order.id))
  })

  it('recomputes membership at business midnight with the same order objects', () => {
    expect(selectTodayOrderIds(ordersById, ids, 'all', '2026-10-15T16:00:00Z')).toEqual([
      'tomorrow',
    ])
    expect(countTodayOrders(ordersById, ids, '2026-10-15T16:00:00Z')).toEqual({
      todayCompletedCount: 0,
      uncompletedCount: 1,
    })
  })

  it('reflects optimistic and authoritative progress updates without changing date membership', () => {
    const updated = {
      ...ordersById,
      start: { ...ordersById.start, completedAt: referenceTime, version: 2 },
    }
    expect(selectTodayOrderIds(updated, ids, 'uncompleted', referenceTime)).toEqual(['end'])
    expect(countTodayOrders(updated, ids, referenceTime)).toEqual({
      todayCompletedCount: 3,
      uncompletedCount: 1,
    })
    expect(countTodayOrders({}, [], referenceTime)).toEqual({
      todayCompletedCount: 0,
      uncompletedCount: 0,
    })
  })

  it('keeps timezone conversion work constant as history grows', () => {
    const tz = vi.spyOn(dayjs.prototype, 'tz')
    selectTodayOrderIds(ordersById, ids, 'all', referenceTime)
    countTodayOrders(ordersById, ids, referenceTime)
    const smallHistoryConversions = tz.mock.calls.length
    tz.mockClear()

    const historicalOrders = Array.from({ length: 520 }, (_, index) =>
      makeOrder(`history-${index}`, '2026-10-14T09:00:00+08:00'),
    )
    const largeOrdersById = {
      ...ordersById,
      ...Object.fromEntries(historicalOrders.map((order) => [order.id, order])),
    }
    const largeIds = [...historicalOrders.map((order) => order.id), ...ids]

    expect(selectTodayOrderIds(largeOrdersById, largeIds, 'all', referenceTime)).toEqual([
      'start', 'early', 'late', 'end',
    ])
    expect(countTodayOrders(largeOrdersById, largeIds, referenceTime)).toEqual({
      todayCompletedCount: 2,
      uncompletedCount: 2,
    })
    expect(smallHistoryConversions).toBeGreaterThan(0)
    expect(tz.mock.calls.length).toBe(smallHistoryConversions)
  })
})
