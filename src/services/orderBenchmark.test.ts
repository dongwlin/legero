import { describe, expect, it, vi } from 'vitest'
import {
  ORDER_BENCHMARK_PROTOCOL,
  runOrderBenchmark,
  runOrderBenchmarkTrial,
  summarizeOrderBenchmark,
  type OrderBenchmarkProgress,
  type OrderBenchmarkTimings,
  type OrderBenchmarkTrial,
} from '@/services/orderBenchmark'
import { useOrderStore } from '@/store/order'

const { getAppInfo } = vi.hoisted(() => ({ getAppInfo: vi.fn() }))
vi.mock('@capacitor/app', () => ({ App: { getInfo: getAppInfo } }))

// These tests verify orchestration and isolation; production selector correctness
// is covered by orderWorkspaceView.test.ts, rather than timing wall-clock work here.
vi.mock('@/services/orderWorkspaceView', () => ({
  countTodayOrders: () => ({ todayCompletedCount: 44, uncompletedCount: 86 }),
  selectTodayOrderIds: () => Array.from({ length: 130 }, (_, index) => String(index)),
}))

const timing = (value: number): OrderBenchmarkTimings => ({
  optimisticCommitMs: value,
  optimisticViewsMs: value * 2,
  authoritativeCommitMs: value * 3,
  authoritativeViewsMs: value * 4,
  totalMs: value * 10,
})

const trial = (run: number): OrderBenchmarkTrial => ({
  run,
  scenarios: ORDER_BENCHMARK_PROTOCOL.scenarioTotalOrders.map((totalOrders) => ({
    totalOrders,
    todayOrders: 130,
    metrics: { meat: timing(run), staple: timing(run * 2), served: timing(run * 3) },
  })),
})

describe('order benchmark', () => {
  it('preserves five raw trials and computes arithmetic means for each stage', () => {
    const trials = [1, 2, 3, 4, 5].map(trial)
    const result = summarizeOrderBenchmark(trials)

    expect(result.trials).toBe(trials)
    expect(result.protocol.runs).toBe(5)
    expect(result.means.map((scenario) => scenario.totalOrders)).toEqual([130, 520, 1820])
    for (const scenario of result.means) {
      expect(scenario.metrics.meat).toEqual(timing(3))
      expect(scenario.metrics.staple).toEqual(timing(6))
      expect(scenario.metrics.served).toEqual(timing(9))
    }
  })

  it('requires exactly five trials and rejects invalid timings', () => {
    expect(() => summarizeOrderBenchmark([1, 2, 3, 4].map(trial))).toThrow('exactly five')
    const invalid = [1, 2, 3, 4, 5].map(trial)
    invalid[2].scenarios[0].metrics.meat.totalMs = Number.NaN
    expect(() => summarizeOrderBenchmark(invalid)).toThrow('invalid timing')
  })

  it('cancels before work starts without mutating the live store', async () => {
    const before = useOrderStore.getState()
    const controller = new AbortController()
    controller.abort()

    await expect(runOrderBenchmark({ signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(useOrderStore.getState()).toBe(before)
  })

  it('executes all scenario/action combinations in an isolated store', async () => {
    vi.useFakeTimers()
    const before = useOrderStore.getState()
    const progress: OrderBenchmarkProgress[] = []
    const pending = runOrderBenchmarkTrial(1, { onProgress: (value) => { progress.push(value) } })
    await vi.runAllTimersAsync()
    const result = await pending

    expect(result.scenarios.map((scenario) => scenario.totalOrders)).toEqual([130, 520, 1820])
    expect(progress.filter((value) => value.action !== null).map((value) => value.action)).toEqual([
      'meat', 'staple', 'served', 'meat', 'staple', 'served', 'meat', 'staple', 'served',
    ])
    expect(result.scenarios.every((scenario) => scenario.todayOrders === 130)).toBe(true)
    expect(useOrderStore.getState()).toBe(before)
  })

  it('stops between scenarios after cancellation', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const progress: OrderBenchmarkProgress[] = []
    const pending = runOrderBenchmarkTrial(1, {
      signal: controller.signal,
      onProgress: (value) => {
        progress.push(value)
        if (value.totalOrders === 520) controller.abort()
      },
    })
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await vi.runAllTimersAsync()
    await rejection

    expect(progress.at(-1)).toMatchObject({ totalOrders: 520, action: null })
    expect(progress.some((value) => value.totalOrders === 1820)).toBe(false)
  })

  it('keeps all five completed trials when the optional native bridge times out', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('window', {})
    await import('@capacitor/app')
    getAppInfo.mockImplementation(() => new Promise(() => {}))
    const pending = runOrderBenchmark()
    await vi.runAllTimersAsync()
    const result = await pending

    expect(result.trials).toHaveLength(5)
    expect(result.environment.appVersion).toBeNull()
    expect(result.environment.appBuild).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels a stalled optional native bridge and clears its timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('window', {})
    await import('@capacitor/app')
    const controller = new AbortController()
    getAppInfo.mockImplementation(() => {
      setTimeout(() => { controller.abort() }, 0)
      return new Promise(() => {})
    })
    const pending = runOrderBenchmark({ signal: controller.signal })
    const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await vi.runAllTimersAsync()
    await rejection

    expect(vi.getTimerCount()).toBe(0)
  })
})
