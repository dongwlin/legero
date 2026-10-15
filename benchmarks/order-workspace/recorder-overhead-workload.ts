import { performance } from 'node:perf_hooks'
import { randomUUID } from 'node:crypto'
import {
  createPerformanceRecorder,
  type PerformanceRecorderEnvironment,
  type PerformanceRecordingSnapshot,
} from '@/services/performanceRecorder'

const WARMUP_CALLS = 1_000
const MEASURED_CALLS = 5_000
const MAX_SAMPLES = 2_000
const run = Number(process.argv[2])
if (!Number.isInteger(run) || run < 1 || run > 5) throw new Error('Expected trial number 1 through 5')
const conditions = run % 2 === 1 ? ['disabled', 'enabled'] as const : ['enabled', 'disabled'] as const
const sessionIds: string[] = []
const timers = new Set<ReturnType<typeof setTimeout>>()
const environment: PerformanceRecorderEnvironment = {
  now: () => performance.now(), wallNow: () => Date.now(),
  randomId: () => { const id = randomUUID(); sessionIds.push(id); return id },
  // Node observers are intentionally excluded: this isolates stage collector overhead.
  supportedEntryTypes: [],
  setTimer: (callback, delay) => {
    const timer = setTimeout(() => { timers.delete(timer); callback() }, delay)
    timers.add(timer)
    return timer
  },
  clearTimer: (timer) => { clearTimeout(timer as ReturnType<typeof setTimeout>); timers.delete(timer as ReturnType<typeof setTimeout>) },
  mark: (name) => { performance.mark(name) },
  measure: (name, start, end) => { performance.measure(name, start, end) },
  clearMark: (name) => performance.clearMarks(name),
  clearMeasure: (name) => performance.clearMeasures(name),
}
const ownedUserTimingCounts = () => {
  const owned = (name: string) => sessionIds.some((id) => name.startsWith(`legero-perf:${id}:`))
  return {
    marks: performance.getEntriesByType('mark').filter((entry) => owned(entry.name)).length,
    measures: performance.getEntriesByType('measure').filter((entry) => owned(entry.name)).length,
  }
}
const observations: {
  condition: 'disabled' | 'enabled'; warmupCalls: number; measuredCalls: number;
  measuredTotalMs: number; measuredPerCallMeanMs: number;
  activeBeforeStop: boolean; statusAfterStop: PerformanceRecordingSnapshot['status'] | 'never_started';
  retainedSamples: number; droppedSamples: number; incompleteStages: number;
  capabilities: PerformanceRecordingSnapshot['capabilities'] | null;
  cleanup: { activeTimers: number; remainingMarks: number; remainingMeasures: number };
}[] = []

for (const condition of conditions) {
  const recorder = createPerformanceRecorder(environment)
  if (condition === 'enabled') recorder.start({ maxDurationMs: 120_000, maxSamples: MAX_SAMPLES, profilingBuild: false })
  let snapshot: PerformanceRecordingSnapshot | null
  let measuredTotalMs: number
  let activeBeforeStop: boolean
  try {
    for (let index = 0; index < WARMUP_CALLS; index += 1) {
      const stage = recorder.beginStage('store_commit')
      // Fixed empty workload: no order/store operation occurs here.
      recorder.finishStage(stage)
    }
    const started = performance.now()
    for (let index = 0; index < MEASURED_CALLS; index += 1) {
      const stage = recorder.beginStage('store_commit')
      recorder.finishStage(stage)
    }
    measuredTotalMs = performance.now() - started
    activeBeforeStop = recorder.isActive()
  } finally {
    // Snapshot cloning, timer disposal and verification are outside measuredTotalMs.
    snapshot = recorder.stop()
  }
  const remaining = ownedUserTimingCounts()
  const observation = {
    condition, warmupCalls: WARMUP_CALLS, measuredCalls: MEASURED_CALLS,
    measuredTotalMs, measuredPerCallMeanMs: measuredTotalMs / MEASURED_CALLS,
    activeBeforeStop, statusAfterStop: snapshot?.status ?? 'never_started' as const,
    retainedSamples: snapshot?.samples.length ?? 0, droppedSamples: snapshot?.droppedSamples ?? 0,
    incompleteStages: snapshot?.incompleteStages ?? 0, capabilities: snapshot?.capabilities ?? null,
    cleanup: { activeTimers: timers.size, remainingMarks: remaining.marks, remainingMeasures: remaining.measures },
  }
  observations.push(observation)
  console.log(JSON.stringify({ type: 'checkpoint', observation }))
  const enabled = condition === 'enabled'
  // Start adds one resource-trend bookkeeping sample. All 6,000 stage samples use real User Timing.
  const expectedSamples = enabled ? MAX_SAMPLES : 0
  const expectedDrops = enabled ? WARMUP_CALLS + MEASURED_CALLS + 1 - MAX_SAMPLES : 0
  if (!Number.isFinite(measuredTotalMs) || measuredTotalMs < 0
    || activeBeforeStop !== enabled || snapshot?.status === 'duration_limit'
    || observation.retainedSamples !== expectedSamples || observation.droppedSamples !== expectedDrops
    || observation.incompleteStages !== 0 || timers.size !== 0 || remaining.marks !== 0 || remaining.measures !== 0) {
    throw new Error('Recorder overhead correctness or cleanup verification failed')
  }
}
console.log(JSON.stringify({ type: 'result', result: { run, status: 'completed', conditionOrder: conditions, observations } }))
