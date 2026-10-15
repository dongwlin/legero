import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ORDER_BENCHMARK_PROTOCOL,
  calculateBenchmarkStatistics,
  runOrderBenchmark,
  runOrderBenchmarkTrial,
  summarizeOrderBenchmark,
  type OrderBenchmarkCaseTimings,
  type OrderBenchmarkProfile,
  type OrderBenchmarkTrial,
} from '@/services/orderBenchmark'
import { ORDER_BENCHMARK_FIXTURES, makeBenchmarkOrders } from '@/services/orderBenchmarkFixtures'
import { benchmarkCaseDefinitions, createBenchmarkStore, performBenchmarkCase } from '@/services/orderBenchmarkScenes'
import { orderOptimistic } from '@/services/orderOptimistic'
import { useOrderStore } from '@/store/order'

const { getAppInfo } = vi.hoisted(() => ({ getAppInfo: vi.fn() }))
vi.mock('@capacitor/app', () => ({ App: { getInfo: getAppInfo } }))

const timing = (value: number): OrderBenchmarkCaseTimings => ({
  optimisticCommitMs: value,
  optimisticViewsMs: value * 2,
  authoritativeCommitMs: value * 3,
  authoritativeViewsMs: value * 4,
  storeCommitMs: value * 4,
  viewDerivationMs: value * 6,
  totalMs: value * 10,
})
const trial = (run: number, profile: OrderBenchmarkProfile = 'default'): OrderBenchmarkTrial => ({
  run, profile, status: 'completed', failure: null, incompleteScenario: null,
  scenarios: ORDER_BENCHMARK_FIXTURES[profile].map((fixture) => ({
    ...fixture,
    metrics: { meat: timing(run) as never, staple: timing(run) as never, served: timing(run) as never },
    cases: benchmarkCaseDefinitions(profile === 'batch' ? [1, 10, 50] : [1, 10]).map((item) => ({
      ...item,
      samples: Array.from({ length: 5 }, (_, iteration) => ({ iteration, timings: timing(run + iteration), correctness: 'passed', inputEvents: 1, distinctIds: 1, acceptedUpdates: 1 })),
    })),
  })),
})
const fixture = async () => {
  vi.useFakeTimers()
  const pending = makeBenchmarkOrders(130, 130)
  await vi.runAllTimersAsync()
  const orders = await pending
  vi.useRealTimers()
  return orders
}

afterEach(() => { vi.useRealTimers() })

describe('order benchmark protocol V3', () => {
  it('uses five equally weighted round means and preserves individual samples and distinct statistics', () => {
    const trials = [1, 2, 3, 4, 5].map((run) => trial(run))
    const result = summarizeOrderBenchmark(trials)
    expect(result.trials).toBe(trials)
    expect(result.schemaVersion).toBe(2)
    expect(result.protocol.protocolVersion).toBe(3)
    expect(result.means.map((scenario) => scenario.totalOrders)).toEqual([130, 520, 1820])
    expect(result.means[0].metrics.meat.totalMs).toBe(50)
    expect(result.trials[0].scenarios[0].cases[0].samples).toHaveLength(5)
    const summary = result.means[0].cases[0]
    expect(summary.timings?.totalMs).toBe(50)
    expect(summary.statistics.totalMs).toMatchObject({ sampleCount: 25, min: 10, max: 90 })
    expect(summary.trialMeanStatistics?.totalMs).toMatchObject({ sampleCount: 5, min: 30, max: 70, mean: 50 })
    expect(summary.samples).toEqual([])
    expect(calculateBenchmarkStatistics([1, 2, 3])).toEqual({ sampleCount: 3, min: 1, max: 3, mean: 2, standardDeviation: Math.sqrt(2 / 3) })
  })

  it('requires five ordered rounds, matching scenes, equal sample counts and valid raw timing stages', () => {
    expect(() => summarizeOrderBenchmark([1, 2, 3, 4].map((run) => trial(run)))).toThrowError(expect.objectContaining({ code: 'INVALID_TRIAL_COUNT' }))
    const cases: ((trials: OrderBenchmarkTrial[]) => void)[] = [
      (trials) => { trials[2].scenarios[0].cases[0].samples[0].timings.totalMs = Number.NaN },
      (trials) => { trials[2].scenarios[0].cases[0].samples.pop() },
      (trials) => { trials[2].run = 1 },
      (trials) => { trials[2].scenarios[0].cases[0].id = 'other-case' },
      (trials) => { delete trials[2].scenarios[0].cases[0].samples[0].timings.authoritativeCommitMs },
    ]
    for (const corrupt of cases) {
      const trials = [1, 2, 3, 4, 5].map((run) => trial(run))
      corrupt(trials)
      expect(() => summarizeOrderBenchmark(trials)).toThrow()
    }
  })

  it('keeps optional dimensions separate and uses the same scenario definitions for every round', () => {
    for (const profile of ['history', 'today', 'batch'] as const) {
      const result = summarizeOrderBenchmark([1, 2, 3, 4, 5].map((run) => trial(run, profile)))
      expect(result.configuration.fixtures).toEqual(ORDER_BENCHMARK_FIXTURES[profile])
      expect(result.configuration.batchSizes).toEqual(profile === 'batch' ? [1, 10, 50] : [1, 10])
    }
    expect(ORDER_BENCHMARK_PROTOCOL.excludes.join(' ')).toContain('rAF queue')
    expect(ORDER_BENCHMARK_PROTOCOL.boundaries.assertions).toContain('outside')
  })

  it('executes C01–C05 through real isolated store and journal methods without touching production state', async () => {
    const orders = await fixture()
    const before = useOrderStore.getState()
    const sentinel = orderOptimistic.beginMutation('live-pending-order', orders[0])
    const store = createBenchmarkStore()
    const batch = vi.spyOn(store.getState(), 'upsertOrdersIfNewer')
    const cases = benchmarkCaseDefinitions([1, 10, 50])
    const samples = cases.map((item) => [item.id, performBenchmarkCase(item, store, orders, 0)] as const)
    expect(new Set(cases.map((item) => item.sceneId))).toEqual(new Set(['C01', 'C02', 'C03', 'C04', 'C05']))
    expect(batch).toHaveBeenCalled()
    expect(samples.find(([id]) => id === 'remote-50')?.[1]).toMatchObject({ inputEvents: 50, distinctIds: 50, acceptedUpdates: 50 })
    expect(samples.find(([id]) => id === 'duplicate-ids')?.[1]).toMatchObject({ inputEvents: 5, distinctIds: 1, acceptedUpdates: 1 })
    expect(samples.find(([id]) => id === 'equal-version')?.[1].acceptedUpdates).toBe(0)
    expect(samples.find(([id]) => id === 'old-version')?.[1].acceptedUpdates).toBe(0)
    expect(samples.filter(([id]) => ['http-first', 'realtime-first', 'rollback', 'rollback-newer', 'stale-generation'].includes(id)).every(([, sample]) => sample.timings.journalMs !== undefined)).toBe(true)
    expect(samples.every(([, sample]) => sample.correctness === 'passed')).toBe(true)
    expect(useOrderStore.getState()).toBe(before)
    expect(orderOptimistic.hasPending('live-pending-order')).toBe(true)
    orderOptimistic.endMutation('live-pending-order', sentinel)
  })

  it('reorders an already completed order without changing valid completion state or counts', async () => {
    const orders = await fixture()
    const store = createBenchmarkStore()
    const completedBefore = orders.filter((order) => order.completedAt !== null).length
    performBenchmarkCase(benchmarkCaseDefinitions([1]).find((item) => item.id === 'completion')!, store, orders, 0)
    const records = Object.values(store.getState().ordersById)
    expect(records.filter((order) => order.completedAt !== null)).toHaveLength(completedBefore)
    expect(store.getState().ordersById[orders[0].id].completedAt).not.toBe(orders[0].completedAt)
    expect(store.getState().ordersById[orders[1].id].completedAt).toBeNull()
    expect(store.getState().ordersById[orders[0].id].meatStepStatusCode).toBe(orders[0].meatStepStatusCode)
  })

  it('fails correctness when the actual batch method drops an update', async () => {
    const orders = await fixture()
    const store = createBenchmarkStore()
    vi.spyOn(store.getState(), 'upsertOrdersIfNewer').mockImplementation(() => {})
    expect(() => performBenchmarkCase(benchmarkCaseDefinitions([10]).find((item) => item.id === 'remote-10')!, store, orders, 0)).toThrow('INVALID_BENCHMARK_RESULT')
  })

  it('returns exportable cancellation before work with no formal means', async () => {
    const before = useOrderStore.getState()
    const controller = new AbortController()
    controller.abort()
    const result = await runOrderBenchmark({ signal: controller.signal })
    expect(result.status).toBe('cancelled')
    expect(result.means).toEqual([])
    expect(result.trials[0].failure?.code).toBe('ABORTED')
    expect(useOrderStore.getState()).toBe(before)
  })

  it('retains completed samples within an interrupted round and never summarizes them as five rounds', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const pending = runOrderBenchmarkTrial(1, {
      signal: controller.signal,
      onProgress: (progress) => { if (progress.caseId === 'remote-1') controller.abort() },
    })
    await vi.runAllTimersAsync()
    const interrupted = await pending
    expect(interrupted.status).toBe('cancelled')
    expect(interrupted.incompleteScenario?.cases.slice(0, 3).map((item) => item.samples.length)).toEqual([5, 5, 5])
    expect(interrupted.incompleteScenario?.cases[3].samples).toEqual([])
    const result = summarizeOrderBenchmark([interrupted])
    expect(result.means).toEqual([])
    expect(result.status).toBe('cancelled')
  })

  it('preserves samples and failure status when a progress consumer throws', async () => {
    vi.useFakeTimers()
    const pending = runOrderBenchmark({ onProgress: (progress) => { if (progress.caseId === 'remote-1') throw new Error('fixture failure') } })
    await vi.runAllTimersAsync()
    const result = await pending
    expect(result.status).toBe('failed')
    expect(result.means).toEqual([])
    expect(result.trials[0].incompleteScenario?.cases[0].samples).toHaveLength(5)
    expect(JSON.stringify(result)).not.toContain('fixture failure')
  })
})
