import { afterEach, describe, expect, it, vi } from 'vitest'
import { ORDER_SOAK_SEQUENCE, runOrderSoak } from '@/services/orderSoak'
import * as benchmarkScenes from '@/services/orderBenchmarkScenes'
import { useOrderStore } from '@/store/order'

const settle = async <T,>(pending: Promise<T>): Promise<T> => { await vi.runAllTimersAsync(); return pending }
afterEach(() => { vi.useRealTimers() })

describe('isolated order soak L01', () => {
  it('completes five fixed-size cold rounds with bounded recent samples/windows and full-cycle statistics', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    const before = useOrderStore.getState()
    const result = await settle(runOrderSoak({ totalOrders: 130, roundDurationMs: 300, intervalMs: 10, sampleCapacity: 3, windowMs: 30, windowCapacity: 2, readHeap: () => ({ bytes: 1024, source: 'test heap probe', unavailableReason: null }) }))
    expect(result.status).toBe('completed')
    expect(result.rounds).toHaveLength(5)
    expect(result.fiveRoundMeanMs).not.toBeNull()
    for (const round of result.rounds) {
      expect(round.operationCount).toBe(30)
      expect(round.statistics.count).toBe(30)
      expect(round.retainedSamples).toHaveLength(3)
      expect(round.droppedSamples).toBe(27)
      expect(round.windows).toHaveLength(2)
      expect(round.droppedWindows).toBeGreaterThan(0)
      expect(round.resources).toMatchObject({ harnessSubscriptionsBeforeCleanup: 1, harnessSubscriptionsAfterCleanup: 0, actualWebSocketConnections: null })
      expect(round.failureCount).toBe(0)
    }
    expect(ORDER_SOAK_SEQUENCE).toContain('snapshot-journal-prune')
    expect(result.protocol.excludes).toContain('real WebSocket connections/reconnects and network')
    expect(useOrderStore.getState()).toBe(before)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('retains a cancelled round, cleans listeners/timers and produces no formal five-round mean', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    const controller = new AbortController()
    const result = await settle(runOrderSoak({ signal: controller.signal, onProgress: ({ operationCount }) => { if (operationCount === 3) controller.abort() } }))
    expect(result.status).toBe('cancelled')
    expect(result.rounds).toHaveLength(1)
    expect(result.rounds[0]).toMatchObject({ status: 'cancelled', operationCount: 3, failureCount: 0, failure: 'ABORTED' })
    expect(result.rounds[0].resources.harnessSubscriptionsAfterCleanup).toBe(0)
    expect(result.fiveRoundMeanMs).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('retains execution failures and treats unavailable memory as null with a reason', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    const result = await settle(runOrderSoak({ readHeap: () => { throw new Error('probe unavailable') }, onProgress: ({ operationCount }) => { if (operationCount === 2) throw new Error('test failure') } }))
    expect(result.status).toBe('failed')
    expect(result.fiveRoundMeanMs).toBeNull()
    expect(result.rounds[0].failureCount).toBe(1)
    expect(result.rounds[0].retainedSamples).toHaveLength(2)
    expect(result.rounds[0].retainedSamples[0].heap).toMatchObject({ bytes: null, unavailableReason: 'Heap probe failed' })
    expect(JSON.stringify(result)).not.toContain('test failure')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('detects a dropped remote batch even when counts and timeline stay unchanged', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
    const createStore = benchmarkScenes.createBenchmarkStore
    const mock = vi.spyOn(benchmarkScenes, 'createBenchmarkStore').mockImplementation(() => {
      const store = createStore()
      vi.spyOn(store.getState(), 'upsertOrdersIfNewer').mockImplementation(() => {})
      return store
    })
    try {
      const result = await settle(runOrderSoak({ totalOrders: 130, roundDurationMs: 100, intervalMs: 10 }))
      expect(result.status).toBe('failed')
      expect(result.fiveRoundMeanMs).toBeNull()
      expect(result.rounds[0].failureCount).toBe(1)
      expect(result.rounds[0].operationCount).toBe(3)
    } finally { mock.mockRestore() }
  })

  it('bounds duration, cadence, sizes and retention before allocating fixtures', async () => {
    await expect(runOrderSoak({ sampleCapacity: 0 })).rejects.toThrow('Invalid soak configuration')
    await expect(runOrderSoak({ roundDurationMs: 28_800_001 })).rejects.toThrow('Invalid soak configuration')
    await expect(runOrderSoak({ intervalMs: 0 })).rejects.toThrow('Invalid soak configuration')
    await expect(runOrderSoak({ totalOrders: 10 })).rejects.toThrow('Invalid soak configuration')
  })
})
