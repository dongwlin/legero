import type { AppInfo } from '@capacitor/app'
import { getBuildMetadata, type BuildMetadata } from '@/services/buildMetadata'
import { benchmarkCaseDefinitions, createBenchmarkStore, performBenchmarkCase } from '@/services/orderBenchmarkScenes'
import { ORDER_BENCHMARK_FIXTURES, ORDER_BENCHMARK_REFERENCE_TIME, makeBenchmarkOrders, throwIfBenchmarkAborted, yieldBenchmark } from '@/services/orderBenchmarkFixtures'
import type { OrderBenchmarkAction, OrderBenchmarkCase, OrderBenchmarkCaseTimings, OrderBenchmarkOptions, OrderBenchmarkProfile, OrderBenchmarkScenario, OrderBenchmarkStatistics, OrderBenchmarkTimings, OrderBenchmarkTrial } from '@/services/orderBenchmarkTypes'
export type * from '@/services/orderBenchmarkTypes'

export type OrderBenchmarkErrorCode = 'INVALID_FIXTURE' | 'INVALID_ACTION_TARGET' | 'INVALID_TRIAL_COUNT' | 'INVALID_TIMING' | 'INVALID_TRIAL_STRUCTURE'
export class OrderBenchmarkError extends Error {
  constructor(readonly code: OrderBenchmarkErrorCode) {
    super('Order benchmark failed')
    this.name = 'OrderBenchmarkError'
  }
}

export const ORDER_BENCHMARK_PROTOCOL = {
  protocolVersion: 2,
  runs: 5,
  scenarioTotalOrders: [130, 520, 1820],
  todayOrders: 130,
  profiles: ORDER_BENCHMARK_FIXTURES,
  defaultProfile: 'default',
  defaultBatchSizes: [1, 10],
  batchProfileSizes: [1, 10, 50],
  warmupOperationsPerMetric: 2,
  measuredOperationsPerMetric: 5,
  referenceTime: ORDER_BENCHMARK_REFERENCE_TIME,
  timezone: 'Asia/Shanghai',
  dataSeed: 'deterministic-index-v2',
  distribution: 'todayOrders records today and 130 per historical Shanghai business day; every third record initially served; unique ids; initial server version 1 (C04 old-version target starts at 2)',
  filter: 'all',
  sceneIds: ['C01', 'C02', 'C03', 'C04', 'C05'],
  unit: 'milliseconds per operation',
  action: 'C01 local domain toggle/store write/views then simulated server confirmation/views; C02-C04 actual store methods/views; C05 isolated actual optimistic journal and store delivery interleavings/views',
  boundaries: {
    totalMs: 'synchronous operation sequence entry to final count/all-list derivation completion',
    storeCommitMs: 'synchronous target store methods; C01 also includes domain toggle and confirmation payload construction',
    viewDerivationMs: 'countTodayOrders plus selectTodayOrderIds(all)',
    journalMs: 'actual begin/end/record journal methods, only where exercised',
    assertions: 'outside all measured phases',
    reset: 'fixture generation, store reset/injection and initial derivation excluded before every warmup and sample',
  },
  aggregation: 'mean of five equally weighted trial means; five measured operations per case per trial',
  excludes: [
    'network and HTTP transport/server/PostgreSQL',
    'WebSocket decoding, rAF queue waiting and pre-store hook deduplication/tombstones',
    'React render and DOM/layout/paint',
    'localStorage disk I/O (isolated memory storage only)',
    'actual request promises, hook callbacks, snapshot reconciliation and 300 ms duplicate-tap guard',
    'fixture generation, reset, initial derivation and correctness assertions',
  ],
} as const

export type OrderBenchmarkResult = {
  schemaVersion: 2
  status: 'completed' | 'cancelled' | 'failed'
  capturedAt: string
  environment: {
    runtime: 'browser' | 'node'
    userAgent: string
    logicalCpus: number | null
    appVersion: string | null
    appBuild: string | null
    build: BuildMetadata
  }
  protocol: typeof ORDER_BENCHMARK_PROTOCOL
  configuration: { profile: OrderBenchmarkProfile; fixtures: { totalOrders: number; todayOrders: number }[]; batchSizes: number[] }
  trials: OrderBenchmarkTrial[]
  means: OrderBenchmarkScenario[]
  failure: { code: string; message: string } | null
}

const ACTIONS = ['meat', 'staple', 'served'] as const
const LEGACY_STAGES = ['optimisticCommitMs', 'optimisticViewsMs', 'authoritativeCommitMs', 'authoritativeViewsMs', 'totalMs'] as const
const batchSizesFor = (profile: OrderBenchmarkProfile): number[] => profile === 'batch' ? [1, 10, 50] : [1, 10]

export const calculateBenchmarkStatistics = (values: number[]): OrderBenchmarkStatistics => {
  if (!values.length || values.some((value) => !Number.isFinite(value) || value < 0)) throw new OrderBenchmarkError('INVALID_TIMING')
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  return {
    sampleCount: values.length,
    mean,
    min: Math.min(...values),
    max: Math.max(...values),
    standardDeviation: Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length),
  }
}
const statisticsFor = (values: OrderBenchmarkCaseTimings[]): Record<string, OrderBenchmarkStatistics> => Object.fromEntries(
  Object.keys(values[0]).map((stage) => [stage, calculateBenchmarkStatistics(values.map((timings) => timings[stage as keyof OrderBenchmarkCaseTimings]!))]),
)
const meanTimings = (values: OrderBenchmarkCaseTimings[]): OrderBenchmarkCaseTimings => Object.fromEntries(
  Object.entries(statisticsFor(values)).map(([stage, stats]) => [stage, stats.mean]),
) as OrderBenchmarkCaseTimings
const updateCaseStatistics = (item: OrderBenchmarkCase): void => {
  if (item.samples.length) {
    item.statistics = statisticsFor(item.samples.map((sample) => sample.timings))
    item.timings = meanTimings(item.samples.map((sample) => sample.timings))
  }
}
const metricsFor = (cases: OrderBenchmarkCase[]): Record<OrderBenchmarkAction, OrderBenchmarkTimings> => Object.fromEntries(ACTIONS.map((action) => {
  const timings = cases.find((item) => item.id === action)?.timings
  if (!timings) throw new OrderBenchmarkError('INVALID_TRIAL_STRUCTURE')
  return [action, Object.fromEntries(LEGACY_STAGES.map((stage) => [stage, timings[stage]!]))]
})) as Record<OrderBenchmarkAction, OrderBenchmarkTimings>

const readAppInfo = (signal?: AbortSignal): Promise<AppInfo | null> => new Promise((resolve, reject) => {
  let settled = false
  const finish = (info: AppInfo | null, aborted = false): void => {
    if (settled) return
    settled = true
    clearTimeout(timeout)
    signal?.removeEventListener('abort', onAbort)
    if (aborted) reject(new DOMException('Benchmark cancelled', 'AbortError'))
    else resolve(info)
  }
  const onAbort = (): void => { finish(null, true) }
  const timeout = setTimeout(() => { finish(null) }, 1000)
  signal?.addEventListener('abort', onAbort, { once: true })
  if (signal?.aborted) { onAbort(); return }
  void import('@capacitor/app').then(({ App }) => App.getInfo()).then((info) => { finish(info) }, () => { finish(null) })
})

/** Same isolated workload in browser and CLI. Interrupted rounds retain their samples. */
export const runOrderBenchmarkTrial = async (
  run: number,
  { signal, onProgress, onCheckpoint, profile = 'default' }: OrderBenchmarkOptions = {},
): Promise<OrderBenchmarkTrial> => {
  const trial: OrderBenchmarkTrial = { run, profile, status: 'completed', failure: null, scenarios: [], incompleteScenario: null }
  const store = createBenchmarkStore()
  try {
    throwIfBenchmarkAborted(signal)
    if (!ORDER_BENCHMARK_FIXTURES[profile]) throw new OrderBenchmarkError('INVALID_FIXTURE')
    for (const fixture of ORDER_BENCHMARK_FIXTURES[profile]) {
      const progress = { run, totalRuns: 5 as const, ...fixture, action: null, caseId: null, caseLabel: null }
      onProgress?.(progress)
      await yieldBenchmark(signal)
      const cases = benchmarkCaseDefinitions(batchSizesFor(profile))
      trial.incompleteScenario = { ...fixture, cases }
      const orders = await makeBenchmarkOrders(fixture.totalOrders, fixture.todayOrders, signal)
      for (const item of cases) {
        onProgress?.({ ...progress, action: ACTIONS.includes(item.id as OrderBenchmarkAction) ? item.id as OrderBenchmarkAction : null, caseId: item.id, caseLabel: item.label })
        for (let iteration = 0; iteration < ORDER_BENCHMARK_PROTOCOL.warmupOperationsPerMetric; iteration += 1) {
          await yieldBenchmark(signal)
          performBenchmarkCase(item, store, orders, iteration)
        }
        for (let iteration = 0; iteration < ORDER_BENCHMARK_PROTOCOL.measuredOperationsPerMetric; iteration += 1) {
          await yieldBenchmark(signal)
          item.samples.push(performBenchmarkCase(item, store, orders, iteration))
          updateCaseStatistics(item)
        }
        onCheckpoint?.(trial)
      }
      trial.scenarios.push({ ...fixture, metrics: metricsFor(cases), cases })
      trial.incompleteScenario = null
    }
    throwIfBenchmarkAborted(signal)
  } catch (error) {
    trial.status = error instanceof DOMException && error.name === 'AbortError' ? 'cancelled' : 'failed'
    trial.failure = { code: trial.status === 'cancelled' ? 'ABORTED' : error instanceof OrderBenchmarkError ? error.code : 'CORRECTNESS_OR_EXECUTION_FAILED', message: trial.status === 'cancelled' ? 'Benchmark cancelled' : 'Benchmark correctness or execution failed' }
  } finally {
    store.getState().resetSyncState()
  }
  return trial
}

const assertTrialStructure = (trials: OrderBenchmarkTrial[]): void => {
  const profile = trials[0]?.profile ?? 'default'
  const fixtures = ORDER_BENCHMARK_FIXTURES[profile]
  if (!fixtures || trials.some((trial, index) => trial.run !== index + 1 || trial.profile !== profile)) throw new OrderBenchmarkError('INVALID_TRIAL_STRUCTURE')
  for (const trial of trials) {
    if (trial.status !== 'completed') continue
    if (trial.scenarios.length !== fixtures.length || trial.incompleteScenario !== null) throw new OrderBenchmarkError('INVALID_TRIAL_STRUCTURE')
    for (const [index, scenario] of trial.scenarios.entries()) {
      const fixture = fixtures[index]
      const definitions = benchmarkCaseDefinitions(batchSizesFor(profile))
      if (scenario.totalOrders !== fixture.totalOrders || scenario.todayOrders !== fixture.todayOrders || scenario.cases.length !== definitions.length) throw new OrderBenchmarkError('INVALID_TRIAL_STRUCTURE')
      for (const [caseIndex, item] of scenario.cases.entries()) {
        if (item.id !== definitions[caseIndex].id || item.sceneId !== definitions[caseIndex].sceneId || item.samples.length !== ORDER_BENCHMARK_PROTOCOL.measuredOperationsPerMetric) throw new OrderBenchmarkError('INVALID_TRIAL_STRUCTURE')
        for (const [sampleIndex, sample] of item.samples.entries()) {
          if (sample.iteration !== sampleIndex || sample.correctness !== 'passed' || !Number.isInteger(sample.inputEvents) || !Number.isInteger(sample.acceptedUpdates) || !Number.isInteger(sample.distinctIds)) throw new OrderBenchmarkError('INVALID_TRIAL_STRUCTURE')
          statisticsFor([sample.timings])
          const requiredStages = ['storeCommitMs', 'viewDerivationMs', 'totalMs', ...(item.sceneId === 'C01' ? LEGACY_STAGES : [])]
          if (requiredStages.some((stage) => sample.timings[stage as keyof OrderBenchmarkCaseTimings] === undefined)
            || sample.inputEvents < 0 || sample.acceptedUpdates < 0 || sample.distinctIds < 0
            || Object.keys(sample.timings).join(',') !== Object.keys(item.samples[0].timings).join(',')) throw new OrderBenchmarkError('INVALID_TIMING')
        }
        // Raw samples are canonical; never trust stored aggregate fields from imported JSON.
        updateCaseStatistics(item)
      }
      scenario.metrics = metricsFor(scenario.cases)
    }
  }
}

export const summarizeOrderBenchmark = (trials: OrderBenchmarkTrial[]): OrderBenchmarkResult => {
  const interrupted = trials.find((trial) => trial.status !== 'completed')
  if (!interrupted && trials.length !== ORDER_BENCHMARK_PROTOCOL.runs) throw new OrderBenchmarkError('INVALID_TRIAL_COUNT')
  assertTrialStructure(trials)
  const profile = trials[0]?.profile ?? 'default'
  const means = interrupted ? [] : trials[0].scenarios.map((scenario, index) => {
    const cases = scenario.cases.map((item, caseIndex) => {
      const roundCases = trials.map((trial) => trial.scenarios[index].cases[caseIndex])
      const values = roundCases.map((entry) => entry.timings!)
      return {
        ...item,
        samples: [],
        timings: meanTimings(values),
        statistics: statisticsFor(roundCases.flatMap((entry) => entry.samples.map((sample) => sample.timings))),
        trialMeanStatistics: statisticsFor(values),
      }
    })
    return { totalOrders: scenario.totalOrders, todayOrders: scenario.todayOrders, metrics: metricsFor(cases), cases }
  })
  return {
    schemaVersion: 2,
    status: interrupted?.status ?? 'completed',
    capturedAt: new Date().toISOString(),
    environment: {
      runtime: typeof window === 'undefined' ? 'node' : 'browser',
      userAgent: typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent,
      logicalCpus: typeof navigator === 'undefined' ? null : navigator.hardwareConcurrency ?? null,
      appVersion: getBuildMetadata().appVersion,
      appBuild: null,
      build: getBuildMetadata(),
    },
    protocol: ORDER_BENCHMARK_PROTOCOL,
    configuration: { profile, fixtures: ORDER_BENCHMARK_FIXTURES[profile], batchSizes: batchSizesFor(profile) },
    trials,
    means,
    failure: interrupted?.failure ?? null,
  }
}

export const runOrderBenchmark = async (options: OrderBenchmarkOptions = {}): Promise<OrderBenchmarkResult> => {
  const trials: OrderBenchmarkTrial[] = []
  for (let run = 1; run <= ORDER_BENCHMARK_PROTOCOL.runs; run += 1) {
    const trial = await runOrderBenchmarkTrial(run, options)
    trials.push(trial)
    if (trial.status !== 'completed') break
  }
  const result = summarizeOrderBenchmark(trials)
  if (typeof window !== 'undefined' && result.status === 'completed') {
    try {
      const info = await readAppInfo(options.signal)
      if (info) { result.environment.appVersion = info.version; result.environment.appBuild = info.build }
    } catch {
      // A cancel during optional metadata collection still retains every completed round.
      result.status = 'cancelled'
      result.means = []
      result.failure = { code: 'ABORTED', message: 'Benchmark cancelled during environment collection' }
    }
  }
  return result
}
