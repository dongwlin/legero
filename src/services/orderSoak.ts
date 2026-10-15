import { getBuildMetadata } from '@/services/buildMetadata'
import { createBenchmarkStore } from '@/services/orderBenchmarkScenes'
import { makeBenchmarkOrders, ORDER_BENCHMARK_REFERENCE_TIME } from '@/services/orderBenchmarkFixtures'
import { createOrderOptimistic } from '@/services/orderOptimistic'
import { countTodayOrders, selectTodayOrderIds } from '@/services/orderWorkspaceView'
import { toggleOrderServed, toggleOrderStepStatus } from '@/services/orderStatus'
import { compareOrderRecordsByTimeline } from '@/services/orderSorting'
import type { OrderBenchmarkStatus } from '@/services/orderBenchmarkTypes'

export const ORDER_SOAK_PROFILES = {
  quick: { roundDurationMs: 1000, intervalMs: 50 },
  '2h': { roundDurationMs: 2 * 60 * 60 * 1000, intervalMs: 200 },
  '8h': { roundDurationMs: 8 * 60 * 60 * 1000, intervalMs: 200 },
} as const
export const ORDER_SOAK_SEQUENCE = ['meat', 'staple', 'served', 'remote-batch-10', 'failed-toggle-rollback', 'snapshot-journal-prune'] as const
export type OrderSoakProfile = keyof typeof ORDER_SOAK_PROFILES
export type OrderSoakHeap = { bytes: number | null; source: string; unavailableReason: string | null }
export type OrderSoakSample = {
  operation: typeof ORDER_SOAK_SEQUENCE[number]
  sequence: number
  elapsedMs: number
  storeCommitMs: number
  viewDerivationMs: number
  totalMs: number
  heap: OrderSoakHeap
}
export type OrderSoakStatistics = { count: number; meanMs: number | null; minMs: number | null; maxMs: number | null; standardDeviationMs: number | null }
export type OrderSoakWindow = { startedAtElapsedMs: number; finishedAtElapsedMs: number; operationCount: number; failureCount: number; statistics: OrderSoakStatistics }
export type OrderSoakRound = {
  run: number
  status: OrderBenchmarkStatus
  elapsedMs: number
  operationCount: number
  failureCount: number
  failure: string | null
  retainedSamples: OrderSoakSample[]
  droppedSamples: number
  windows: OrderSoakWindow[]
  droppedWindows: number
  statistics: OrderSoakStatistics
  resources: { harnessSubscriptionsBeforeCleanup: number; harnessSubscriptionsAfterCleanup: number; initialHeap: OrderSoakHeap; finalHeap: OrderSoakHeap; actualWebSocketConnections: null }
}
export type OrderSoakOptions = {
  profile?: OrderSoakProfile
  signal?: AbortSignal
  totalOrders?: number
  todayOrders?: number
  roundDurationMs?: number
  intervalMs?: number
  sampleCapacity?: number
  windowCapacity?: number
  windowMs?: number
  readHeap?: () => OrderSoakHeap
  onProgress?: (progress: { run: number; operationCount: number; elapsedMs: number }) => void
}
export type OrderSoakResult = {
  schemaVersion: 1
  type: 'isolated-order-soak'
  sceneId: 'L01'
  status: OrderBenchmarkStatus
  capturedAt: string
  build: ReturnType<typeof getBuildMetadata>
  protocol: {
    version: 1
    plannedRounds: 5
    profile: OrderSoakProfile
    roundDurationMs: number
    intervalMs: number
    totalOrders: number
    todayOrders: number
    sequence: typeof ORDER_SOAK_SEQUENCE
    referenceTime: string
    sampleCapacityPerRound: number
    windowCapacityPerRound: number
    windowMs: number
    retention: string
    boundaries: string
    excludes: string[]
    overhead: string
  }
  rounds: OrderSoakRound[]
  fiveRoundMeanMs: number | null
}

const createStatistics = () => {
  let count = 0
  let mean = 0
  let m2 = 0
  let min = Infinity
  let max = -Infinity
  return {
    add(value: number) {
      count += 1
      const difference = value - mean
      mean += difference / count
      m2 += difference * (value - mean)
      min = Math.min(min, value)
      max = Math.max(max, value)
    },
    read(): OrderSoakStatistics {
      return { count, meanMs: count ? mean : null, minMs: count ? min : null, maxMs: count ? max : null, standardDeviationMs: count ? Math.sqrt(m2 / count) : null }
    },
  }
}
const browserHeap = (): OrderSoakHeap => {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize
  return typeof memory === 'number' && Number.isFinite(memory)
    ? { bytes: memory, source: 'performance.memory.usedJSHeapSize', unavailableReason: null }
    : { bytes: null, source: 'unavailable', unavailableReason: 'JS heap API unavailable; Android process memory is not measured' }
}
const abortableDelay = (ms: number, signal?: AbortSignal): Promise<void> => new Promise((resolve) => {
  if (signal?.aborted) { resolve(); return }
  const finish = () => { clearTimeout(timer); signal?.removeEventListener('abort', finish); resolve() }
  const timer = setTimeout(finish, ms)
  signal?.addEventListener('abort', finish, { once: true })
})

/** Fixed-size store with controlled synchronous delivery; five cold stores, never the live workspace. */
export const runOrderSoak = async (options: OrderSoakOptions = {}): Promise<OrderSoakResult> => {
  const profile = options.profile ?? 'quick'
  const preset = ORDER_SOAK_PROFILES[profile]
  if (!preset) throw new Error('Invalid soak profile')
  const roundDurationMs = options.roundDurationMs ?? preset.roundDurationMs
  const intervalMs = options.intervalMs ?? preset.intervalMs
  const totalOrders = options.totalOrders ?? 520
  const todayOrders = options.todayOrders ?? 130
  const sampleCapacity = options.sampleCapacity ?? 1000
  const windowCapacity = options.windowCapacity ?? 120
  const windowMs = options.windowMs ?? 60_000
  if (!Number.isFinite(roundDurationMs) || roundDurationMs < 1 || roundDurationMs > ORDER_SOAK_PROFILES['8h'].roundDurationMs
    || !Number.isFinite(intervalMs) || intervalMs < 10 || intervalMs > 60_000
    || !Number.isInteger(totalOrders) || !Number.isInteger(todayOrders) || todayOrders < 20 || todayOrders > 520 || totalOrders < todayOrders || totalOrders > 50_000
    || !Number.isInteger(sampleCapacity) || sampleCapacity < 1 || sampleCapacity > 5000
    || !Number.isInteger(windowCapacity) || windowCapacity < 1 || windowCapacity > 1000
    || !Number.isFinite(windowMs) || windowMs < 1) throw new Error('Invalid soak configuration')
  const readHeap = (): OrderSoakHeap => {
    try {
      const value = (options.readHeap ?? browserHeap)()
      return value.bytes === null || Number.isFinite(value.bytes) && value.bytes >= 0
        ? value : { bytes: null, source: 'unavailable', unavailableReason: 'Heap probe returned invalid data' }
    } catch { return { bytes: null, source: 'unavailable', unavailableReason: 'Heap probe failed' } }
  }
  const result: OrderSoakResult = {
    schemaVersion: 1, type: 'isolated-order-soak', sceneId: 'L01', status: 'completed', capturedAt: new Date().toISOString(), build: getBuildMetadata(),
    protocol: {
      version: 1, plannedRounds: 5, profile, roundDurationMs, intervalMs, totalOrders, todayOrders,
      sequence: ORDER_SOAK_SEQUENCE, referenceTime: ORDER_BENCHMARK_REFERENCE_TIME,
      sampleCapacityPerRound: sampleCapacity, windowCapacityPerRound: windowCapacity, windowMs,
      retention: 'latest bounded samples/windows per round; round statistics include all successful operations using constant-space online aggregation; no percentiles',
      boundaries: 'synchronous isolated store/journal action through all-list/count derivation; correctness, heap probes and scheduling excluded; each cold round excludes fixture creation/injection',
      excludes: ['real WebSocket connections/reconnects and network', 'React render/layout/paint', 'Android process memory', 'foreground/background lifecycle and business-day changes', 'historical data growth (fixed fixture size)'],
      overhead: 'one owned store subscription; bounded samples/windows; one heap probe and correctness checks per operation outside timed action; these can affect later scheduling and GC',
    },
    rounds: [], fiveRoundMeanMs: null,
  }
  for (let run = 1; run <= 5; run += 1) {
    const store = createBenchmarkStore()
    const journal = createOrderOptimistic()
    const aggregate = createStatistics()
    let windowAggregate = createStatistics()
    let windowStarted = 0
    let windowOperations = 0
    let windowFailures = 0
    let unsubscribe: (() => void) | undefined
    let subscriptions = 0
    let started = performance.now()
    const round: OrderSoakRound = {
      run, status: 'completed', elapsedMs: 0, operationCount: 0, failureCount: 0, failure: null,
      retainedSamples: [], droppedSamples: 0, windows: [], droppedWindows: 0,
      statistics: aggregate.read(), resources: { harnessSubscriptionsBeforeCleanup: 0, harnessSubscriptionsAfterCleanup: 0, initialHeap: readHeap(), finalHeap: readHeap(), actualWebSocketConnections: null },
    }
    result.rounds.push(round)
    const finishWindow = (elapsed: number) => {
      if (!windowOperations && !windowFailures) return
      round.windows.push({ startedAtElapsedMs: windowStarted, finishedAtElapsedMs: elapsed, operationCount: windowOperations, failureCount: windowFailures, statistics: windowAggregate.read() })
      if (round.windows.length > windowCapacity) { round.windows.shift(); round.droppedWindows += 1 }
      windowStarted = elapsed
      windowOperations = 0
      windowFailures = 0
      windowAggregate = createStatistics()
    }
    try {
      const orders = await makeBenchmarkOrders(totalOrders, todayOrders, options.signal)
      store.getState().setOrders(orders)
      unsubscribe = store.subscribe(() => {})
      subscriptions = 1
      started = performance.now()
      let sequence = 0
      while (performance.now() - started < roundDurationMs) {
        if (options.signal?.aborted) throw new DOMException('Soak cancelled', 'AbortError')
        const operation = ORDER_SOAK_SEQUENCE[sequence % ORDER_SOAK_SEQUENCE.length]
        const current = store.getState().ordersById[orders[operation === 'served' ? 4 : 1].id]
        let expected = current
        let expectedRemote: typeof orders = []
        let storeCommitMs = 0
        const commit = (callback: () => void) => { const at = performance.now(); callback(); storeCommitMs += performance.now() - at }
        const at = performance.now()
        if (operation === 'remote-batch-10') {
          const updated = orders.slice(10, 20).map((order) => ({ ...store.getState().ordersById[order.id], version: store.getState().ordersById[order.id].version + 1 }))
          expectedRemote = updated
          commit(() => { store.getState().upsertOrdersIfNewer(updated) })
        } else if (operation === 'snapshot-journal-prune') {
          const marker = journal.captureSnapshotMarker()
          commit(() => { store.getState().setOrders(Object.values(store.getState().ordersById)) })
          journal.prune(marker)
        } else {
          const generation = journal.beginMutation(current.id, current)
          const next = operation === 'served' ? toggleOrderServed(current, ORDER_BENCHMARK_REFERENCE_TIME) : toggleOrderStepStatus(current, operation === 'staple' ? 'staple' : 'meat')
          commit(() => { store.getState().upsertOrder(next) })
          if (journal.endMutation(current.id, generation)) {
            if (operation === 'failed-toggle-rollback') commit(() => { store.getState().upsertOrder(current) })
            else {
              expected = { ...next, version: current.version + 1 }
              commit(() => { store.getState().upsertIfNewer(expected) })
              journal.recordUpsert(expected)
            }
          }
        }
        const viewStarted = performance.now()
        const state = store.getState()
        const counts = countTodayOrders(state.ordersById, state.orderDisplayIds, ORDER_BENCHMARK_REFERENCE_TIME)
        const ids = selectTodayOrderIds(state.ordersById, state.orderDisplayIds, 'all', ORDER_BENCHMARK_REFERENCE_TIME)
        const finished = performance.now()
        const sample: OrderSoakSample = { operation, sequence, elapsedMs: finished - started, storeCommitMs, viewDerivationMs: finished - viewStarted, totalMs: finished - at, heap: readHeap() }
        if (state.orderDisplayIds.length !== totalOrders || Object.keys(state.ordersById).length !== totalOrders
          || counts.todayCompletedCount + counts.uncompletedCount !== todayOrders || ids.length !== todayOrders
          || state.ordersById[current.id] !== expected || journal.hasPending(current.id)
          || expectedRemote.some((record) => state.ordersById[record.id] !== record)
          || state.orderDisplayIds.some((id, index, all) => index > 0 && compareOrderRecordsByTimeline(state.ordersById[all[index - 1]], state.ordersById[id]) > 0)) throw new Error('Soak correctness check failed')
        round.operationCount += 1
        windowOperations += 1
        aggregate.add(sample.totalMs)
        windowAggregate.add(sample.totalMs)
        round.retainedSamples.push(sample)
        if (round.retainedSamples.length > sampleCapacity) { round.retainedSamples.shift(); round.droppedSamples += 1 }
        if (sample.elapsedMs - windowStarted >= windowMs) finishWindow(sample.elapsedMs)
        options.onProgress?.({ run, operationCount: round.operationCount, elapsedMs: sample.elapsedMs })
        sequence += 1
        // Fixed-rate target without overlapping operations; slow actions reduce the achieved rate.
        const nextAt = Math.min(started + roundDurationMs, started + sequence * intervalMs)
        await abortableDelay(Math.max(0, nextAt - performance.now()), options.signal)
      }
      if (options.signal?.aborted) throw new DOMException('Soak cancelled', 'AbortError')
    } catch (error) {
      const cancelled = options.signal?.aborted || error instanceof DOMException && error.name === 'AbortError'
      round.status = cancelled ? 'cancelled' : 'failed'
      round.failure = cancelled ? 'ABORTED' : 'EXECUTION_OR_CORRECTNESS_FAILED'
      if (!cancelled) { round.failureCount += 1; windowFailures += 1 }
      result.status = round.status
    } finally {
      round.elapsedMs = performance.now() - started
      finishWindow(round.elapsedMs)
      round.statistics = aggregate.read()
      round.resources.harnessSubscriptionsBeforeCleanup = subscriptions
      unsubscribe?.()
      subscriptions = 0
      round.resources.harnessSubscriptionsAfterCleanup = subscriptions
      journal.reset()
      store.getState().resetSyncState()
      round.resources.finalHeap = readHeap()
    }
    if (round.status !== 'completed') break
  }
  if (result.rounds.length === 5 && result.rounds.every((round) => round.status === 'completed' && round.statistics.meanMs !== null)) {
    result.fiveRoundMeanMs = result.rounds.reduce((sum, round) => sum + round.statistics.meanMs!, 0) / 5
  }
  return result
}
