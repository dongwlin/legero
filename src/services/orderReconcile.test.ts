import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { describe, expect, it } from 'vitest'
import { DEFAULT_ORDER_FORM_VALUE, STEP_STATUS, type OrderRecord } from '@/types'

dayjs.extend(utc)
dayjs.extend(timezone)
import {
  applyLocalMutationEffects,
  compactRealtimeEvents,
  createOrderEventBuffer,
  isNewerOrder,
  pickLatestOrder,
  reconcileSnapshotWithEvents,
  type RealtimeOrderEvent,
} from './orderReconcile'
import type { LocalMutationEffect } from './orderOptimistic'

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

const upsert = (id: string, note?: string): RealtimeOrderEvent => ({
  type: 'upsert',
  order: makeOrder(id, '2025-01-01T00:00:00+08:00', note ? { note } : {}),
})

const upsertVersion = (
  id: string,
  version: number,
  note?: string,
): RealtimeOrderEvent => ({
  type: 'upsert',
  order: makeOrder(id, '2025-01-01T00:00:00+08:00', {
    version,
    ...(note ? { note } : {}),
  }),
})

const remove = (id: string): RealtimeOrderEvent => ({ type: 'remove', id })

const clearAll: RealtimeOrderEvent = { type: 'clear', mode: 'all' }
const clearBeforeToday: RealtimeOrderEvent = { type: 'clear', mode: 'before_today' }

// The current calendar day in the business timezone (Asia/Shanghai), as the
// server's before_today clear boundary uses the same definition.
const todayKeyInShanghai = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())

const todayOrder = (id: string, overrides: Partial<OrderRecord> = {}): OrderRecord =>
  makeOrder(id, `${todayKeyInShanghai()}T10:00:00+08:00`, overrides)

const yesterdayOrder = (id: string, overrides: Partial<OrderRecord> = {}): OrderRecord =>
  makeOrder(id, '2025-01-01T10:00:00+08:00', overrides)

describe('compactRealtimeEvents', () => {
  it('drops earlier duplicate upserts, keeping the newest per id', () => {
    expect(
      compactRealtimeEvents([upsertVersion('a', 1, 'v1'), upsertVersion('a', 2, 'v2')]),
    ).toEqual([upsertVersion('a', 2, 'v2')])
  })

  it('keeps the highest version even when an older event arrives later', () => {
    expect(
      compactRealtimeEvents([
        upsertVersion('a', 12, 'v12'),
        upsertVersion('a', 11, 'v11-delayed'),
      ]),
    ).toEqual([upsertVersion('a', 12, 'v12')])
  })

  it('collapses duplicate upserts with the same version as idempotent', () => {
    expect(
      compactRealtimeEvents([
        upsertVersion('a', 11, 'first'),
        upsertVersion('a', 11, 'echo'),
      ]),
    ).toEqual([upsertVersion('a', 11, 'first')])
  })

  it('lets a trailing remove win over an earlier upsert of the same id', () => {
    expect(compactRealtimeEvents([upsert('a'), remove('a')])).toEqual([remove('a')])
  })

  it('lets a trailing upsert win over an earlier remove of the same id', () => {
    expect(compactRealtimeEvents([remove('a'), upsert('a', 'v1')])).toEqual([
      upsert('a', 'v1'),
    ])
  })

  it('does not let a stale upsert resurrect an order removed after an upsert', () => {
    expect(
      compactRealtimeEvents([
        upsertVersion('a', 13, 'v13'),
        remove('a'),
        upsertVersion('a', 12, 'v12-delayed'),
      ]),
    ).toEqual([remove('a')])
  })

  it('preserves the relative order of surviving events for distinct ids', () => {
    expect(
      compactRealtimeEvents([
        upsertVersion('a', 1, 'v1'),
        remove('b'),
        upsertVersion('a', 2, 'v2'),
        upsert('c'),
      ]),
    ).toEqual([remove('b'), upsertVersion('a', 2, 'v2'), upsert('c')])
  })

  it('drops everything before the last full clear but keeps the clear itself', () => {
    expect(
      compactRealtimeEvents([
        upsert('a'),
        clearAll,
        upsert('b'),
        remove('c'),
      ]),
    ).toEqual([clearAll, upsert('b'), remove('c')])
  })

  it('keeps only the latest clear and the events after it', () => {
    expect(
      compactRealtimeEvents([upsert('a'), clearAll, upsert('b'), clearAll, upsert('c')]),
    ).toEqual([clearAll, upsert('c')])
  })

  it('returns an empty list for no events and a lone clear for a trailing clear', () => {
    expect(compactRealtimeEvents([])).toEqual([])
    expect(compactRealtimeEvents([upsert('a'), clearAll])).toEqual([clearAll])
  })

  it('keeps events before a before_today clear (they may touch today orders)', () => {
    expect(
      compactRealtimeEvents([upsert('a'), clearBeforeToday, upsert('b')]),
    ).toEqual([upsert('a'), clearBeforeToday, upsert('b')])
  })

  it('keeps a trailing before_today clear', () => {
    expect(compactRealtimeEvents([upsert('a'), clearBeforeToday])).toEqual([
      upsert('a'),
      clearBeforeToday,
    ])
  })

  it('only a full clear makes earlier events moot, not a before_today clear', () => {
    expect(
      compactRealtimeEvents([
        upsert('a'),
        clearBeforeToday,
        upsert('b'),
        clearAll,
        upsert('c'),
      ]),
    ).toEqual([clearAll, upsert('c')])
  })
})

describe('reconcileSnapshotWithEvents', () => {
  it('returns the snapshot untouched when no events were buffered', () => {
    const snapshot = [makeOrder('a', '2025-01-01T00:00:00+08:00')]

    expect(reconcileSnapshotWithEvents(snapshot, [])).toEqual(snapshot)
  })

  it('overlays buffered upserts on the snapshot, adding new orders', () => {
    const snapshot = [makeOrder('a', '2025-01-01T00:00:00+08:00')]
    const updated = makeOrder('a', '2025-01-01T00:00:00+08:00', {
      version: 2,
      note: 'newer',
    })
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

  it('does not let a stale buffered upsert downgrade a newer snapshot record', () => {
    const snapshot = [
      makeOrder('a', '2025-01-01T00:00:00+08:00', {
        version: 13,
        note: 'snapshot-v13',
      }),
    ]

    const result = reconcileSnapshotWithEvents(snapshot, [
      upsertVersion('a', 12, 'stale-v12'),
    ])

    expect(result).toEqual(snapshot)
  })

  it('overlays a buffered upsert with a strictly higher version than the snapshot', () => {
    const snapshot = [
      makeOrder('a', '2025-01-01T00:00:00+08:00', { version: 10 }),
    ]

    const result = reconcileSnapshotWithEvents(snapshot, [
      upsertVersion('a', 12, 'remote-v12'),
    ])

    expect(result).toEqual([makeOrder('a', '2025-01-01T00:00:00+08:00', { version: 12, note: 'remote-v12' })])
  })

  it('applies a full clear over the snapshot and keeps only later events', () => {
    const snapshot = [
      makeOrder('a', '2025-01-01T00:00:00+08:00'),
      makeOrder('b', '2025-01-02T00:00:00+08:00'),
    ]
    const recreated = makeOrder('a', '2025-01-04T00:00:00+08:00')

    const result = reconcileSnapshotWithEvents(snapshot, [
      upsert('b'),
      clearAll,
      { type: 'upsert', order: recreated },
    ])

    expect(result).toEqual([recreated])
  })

  it('a before_today clear drops only orders created before today', () => {
    const snapshot = [todayOrder('today'), yesterdayOrder('yesterday')]

    const result = reconcileSnapshotWithEvents(snapshot, [clearBeforeToday])

    expect(result).toEqual([snapshot[0]])
  })

  it('a before_today clear keeps newer upserts of today orders received before it', () => {
    const updated = todayOrder('a', { note: 'v2' })

    const result = reconcileSnapshotWithEvents(
      [todayOrder('a'), yesterdayOrder('b')],
      [
        { type: 'upsert', order: updated },
        clearBeforeToday,
      ],
    )

    expect(result).toEqual([updated])
  })

  it('a before_today clear after a full clear keeps only post-clear events', () => {
    const result = reconcileSnapshotWithEvents(
      [todayOrder('a'), yesterdayOrder('b')],
      [clearAll, clearBeforeToday],
    )

    expect(result).toEqual([])
  })
})

describe('version ordering primitives', () => {
  it('isNewerOrder compares exclusively by version', () => {
    const older = makeOrder('a', '2025-01-01T00:00:00+08:00', { version: 10 })
    const newer = makeOrder('a', '2025-01-01T00:00:00+08:00', { version: 11 })

    expect(isNewerOrder(newer, older)).toBe(true)
    expect(isNewerOrder(older, newer)).toBe(false)
    expect(isNewerOrder(newer, { ...newer })).toBe(false)
  })

  it('pickLatestOrder returns the higher-version order', () => {
    const older = makeOrder('a', '2025-01-01T00:00:00+08:00', { version: 5 })
    const newer = makeOrder('a', '2025-01-01T00:00:00+08:00', { version: 9 })

    expect(pickLatestOrder(older, newer)).toBe(newer)
    expect(pickLatestOrder(newer, older)).toBe(newer)
  })

  it('same-second updatedAt cannot compete with versions: higher version wins', () => {
    // Both records share the identical updatedAt (the race timestamps could
    // not distinguish); only version can order them.
    const sharedUpdatedAt = '2026-08-16T14:20:30+08:00'
    const local = makeOrder('a', '2025-01-01T00:00:00+08:00', {
      version: 11,
      updatedAt: sharedUpdatedAt,
      note: 'local',
    })
    const remote = makeOrder('a', '2025-01-01T00:00:00+08:00', {
      version: 12,
      updatedAt: sharedUpdatedAt,
      note: 'remote',
    })

    expect(isNewerOrder(remote, local)).toBe(true)
    expect(pickLatestOrder(local, remote)).toBe(remote)
  })

  it('an equal version is idempotent under pickLatestOrder', () => {
    const a = makeOrder('a', '2025-01-01T00:00:00+08:00', { version: 12 })
    const b = { ...a, note: 'echo' }

    expect(pickLatestOrder(a, b)).toBe(a)
    expect(pickLatestOrder(b, a)).toBe(b)
  })
})

describe('applyLocalMutationEffects', () => {
  const effect = (
    order: OrderRecord,
    seq = 1,
  ): LocalMutationEffect => ({ type: 'upsert', order, seq })
  const removeEffect = (id: string, seq = 1): LocalMutationEffect => ({
    type: 'remove',
    id,
    seq,
  })

  it('applies a confirmed upsert over a stale snapshot record', () => {
    const snapshot = [
      makeOrder('a', '2025-01-01T00:00:00+08:00', { version: 10 }),
    ]

    const result = applyLocalMutationEffects(snapshot, [
      effect(
        makeOrder('a', '2025-01-01T00:00:00+08:00', {
          version: 11,
          note: 'confirmed-update',
        }),
      ),
    ])

    expect(result).toEqual([
      makeOrder('a', '2025-01-01T00:00:00+08:00', {
        version: 11,
        note: 'confirmed-update',
      }),
    ])
  })

  it('adds an order the snapshot does not contain (confirmed create)', () => {
    const snapshot = [
      makeOrder('a', '2025-01-01T00:00:00+08:00'),
      makeOrder('b', '2025-01-02T00:00:00+08:00'),
    ]
    const created = makeOrder('c', '2025-01-03T00:00:00+08:00', {
      note: 'confirmed-create',
    })

    expect(applyLocalMutationEffects(snapshot, [effect(created)])).toEqual([
      ...snapshot,
      created,
    ])
  })

  it('does not apply an upsert effect when the snapshot record is strictly newer', () => {
    const snapshot = [
      makeOrder('a', '2025-01-01T00:00:00+08:00', {
        version: 12,
        note: 'snapshot-v12',
      }),
    ]

    const result = applyLocalMutationEffects(snapshot, [
      effect(
        makeOrder('a', '2025-01-01T00:00:00+08:00', {
          version: 11,
          note: 'stale-effect',
        }),
      ),
    ])

    expect(result).toEqual(snapshot)
  })

  it('treats an equal-version effect as the same server commit (idempotent)', () => {
    const result = applyLocalMutationEffects(
      [
        makeOrder('a', '2025-01-01T00:00:00+08:00', {
          version: 11,
          note: 'snapshot',
        }),
      ],
      [
        effect(
          makeOrder('a', '2025-01-01T00:00:00+08:00', {
            version: 11,
            note: 'echo',
          }),
        ),
      ],
    )

    expect(result[0]?.version).toBe(11)
  })

  it('keeps a confirmed delete absent even when the snapshot still contains the order', () => {
    const snapshot = [
      makeOrder('a', '2025-01-01T00:00:00+08:00', { version: 10 }),
    ]

    expect(applyLocalMutationEffects(snapshot, [removeEffect('a')])).toEqual([])
  })

  it('applies a mix of confirmed upserts and removes', () => {
    const snapshot = [
      makeOrder('a', '2025-01-01T00:00:00+08:00', { version: 9 }),
      makeOrder('b', '2025-01-02T00:00:00+08:00', { version: 9 }),
    ]
    const created = makeOrder('c', '2025-01-03T00:00:00+08:00')

    const result = applyLocalMutationEffects(snapshot, [
      removeEffect('b'),
      effect(
        makeOrder('a', '2025-01-01T00:00:00+08:00', {
          version: 10,
          note: 'updated',
        }),
      ),
      effect(created),
    ])

    expect(result.map((order) => order.id).sort()).toEqual(['a', 'c'])
    expect(result.find((order) => order.id === 'a')?.version).toBe(10)
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
    buffer.push(upsertVersion('a', 2, 'v2'))

    expect(buffer.isReconciling).toBe(true)
    expect(buffer.endReconciliation()).toEqual([remove('b'), upsertVersion('a', 2, 'v2')])
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