import { describe, expect, it } from 'vitest'
import { DEFAULT_ORDER_FORM_VALUE, STEP_STATUS, type OrderRecord } from '@/types'
import {
  compareOrderRecordsByTimeline,
  sortOrdersByTimeline,
} from '@/services/orderSorting'

const makeOrder = (
  id: string,
  createdAt: string,
  displayNo: string | null = null,
): OrderRecord => ({
  ...DEFAULT_ORDER_FORM_VALUE,
  id,
  version: 1,
  displayNo,
  totalPriceCents: 1000,
  stapleStepStatusCode: STEP_STATUS.notStarted,
  meatStepStatusCode: STEP_STATUS.notStarted,
  createdAt,
  updatedAt: createdAt,
  completedAt: null,
})

describe('order timeline sorting', () => {
  it('orders records chronologically using their ISO offsets', () => {
    const older = makeOrder('older', '2026-01-01T23:30:00+08:00')
    const newer = makeOrder('newer', '2026-01-01T16:00:00Z')

    expect(sortOrdersByTimeline([older, newer]).map((order) => order.id)).toEqual([
      older.id,
      newer.id,
    ])
  })

  it('uses display number, derived number, and id as deterministic tie breakers', () => {
    const explicitB = makeOrder('explicit-b', '2026-01-01T10:00:00+08:00', 'B')
    const explicitA = makeOrder('explicit-a', '2026-01-01T10:00:00+08:00', 'A')
    const derived = makeOrder('202601010003', '2026-01-01T10:00:00+08:00')
    const fallback = makeOrder('ordinary-id', '2026-01-01T10:00:00+08:00')

    expect(
      sortOrdersByTimeline([fallback, explicitB, derived, explicitA]).map(
        (order) => order.id,
      ),
    ).toEqual([derived.id, explicitA.id, explicitB.id, fallback.id])
  })

  it('does not mutate the input array and falls back to id when display keys tie', () => {
    const first = makeOrder('order-a', '2026-01-01T10:00:00+08:00', 'same')
    const second = makeOrder('order-b', '2026-01-01T10:00:00+08:00', 'same')
    const input = [second, first]

    const sorted = sortOrdersByTimeline(input)

    expect(sorted.map((order) => order.id)).toEqual(['order-a', 'order-b'])
    expect(input.map((order) => order.id)).toEqual(['order-b', 'order-a'])
    expect(compareOrderRecordsByTimeline(first, second)).toBeLessThan(0)
  })
})
