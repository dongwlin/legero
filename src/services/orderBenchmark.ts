import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import type { AppInfo } from '@capacitor/app'
import { countTodayOrders, selectTodayOrderIds } from '@/services/orderWorkspaceView'
import { toggleOrderServed, toggleOrderStepStatus } from '@/services/orderStatus'
import { createOrderStore } from '@/store/order'
import { DEFAULT_ORDER_FORM_VALUE, STEP_STATUS, type OrderRecord } from '@/types'

dayjs.extend(utc)
dayjs.extend(timezone)

export type OrderBenchmarkAction = 'meat' | 'staple' | 'served'

export type OrderBenchmarkTimings = {
  optimisticCommitMs: number
  optimisticViewsMs: number
  authoritativeCommitMs: number
  authoritativeViewsMs: number
  totalMs: number
}

export type OrderBenchmarkScenario = {
  totalOrders: number
  todayOrders: number
  metrics: Record<OrderBenchmarkAction, OrderBenchmarkTimings>
}

export type OrderBenchmarkTrial = {
  run: number
  scenarios: OrderBenchmarkScenario[]
}

export type OrderBenchmarkProgress = {
  run: number
  totalRuns: 5
  totalOrders: number
  action: OrderBenchmarkAction | null
}

export const ORDER_BENCHMARK_PROTOCOL = {
  protocolVersion: 1,
  runs: 5,
  scenarioTotalOrders: [130, 520, 1820],
  todayOrders: 130,
  warmupOperationsPerMetric: 2,
  measuredOperationsPerMetric: 5,
  referenceTime: '2026-10-15T12:00:00+08:00',
  filter: 'all',
  unit: 'milliseconds per action',
  action: 'optimistic domain toggle/store commit + controls/list derivation, then simulated authoritative store commit + controls/list derivation',
  excludes: [
    'network',
    'HTTP/server/PostgreSQL',
    'React render and DOM/layout/paint',
    'localStorage disk I/O',
    'optimistic mutation journal and request bookkeeping',
    '300 ms duplicate-tap guard',
  ],
} as const

export type OrderBenchmarkResult = {
  schemaVersion: 1
  capturedAt: string
  environment: {
    runtime: 'browser' | 'node'
    userAgent: string
    logicalCpus: number | null
    appVersion: string | null
    appBuild: string | null
  }
  protocol: typeof ORDER_BENCHMARK_PROTOCOL
  trials: OrderBenchmarkTrial[]
  means: OrderBenchmarkScenario[]
}

type BenchmarkOptions = {
  signal?: AbortSignal
  onProgress?: (progress: OrderBenchmarkProgress) => void
}

const ORDERS_PER_DAY = 130
const ACTIONS = ['meat', 'staple', 'served'] as const
const TIMING_STAGES = [
  'optimisticCommitMs',
  'optimisticViewsMs',
  'authoritativeCommitMs',
  'authoritativeViewsMs',
  'totalMs',
] as const

const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw new DOMException('Benchmark cancelled', 'AbortError')
}

const yieldToBrowser = async (signal?: AbortSignal): Promise<void> => {
  throwIfAborted(signal)
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  throwIfAborted(signal)
}

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
  // Metadata is optional; both lazy-module loading and the native bridge are bounded.
  const timeout = setTimeout(() => { finish(null) }, 1000)
  signal?.addEventListener('abort', onAbort, { once: true })

  if (signal?.aborted) {
    onAbort()
    return
  }

  void import('@capacitor/app')
    .then(({ App }) => App.getInfo())
    .then((info) => { finish(info) }, () => { finish(null) })
})

const makeOrders = async (total: number, signal?: AbortSignal): Promise<OrderRecord[]> => {
  const start = dayjs(ORDER_BENCHMARK_PROTOCOL.referenceTime)
    .tz('Asia/Shanghai')
    .startOf('day')
    .add(9, 'hour')
  const orders: OrderRecord[] = []

  for (let index = 0; index < total; index += 1) {
    if (index % ORDERS_PER_DAY === 0) await yieldToBrowser(signal)
    const createdAt = start
      .subtract(Math.floor(index / ORDERS_PER_DAY), 'day')
      .add(index % ORDERS_PER_DAY, 'minute')
      .toISOString()
    const completed = index % 3 === 0

    orders.push({
      ...DEFAULT_ORDER_FORM_VALUE,
      selectedMeatCodes: [...DEFAULT_ORDER_FORM_VALUE.selectedMeatCodes],
      id: `benchmark-order-${String(index).padStart(6, '0')}`,
      displayNo: String(index % ORDERS_PER_DAY + 1).padStart(4, '0'),
      version: 1,
      totalPriceCents: 1000,
      stapleStepStatusCode: completed || index === 4 ? STEP_STATUS.completed : STEP_STATUS.notStarted,
      meatStepStatusCode: completed || index === 4 ? STEP_STATUS.completed : STEP_STATUS.notStarted,
      createdAt,
      updatedAt: createdAt,
      completedAt: completed ? createdAt : null,
    })
  }

  return orders
}

const meanTimings = (values: OrderBenchmarkTimings[]): OrderBenchmarkTimings => ({
  optimisticCommitMs: values.reduce((sum, value) => sum + value.optimisticCommitMs, 0) / values.length,
  optimisticViewsMs: values.reduce((sum, value) => sum + value.optimisticViewsMs, 0) / values.length,
  authoritativeCommitMs: values.reduce((sum, value) => sum + value.authoritativeCommitMs, 0) / values.length,
  authoritativeViewsMs: values.reduce((sum, value) => sum + value.authoritativeViewsMs, 0) / values.length,
  totalMs: values.reduce((sum, value) => sum + value.totalMs, 0) / values.length,
})

/** Same isolated workload for the Settings diagnostic and fresh-process CLI trials. */
export const runOrderBenchmarkTrial = async (
  run: number,
  { signal, onProgress }: BenchmarkOptions = {},
): Promise<OrderBenchmarkTrial> => {
  throwIfAborted(signal)
  const storage = new Map<string, string>()
  const store = createOrderStore({
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => { storage.set(key, value) },
    removeItem: (key) => { storage.delete(key) },
  })
  const { referenceTime, filter, warmupOperationsPerMetric, measuredOperationsPerMetric } = ORDER_BENCHMARK_PROTOCOL

  const deriveViews = (): void => {
    const state = store.getState()
    const counts = countTodayOrders(state.ordersById, state.orderDisplayIds, referenceTime)
    const ids = selectTodayOrderIds(state.ordersById, state.orderDisplayIds, filter, referenceTime)

    if (counts.todayCompletedCount + counts.uncompletedCount !== ORDERS_PER_DAY || ids.length !== ORDERS_PER_DAY) {
      throw new Error('Benchmark fixture does not match daily-view semantics')
    }
  }

  const performAction = (action: OrderBenchmarkAction, targetId: string): OrderBenchmarkTimings => {
    const start = performance.now()
    const current = store.getState().ordersById[targetId]
    const next = action === 'served'
      ? toggleOrderServed(current, referenceTime)
      : toggleOrderStepStatus(current, action)
    if (next === current) throw new Error(`Invalid benchmark ${action} target`)
    store.getState().upsertOrder(next)
    const optimisticCommitted = performance.now()
    deriveViews()
    const optimisticDerived = performance.now()
    // Only the server generates versions in production; this is its simulated payload.
    const confirmed = { ...next, version: current.version + 1, updatedAt: referenceTime }
    store.getState().upsertIfNewer(confirmed)
    const authoritativeCommitted = performance.now()
    deriveViews()
    const end = performance.now()

    return {
      optimisticCommitMs: optimisticCommitted - start,
      optimisticViewsMs: optimisticDerived - optimisticCommitted,
      authoritativeCommitMs: authoritativeCommitted - optimisticDerived,
      authoritativeViewsMs: end - authoritativeCommitted,
      totalMs: end - start,
    }
  }

  const scenarios: OrderBenchmarkScenario[] = []

  for (const totalOrders of ORDER_BENCHMARK_PROTOCOL.scenarioTotalOrders) {
    onProgress?.({ run, totalRuns: 5, totalOrders, action: null })
    await yieldToBrowser(signal)
    const orders = await makeOrders(totalOrders, signal)
    store.getState().resetSyncState()
    store.getState().setOrders(orders)
    deriveViews()
    const metricEntries: [OrderBenchmarkAction, OrderBenchmarkTimings][] = []

    for (const [index, action] of ACTIONS.entries()) {
      onProgress?.({ run, totalRuns: 5, totalOrders, action })
      const targetId = orders[index === 2 ? 4 : index + 1].id
      for (let iteration = 0; iteration < warmupOperationsPerMetric; iteration += 1) {
        await yieldToBrowser(signal)
        performAction(action, targetId)
      }
      const operations: OrderBenchmarkTimings[] = []
      for (let iteration = 0; iteration < measuredOperationsPerMetric; iteration += 1) {
        await yieldToBrowser(signal)
        operations.push(performAction(action, targetId))
      }
      metricEntries.push([action, meanTimings(operations)])
    }

    scenarios.push({
      totalOrders,
      todayOrders: ORDERS_PER_DAY,
      metrics: Object.fromEntries(metricEntries) as Record<OrderBenchmarkAction, OrderBenchmarkTimings>,
    })
  }

  return { run, scenarios }
}

export const summarizeOrderBenchmark = (trials: OrderBenchmarkTrial[]): OrderBenchmarkResult => {
  if (trials.length !== ORDER_BENCHMARK_PROTOCOL.runs) throw new Error('Benchmark requires exactly five trials')

  const means = trials[0].scenarios.map((scenario, index) => ({
    totalOrders: scenario.totalOrders,
    todayOrders: scenario.todayOrders,
    metrics: Object.fromEntries(ACTIONS.map((action) => [
      action,
      meanTimings(trials.map((trial) => trial.scenarios[index].metrics[action])),
    ])) as Record<OrderBenchmarkAction, OrderBenchmarkTimings>,
  }))

  // Keep validation out of the timed workload.
  for (const trial of trials) {
    for (const scenario of trial.scenarios) {
      for (const action of ACTIONS) {
        if (TIMING_STAGES.some((stage) => !Number.isFinite(scenario.metrics[action][stage]) || scenario.metrics[action][stage] < 0)) {
          throw new Error('Benchmark produced an invalid timing')
        }
      }
    }
  }

  return {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    environment: {
      runtime: typeof window === 'undefined' ? 'node' : 'browser',
      userAgent: typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent,
      logicalCpus: typeof navigator === 'undefined' ? null : navigator.hardwareConcurrency ?? null,
      appVersion: null,
      appBuild: null,
    },
    protocol: ORDER_BENCHMARK_PROTOCOL,
    trials,
    means,
  }
}

export const runOrderBenchmark = async (options: BenchmarkOptions = {}): Promise<OrderBenchmarkResult> => {
  const trials: OrderBenchmarkTrial[] = []

  for (let run = 1; run <= ORDER_BENCHMARK_PROTOCOL.runs; run += 1) {
    trials.push(await runOrderBenchmarkTrial(run, options))
  }

  throwIfAborted(options.signal)
  const result = summarizeOrderBenchmark(trials)

  if (typeof window !== 'undefined') {
    const info = await readAppInfo(options.signal)
    if (info) {
      result.environment.appVersion = info.version
      result.environment.appBuild = info.build
    }
  }

  throwIfAborted(options.signal)
  return result
}
