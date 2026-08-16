import { describe, expect, it } from 'vitest'
import { DEFAULT_ORDER_FORM_VALUE, STEP_STATUS, type OrderRecord } from '@/types'
import {
  compactRealtimeEvents,
  createOrderEventBuffer,
  reconcileSnapshotWithEvents,
  type RealtimeOrderEvent,
} from './orderReconcile'

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

const upsert = (id: string, note?: string): RealtimeOrderEvent => ({
  type: 'upsert',
  order: makeOrder(id, '2025-01-01T00:00:00+08:00', note ? { note } : {}),
})

const remove = (id: string): RealtimeOrderEvent => ({ type: 'remove', id })

const clear: RealtimeOrderEvent = { type: 'clear' }

describe('compactRealtimeEvents', () => {
  it('drops earlier duplicate upserts, keeping the newest per id', () => {
    expect(compactRealtimeEvents([upsert('a', 'v1'), upsert('a', 'v2')])).toEqual([
      upsert('a', 'v2'),
    ])
  })

  it('lets a trailing remove win over an earlier upsert of the same id', () => {
    expect(compactRealtimeEvents([upsert('a'), remove('a')])).toEqual([remove('a')])
  })

  it('lets a trailing upsert win over an earlier remove of the same id', () => {
    expect(compactRealtimeEvents([remove('a'), upsert('a', 'v1')])).toEqual([
      upsert('a', 'v1'),
    ])
  })

  it('preserves the relative order of surviving events for distinct ids', () => {
    expect(
      compactRealtimeEvents([
        upsert('a', 'v1'),
        remove('b'),
        upsert('a', 'v2'),
        upsert('c'),
      ]),
    ).toEqual([remove('b'), upsert('a', 'v2'), upsert('c')])
  })

  it('drops everything before the last clear but keeps the clear itself', () => {
    expect(
      compactRealtimeEvents([
        upsert('a'),
        clear,
        upsert('b'),
        remove('c'),
      ]),
    ).toEqual([clear, upsert('b'), remove('c')])
  })

  it('keeps only the latest clear and the events after it', () => {
    expect(
      compactRealtimeEvents([upsert('a'), clear, upsert('b'), clear, upsert('c')]),
    ).toEqual([clear, upsert('c')])
  })

  it('returns an empty list for no events and a lone clear for a trailing clear', () => {
    expect(compactRealtimeEvents([])).toEqual([])
    expect(compactRealtimeEvents([upsert('a'), clear])).toEqual([clear])
  })
})

describe('reconcileSnapshotWithEvents', () => {
  it('returns the snapshot untouched when no events were buffered', () => {
    const snapshot = [makeOrder('a', '2025-01-01T00:00:00+08:00')]

    expect(reconcileSnapshotWithEvents(snapshot, [])).toEqual(snapshot)
  })

  it('overlays buffered upserts on the snapshot, adding new orders', () => {
    const snapshot = [makeOrder('a', '2025-01-01T00:00:00+08:00')]
    const updated = makeOrder('a', '2025-01-01T00:00:00+08:00', { note: 'newer' })
    const created = makeOrder('b', '2025-01-02T00:00:00+08:00')

    const result = reconcileSnapshotWithEvents(snapshot, [
      upsert('a'),
      { type: 'upsert', order: updated },
      { type: 'upsert', order: created },
    ])

    expect(result.map((order) => order.id).sort()).toEqual(['a', 'b'])
    expect(result.find((order) => order.id === 'a')?.note).toBe('newer')
    expect(result.find((order) => order.id === 'b')).toEqual(created)
  })

  it('removes snapshot orders deleted while the snapshot was in flight', () => {
    const snapshot = [
      makeOrder('a', '2025-01-01T00:00:00+08:00'),
      makeOrder('b', '2025-01-02T00:00:00+08:00'),
    ]

    expect(reconcileSnapshotWithEvents(snapshot, [remove('a')])).toEqual([
      snapshot[1]
    ])
  })

  it('resolves the issue race: snapshot cannot clobber events received during the fetch', () => {
    const snapshot = [
      makeOrder('a', '2025-01-01T00:00:00+08:00'),
      makeOrder('c', '2025-01-03T00:00:00+08:00'),
    ]
    const created = makeOrder('b', '2025-01-02T00:00:00+08:00')

    const result = reconcileSnapshotWithEvents(snapshot, [
      { type: 'upsert', order: created },
      remove('a'),
    ])

    expect(result.map((order) => order.id).sort()).toEqual(['b', 'c'])
  })

  it('applies a clear over the snapshot and keeps only later events', () => {
    const snapshot = [
      makeOrder('a', '2025-01-01T00:00:00+08:00'),
      makeOrder('b', '2025-01-02T00:00:00+08:00'),
    ]
    const recreated = makeOrder('a', '2025-01-04T00:00:00+08:00')

    const result = reconcileSnapshotWithEvents(snapshot, [
      upsert('b'),
      clear,
      { type: 'upsert', order: recreated },
    ])

    expect(result).toEqual([recreated])
  })
})

describe('createOrderEventBuffer', () => {
  it('drops events pushed outside a reconciliation', () => {
    const buffer = createOrderEventBuffer()

    buffer.push(upsert('a'))

    expect(buffer.endReconciliation()).toEqual([])
  })

  it('buffers events in arrival order and returns them compacted on end', () => {
    const buffer = createOrderEventBuffer()

    buffer.beginReconciliation()
    buffer.push(upsert('a', 'v1'))
    buffer.push(remove('b'))
    buffer.push(upsert('a', 'v2'))

    expect(buffer.isReconciling).toBe(true)
    expect(buffer.endReconciliation()).toEqual([remove('b'), upsert('a', 'v2')])
    expect(buffer.isReconciling).toBe(false)
  })

  it('resets the buffer on begin, discarding the previous reconciliation', () => {
    const buffer = createOrderEventBuffer()

    buffer.beginReconciliation()
    buffer.push(upsert('a'))
    buffer.endReconciliation()

    buffer.beginReconciliation()
    buffer.push(remove('b'))

    expect(buffer.endReconciliation()).toEqual([remove('b')])
  })
})
