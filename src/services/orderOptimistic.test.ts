import { describe, expect, it } from 'vitest'
import { DEFAULT_ORDER_FORM_VALUE, STEP_STATUS, type OrderRecord } from '@/types'
import { orderOptimistic } from './orderOptimistic'

const makeOrder = (id: string): OrderRecord => ({
  ...DEFAULT_ORDER_FORM_VALUE,
  id,
  displayNo: id,
  totalPriceCents: 1500,
  stapleStepStatusCode: STEP_STATUS.notStarted,
  meatStepStatusCode: STEP_STATUS.notStarted,
  createdAt: '2025-01-01T00:00:00+08:00',
  updatedAt: '2025-01-01T00:00:00+08:00',
  completedAt: null,
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
