import { describe, expect, it } from 'vitest'
import { DEFAULT_ORDER_FORM_VALUE, STEP_STATUS, type OrderRecord } from '@/types'
import { orderOptimistic } from './orderOptimistic'

const makeOrder = (id: string, overrides: Partial<OrderRecord> = {}): OrderRecord => ({
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

describe('orderOptimistic snapshot markers', () => {
  it('protects ids pending at the snapshot start even if the mutation completes during the snapshot', () => {
    const generation = orderOptimistic.beginMutation('pending-start', makeOrder('pending-start'))

    const marker = orderOptimistic.captureSnapshotMarker()
    expect(marker.pendingIds).toEqual(['pending-start'])
    expect(orderOptimistic.idsToProtect(marker).has('pending-start')).toBe(true)

    // The mutation settles before the snapshot commits: the snapshot read may
    // still predate its effect, so the id stays protected.
    expect(orderOptimistic.endMutation('pending-start', generation)).toBe(true)
    expect(orderOptimistic.idsToProtect(marker).has('pending-start')).toBe(true)
  })

  it('protects ids whose mutation began after the snapshot started', () => {
    const marker = orderOptimistic.captureSnapshotMarker()

    const generation = orderOptimistic.beginMutation('began-during', makeOrder('began-during'))

    expect(orderOptimistic.idsToProtect(marker).has('began-during')).toBe(true)

    orderOptimistic.endMutation('began-during', generation)
  })

  it('does not protect ids whose last mutation predates the snapshot start', () => {
    const generation = orderOptimistic.beginMutation('predates', makeOrder('predates'))
    orderOptimistic.endMutation('predates', generation)

    const marker = orderOptimistic.captureSnapshotMarker()

    // The snapshot was read after the mutation settled, so it already
    // reflects the mutation's server state.
    expect(orderOptimistic.idsToProtect(marker).has('predates')).toBe(false)
  })

  it('protects a re-toggle that begins during the snapshot even if the first toggle predates it', () => {
    const firstGeneration = orderOptimistic.beginMutation('repeated', makeOrder('repeated'))
    orderOptimistic.endMutation('repeated', firstGeneration)

    const marker = orderOptimistic.captureSnapshotMarker()

    const secondGeneration = orderOptimistic.beginMutation('repeated', makeOrder('repeated'))
    expect(orderOptimistic.idsToProtect(marker).has('repeated')).toBe(true)

    orderOptimistic.endMutation('repeated', secondGeneration)
  })

  it('endMutation only clears the exact generation, keeping stale completions inert', () => {
    const firstGeneration = orderOptimistic.beginMutation('stale-end', makeOrder('stale-end'))
    const secondGeneration = orderOptimistic.beginMutation('stale-end', makeOrder('stale-end'))

    // A stale completion from the first toggle must not clear the newer one.
    expect(orderOptimistic.endMutation('stale-end', firstGeneration)).toBe(false)
    expect(orderOptimistic.hasPending('stale-end')).toBe(true)

    expect(orderOptimistic.endMutation('stale-end', secondGeneration)).toBe(true)
    expect(orderOptimistic.hasPending('stale-end')).toBe(false)
  })
})

describe('orderOptimistic journal lifecycle', () => {
  it('prunes entries that can no longer overlap any in-flight snapshot', () => {
    orderOptimistic.reset()

    orderOptimistic.recordUpsert(makeOrder('old', { version: 4 }))
    // Snapshot N settles with this marker: everything stamped at or before
    // it can never be replayed for a later snapshot.
    const settledMarker = orderOptimistic.captureSnapshotMarker()

    orderOptimistic.recordUpsert(makeOrder('fresh', { version: 5 }))
    orderOptimistic.recordRemove('deleted')

    orderOptimistic.prune(settledMarker)

    const all = orderOptimistic.effectsAfter({ seq: -1, pendingIds: [] })
    expect(all.map((effect) => (effect.type === 'upsert' ? effect.order.id : effect.id))).toEqual([
      'fresh',
      'deleted',
    ])

    const protectedIds = orderOptimistic.idsToProtect({ seq: -1, pendingIds: [] })
    expect(protectedIds.has('old')).toBe(false)
    expect(protectedIds.has('fresh')).toBe(true)
    expect(protectedIds.has('deleted')).toBe(true)
  })

  it('keeps a pending mutation protected after prune via future pendingIds', () => {
    orderOptimistic.reset()

    const generation = orderOptimistic.beginMutation('pending', makeOrder('pending'))
    const settledMarker = orderOptimistic.captureSnapshotMarker()

    // The mutation's stamp predates the settled snapshot, so pruning removes
    // it — but the still-pending mutation is re-captured on every snapshot
    // start through pendingIds, so it stays protected.
    orderOptimistic.prune(settledMarker)

    const futureMarker = orderOptimistic.captureSnapshotMarker()
    expect(futureMarker.pendingIds).toContain('pending')
    expect(orderOptimistic.idsToProtect(futureMarker).has('pending')).toBe(true)

    orderOptimistic.endMutation('pending', generation)
  })

  it('reset() drops the whole journal (pending mutations, stamps and effects)', () => {
    orderOptimistic.reset()

    orderOptimistic.recordUpsert(makeOrder('a', { version: 1 }))
    const generation = orderOptimistic.beginMutation('b', makeOrder('b'))

    orderOptimistic.reset()

    expect(orderOptimistic.hasPending('b')).toBe(false)
    expect(orderOptimistic.effectsAfter({ seq: -1, pendingIds: [] })).toEqual([])
    expect(orderOptimistic.idsToProtect({ seq: -1, pendingIds: [] }).size).toBe(0)

    // endMutation of a post-reset pending entry is a no-op, not a crash.
    expect(orderOptimistic.endMutation('b', generation)).toBe(false)
  })
})

describe('orderOptimistic confirmed mutation journal', () => {
  it('recordUpsert protects the id against a snapshot that started before the confirmation', () => {
    const marker = orderOptimistic.captureSnapshotMarker()

    orderOptimistic.recordUpsert(
      makeOrder('updated', { version: 11, note: 'confirmed' }),
    )

    expect(orderOptimistic.idsToProtect(marker).has('updated')).toBe(true)
    expect(orderOptimistic.effectsAfter(marker)).toEqual([
      {
        type: 'upsert',
        order: makeOrder('updated', { version: 11, note: 'confirmed' }),
        seq: expect.any(Number),
      },
    ])
  })

  it('recordRemove protects the id and keeps its remove effect for replay', () => {
    const marker = orderOptimistic.captureSnapshotMarker()

    orderOptimistic.recordRemove('deleted')

    expect(orderOptimistic.idsToProtect(marker).has('deleted')).toBe(true)
    expect(orderOptimistic.effectsAfter(marker)).toEqual([
      { type: 'remove', id: 'deleted', seq: expect.any(Number) },
    ])
  })

  it('does not surface confirmed effects that predate the snapshot marker', () => {
    orderOptimistic.recordUpsert(makeOrder('predates', { version: 5 }))

    const marker = orderOptimistic.captureSnapshotMarker()

    expect(orderOptimistic.effectsAfter(marker)).toEqual([])
    expect(orderOptimistic.idsToProtect(marker).has('predates')).toBe(false)
  })

  it('keeps only the latest confirmed effect per id and replays in confirmation order', () => {
    const marker = orderOptimistic.captureSnapshotMarker()

    orderOptimistic.recordUpsert(
      makeOrder('first', { version: 1, note: 'v1' }),
    )
    orderOptimistic.recordUpsert(
      makeOrder('second', { version: 2, note: 'v2' }),
    )
    // A later confirmation of the same id replaces the earlier effect.
    orderOptimistic.recordUpsert(
      makeOrder('first', { version: 3, note: 'v3' }),
    )
    orderOptimistic.recordRemove('deleted')

    const effects = orderOptimistic.effectsAfter(marker)
    expect(effects.map((effect) => effect.type)).toEqual([
      'upsert',
      'upsert',
      'remove',
    ])
    expect(
      effects
        .filter((effect) => effect.type === 'upsert')
        .map((effect) => (effect.type === 'upsert' ? effect.order.version : -1)),
    ).toEqual([2, 3])
  })
})
