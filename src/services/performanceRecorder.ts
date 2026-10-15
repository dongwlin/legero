import { getBuildMetadata } from '@/services/buildMetadata'

/** Opt-in, in-memory field observations. No payload, URL, DOM target or business ID is accepted. */
export type PerformanceStage =
  | 'api_headers' | 'api_body' | 'api_decode' | 'request_round_trip'
  | 'snapshot_conversion' | 'snapshot_merge' | 'buffer_replay'
  | 'workspace_ready_state' | 'realtime_ready' | 'realtime_decode'
  | 'sync_receive_to_state' | 'sync_receive_to_commit_approximation' | 'workspace_first_commit_approximation' | 'store_commit' | 'server_ack'
  | 'react_render_orders' | 'react_render_statistics' | 'react_render_form'
  | 'event_interaction' | 'event_ungrouped' | 'long_task' | 'long_animation_frame'
  | 'scroll_frame_interval' | 'resource' | 'resource_trend'
  | 'lifecycle_hidden' | 'lifecycle_visible'

export type PerformanceOutcome = 'success' | 'failure' | 'cancelled'
export type PerformanceCounters = Partial<Record<
  'inputCount' | 'uniqueCount' | 'acceptedCount' | 'pageCount' | 'byteCount'
  | 'eventCount' | 'heapUsedBytes' | 'resourceCount' | 'phaseCode'
  | 'serverDurationMs' | 'databaseDurationMs', number>>
export type PerformanceSample = {
  sequence: number
  correlation: string
  stage: PerformanceStage
  startMs: number
  durationMs: number
  outcome: PerformanceOutcome
  counters: PerformanceCounters
}
export type PerformanceCapability = { status: 'available' | 'unavailable'; reason: string | null }
export type PerformanceRecordingOptions = {
  maxDurationMs?: number
  maxSamples?: number
  eventDurationThresholdMs?: number
  profilingBuild?: boolean
}
export type PerformanceRecordingSnapshot = {
  type: 'legero-field-performance'
  schemaVersion: 1
  build: ReturnType<typeof getBuildMetadata>
  environment: { userAgent: string | null; deviceModel: null; androidVersion: null; webViewVersion: null; unavailableReason: string }
  sessionId: string
  status: 'recording' | 'stopped' | 'cancelled' | 'duration_limit'
  startedAt: string
  elapsedMs: number
  profilingBuild: boolean
  limits: { maxDurationMs: number; maxSamples: number; maxActiveStages: number; eventDurationThresholdMs: number }
  retention: 'most_recent_samples'
  droppedSamples: number
  droppedStages: number
  incompleteStages: number
  capabilities: Record<'eventTiming' | 'longTasks' | 'longAnimationFrames' | 'resources' | 'scrollFrames' | 'heap' | 'reactProfiler', PerformanceCapability>
  eventTiming: {
    observedInputs: number
    reportedEvents: number
    ungroupedEvents: number
    reportedInteractions: number
    grouping: 'not_yet_observed' | 'available' | 'unavailable_for_some_reported_events'
    retainedReportedInteractionCount: number
    retainedReportedInteractionMeanMs: number | null
    interpretation: 'reported_entries_only_not_all_interactions_or_page_inp'
    coverage: 'reported_interactions' | 'inputs_without_reported_interactions' | 'no_observed_input' | 'unavailable'
  }
  samples: PerformanceSample[]
  boundaries: readonly string[]
}

// Narrow adapter makes observer delivery, clocks and teardown deterministic in tests.
export type RecordedPerformanceEntry = {
  entryType: string
  startTime: number
  duration: number
  interactionId?: number
  transferSize?: number
}
export type PerformanceRecorderEnvironment = {
  now: () => number
  wallNow: () => number
  randomId: () => string
  supportedEntryTypes: readonly string[]
  observe?: (type: string, callback: (entries: readonly RecordedPerformanceEntry[]) => void, durationThreshold?: number) => () => void
  listen?: (type: 'input' | 'scroll' | 'visibility', callback: (hidden?: boolean) => void) => () => void
  setTimer: (callback: () => void, ms: number) => unknown
  clearTimer: (id: unknown) => void
  requestFrame?: (callback: (time: number) => void) => number
  cancelFrame?: (id: number) => void
  heapUsedBytes?: () => number | null
  resourceCount?: () => number
  mark?: (name: string) => void
  measure?: (name: string, start: string, end: string) => void
  clearMark?: (name: string) => void
  clearMeasure?: (name: string) => void
}
export type PerformanceStageToken = { readonly sessionId: string; readonly id: number; readonly correlation: string }
type ActiveStage = { token: PerformanceStageToken; stage: PerformanceStage; started: number; mark: string }
const MAX_ACTIVE_STAGES = 128
const BOUNDARIES = [
  'Durations use one local monotonic clock; overlapping stages must not be added.',
  'State completion and React commit/render do not prove pixels have been presented.',
  'Commit approximations use the first subsequent orders-subtree Profiler commit, which may include unrelated changes; target state presentation and businessFeedbackMs are unavailable.',
  'react_render startMs is callback receipt time and actualDuration is React-reported work; concurrent render may not occupy a contiguous wall-clock interval.',
  'sync_receive_to_state starts at the decoded-event hook callback; realtime_decode is separate and both exclude earlier network queueing.',
  'Handler stages exclude input queueing before callback entry.',
  'Interaction grouping is bounded by the retained sample window; evicted groups may be counted again if reported later.',
  'Event Timing includes reported entries above the configured threshold only; no page INP is calculated.',
  'Scroll intervals are rAF callback intervals during scrolling, not proof of presented frames.',
  'Heap is optional JS heap observation, not Android process memory or proof of a leak.',
  'Recording starts observing future activity only and never initiates business operations.',
] as const
const available = (): PerformanceCapability => ({ status: 'available', reason: null })
const unavailable = (reason: string): PerformanceCapability => ({ status: 'unavailable', reason })
const numeric = (value: number) => Number.isFinite(value) && value >= 0
const clamp = (value: number | undefined, fallback: number, minimum: number, maximum: number) =>
  value === undefined || !Number.isFinite(value) ? fallback : Math.min(maximum, Math.max(minimum, Math.floor(value)))
const COUNTER_KEYS: (keyof PerformanceCounters)[] = [
  'inputCount', 'uniqueCount', 'acceptedCount', 'pageCount', 'byteCount', 'eventCount',
  'heapUsedBytes', 'resourceCount', 'phaseCode', 'serverDurationMs', 'databaseDurationMs',
]
const sanitizeCounters = (counters: PerformanceCounters): PerformanceCounters => {
  const clean: PerformanceCounters = {}
  for (const key of COUNTER_KEYS) {
    const value = counters[key]
    if (value !== undefined && numeric(value)) clean[key] = value
  }
  return clean
}

export const createPerformanceRecorder = (environment: PerformanceRecorderEnvironment) => {
  let recording: PerformanceRecordingSnapshot | null = null
  let start = 0
  let sequence = 0
  let stageSequence = 0
  let timer: unknown
  let trendTimer: unknown
  let frameId: number | null = null
  let lastScrollAt = -Infinity
  let previousFrame: number | null = null
  const activeStages = new Map<number, ActiveStage>()
  const interactionSamples = new Map<number, PerformanceSample>()
  const pendingCommits: { stage: PerformanceStage; started: number; correlation: string }[] = []
  const disposers: (() => void)[] = []
  const listeners = new Set<() => void>()
  const active = () => recording?.status === 'recording'
  const notify = () => { for (const listener of listeners) listener() }
  const cleanMarks = (stage: ActiveStage) => {
    try {
      environment.clearMark?.(stage.mark)
      environment.clearMark?.(`${stage.mark}:end`)
      environment.clearMeasure?.(stage.mark)
    } catch { /* Diagnostic cleanup is best effort on older runtimes. */ }
  }
  const append = (
    stage: PerformanceStage, started: number, durationMs: number,
    outcome: PerformanceOutcome = 'success', counters: PerformanceCounters = {},
    correlation?: string,
  ): PerformanceSample | null => {
    if (!active() || !recording || !numeric(durationMs)) return null
    if (environment.now() - start >= recording.limits.maxDurationMs) { finishRecording('duration_limit'); return null }
    const sample: PerformanceSample = {
      sequence: ++sequence, correlation: correlation ?? `${recording.sessionId}:sample:${sequence}`,
      stage, startMs: Math.max(0, started - start), durationMs, outcome,
      counters: sanitizeCounters(counters),
    }
    if (recording.samples.length >= recording.limits.maxSamples) {
      const evicted = recording.samples.shift()
      recording.droppedSamples += 1
      // Interaction lookup must be bounded by the same retention window.
      if (evicted?.stage === 'event_interaction') {
        for (const [id, group] of interactionSamples) {
          if (group === evicted) { interactionSamples.delete(id); break }
        }
      }
    }
    recording.samples.push(sample)
    return sample
  }
  const getSnapshot = (): PerformanceRecordingSnapshot | null => {
    if (!recording) return null
    if (active() && environment.now() - start >= recording.limits.maxDurationMs) return finishRecording('duration_limit')
    const interactions = recording.samples.filter((sample) => sample.stage === 'event_interaction')
    const eventTiming = { ...recording.eventTiming }
    eventTiming.retainedReportedInteractionCount = interactions.length
    eventTiming.retainedReportedInteractionMeanMs = interactions.length
      ? interactions.reduce((sum, sample) => sum + sample.durationMs, 0) / interactions.length : null
    eventTiming.coverage = recording.capabilities.eventTiming.status === 'unavailable'
      ? 'unavailable' : eventTiming.reportedInteractions > 0 ? 'reported_interactions'
        : eventTiming.observedInputs > 0 ? 'inputs_without_reported_interactions' : 'no_observed_input'
    return {
      ...recording, elapsedMs: active() ? Math.max(0, environment.now() - start) : recording.elapsedMs,
      limits: { ...recording.limits }, eventTiming,
      capabilities: Object.fromEntries(Object.entries(recording.capabilities).map(([key, value]) => [key, { ...value }])) as PerformanceRecordingSnapshot['capabilities'],
      samples: recording.samples.map((sample) => ({ ...sample, counters: { ...sample.counters } })),
    }
  }
  const finishRecording = (status: 'stopped' | 'cancelled' | 'duration_limit'): PerformanceRecordingSnapshot | null => {
    if (!active() || !recording) return getSnapshot()
    recording.elapsedMs = Math.max(0, environment.now() - start)
    recording.status = status
    environment.clearTimer(timer)
    environment.clearTimer(trendTimer)
    timer = undefined
    trendTimer = undefined
    if (frameId !== null) environment.cancelFrame?.(frameId)
    frameId = null
    for (const dispose of disposers.splice(0)) dispose()
    recording.incompleteStages += activeStages.size + pendingCommits.length
    pendingCommits.length = 0
    for (const stage of activeStages.values()) cleanMarks(stage)
    activeStages.clear()
    interactionSamples.clear()
    notify()
    return getSnapshot()
  }
  const beginStage = (stage: PerformanceStage, parent?: PerformanceStageToken | null): PerformanceStageToken | null => {
    if (!active() || !recording) return null
    if (environment.now() - start >= recording.limits.maxDurationMs) { finishRecording('duration_limit'); return null }
    if (activeStages.size >= MAX_ACTIVE_STAGES) { recording.droppedStages += 1; return null }
    const id = ++stageSequence
    const token = { sessionId: recording.sessionId, id, correlation: parent?.sessionId === recording.sessionId ? parent.correlation : `${recording.sessionId}:${id}` }
    const mark = `legero-perf:${token.sessionId}:${token.id}`
    activeStages.set(token.id, { token, stage, started: environment.now(), mark })
    try { environment.mark?.(mark) } catch { /* A diagnostic cannot interrupt business work. */ }
    return token
  }
  const finishStage = (token: PerformanceStageToken | null, outcome: PerformanceOutcome = 'success', counters: PerformanceCounters = {}, endedAt?: number) => {
    if (!token || !active() || token.sessionId !== recording?.sessionId) return
    const stage = activeStages.get(token.id)
    if (!stage) return
    const now = Math.min(environment.now(), Math.max(stage.started, endedAt ?? environment.now()))
    try {
      environment.mark?.(`${stage.mark}:end`)
      environment.measure?.(stage.mark, stage.mark, `${stage.mark}:end`)
    } catch { /* Some older WebViews expose incomplete User Timing support. */ }
    finally { cleanMarks(stage) }
    const sample = append(stage.stage, stage.started, Math.max(0, now - stage.started), outcome, counters, token.correlation)
    // append can hit the deadline, dispose this session and notify a listener that starts another.
    if (!sample || !active() || recording?.sessionId !== token.sessionId) return
    activeStages.delete(token.id)
    if (recording.profilingBuild && outcome === 'success' && (stage.stage === 'sync_receive_to_state' || stage.stage === 'workspace_ready_state')) {
      if (pendingCommits.length >= MAX_ACTIVE_STAGES) { pendingCommits.shift(); recording.droppedStages += 1 }
      pendingCommits.push({ stage: stage.stage === 'sync_receive_to_state' ? 'sync_receive_to_commit_approximation' : 'workspace_first_commit_approximation', started: stage.started, correlation: token.correlation })
    }
  }
  const recordReactRender = (area: 'orders' | 'statistics' | 'form', actualDuration: number, phase: 'mount' | 'update' | 'nested-update', commitTime?: number) => {
    if (!active() || !recording?.profilingBuild || !numeric(actualDuration)) return
    const sessionId = recording.sessionId
    const sample = append(`react_render_${area}`, environment.now(), actualDuration, 'success', { phaseCode: phase === 'mount' ? 0 : phase === 'update' ? 1 : 2 })
    if (!sample || !active() || recording?.sessionId !== sessionId) return
    if (area === 'orders') {
      for (const marker of pendingCommits.splice(0)) {
        if (!active() || recording?.sessionId !== sessionId) break
        append(marker.stage, marker.started, Math.max(0, (commitTime ?? environment.now()) - marker.started), 'success', {}, marker.correlation)
      }
    }
  }
  const sampleResources = (sessionId: string) => {
    if (!active() || recording?.sessionId !== sessionId) return
    const heap = environment.heapUsedBytes?.()
    append('resource_trend', environment.now(), 0, 'success', {
      ...(heap !== null && heap !== undefined ? { heapUsedBytes: heap } : {}),
      ...(environment.resourceCount ? { resourceCount: environment.resourceCount() } : {}),
    })
    if (!active() || recording?.sessionId !== sessionId) return
    trendTimer = environment.setTimer(() => sampleResources(sessionId), 10_000)
  }
  const startRecording = (options: PerformanceRecordingOptions = {}) => {
    if (active()) throw new Error('A performance recording is already active.')
    // Keep a new session clean even if a prior callback crossed its deadline during teardown.
    pendingCommits.length = 0
    interactionSamples.clear()
    for (const stage of activeStages.values()) cleanMarks(stage)
    activeStages.clear()
    start = environment.now()
    sequence = 0
    stageSequence = 0
    previousFrame = null
    lastScrollAt = -Infinity
    const threshold = Math.round(clamp(options.eventDurationThresholdMs, 40, 16, 104) / 8) * 8
    recording = {
      type: 'legero-field-performance', schemaVersion: 1, build: getBuildMetadata(),
      environment: { userAgent: typeof navigator === 'undefined' ? null : navigator.userAgent, deviceModel: null, androidVersion: null, webViewVersion: null, unavailableReason: 'Device model and Android/WebView versions require native device metadata or external inspection; userAgent is retained without version inference.' },
      sessionId: environment.randomId(), status: 'recording', startedAt: new Date(environment.wallNow()).toISOString(), elapsedMs: 0,
      profilingBuild: options.profilingBuild ?? false,
      limits: { maxDurationMs: clamp(options.maxDurationMs, 120_000, 1_000, 600_000), maxSamples: clamp(options.maxSamples, 2_000, 1, 10_000), maxActiveStages: MAX_ACTIVE_STAGES, eventDurationThresholdMs: threshold },
      retention: 'most_recent_samples', droppedSamples: 0, droppedStages: 0, incompleteStages: 0,
      capabilities: {
        eventTiming: unavailable('PerformanceObserver event entries unavailable'),
        longTasks: unavailable('PerformanceObserver longtask entries unavailable'),
        longAnimationFrames: unavailable('PerformanceObserver long-animation-frame entries unavailable'),
        resources: unavailable('PerformanceObserver resource entries unavailable'),
        scrollFrames: environment.requestFrame && environment.listen ? available() : unavailable('Scroll/rAF APIs unavailable'),
        heap: environment.heapUsedBytes?.() != null ? available() : unavailable('Nonstandard performance.memory unavailable'),
        reactProfiler: options.profilingBuild ? available() : unavailable('Requires a dedicated React profiling build'),
      },
      eventTiming: { observedInputs: 0, reportedEvents: 0, ungroupedEvents: 0, reportedInteractions: 0, grouping: 'not_yet_observed', retainedReportedInteractionCount: 0, retainedReportedInteractionMeanMs: null, interpretation: 'reported_entries_only_not_all_interactions_or_page_inp', coverage: 'no_observed_input' },
      samples: [], boundaries: BOUNDARIES,
    }
    const sessionId = recording.sessionId
    const current = () => active() && recording?.sessionId === sessionId
    const observers = [
      ['event', 'eventTiming', 'event_interaction'], ['longtask', 'longTasks', 'long_task'],
      ['long-animation-frame', 'longAnimationFrames', 'long_animation_frame'], ['resource', 'resources', 'resource'],
    ] as const
    for (const [type, capability, stage] of observers) {
      if (!environment.observe || !environment.supportedEntryTypes.includes(type)) continue
      try {
        const dispose = environment.observe(type, (entries) => {
          if (!current() || !recording) return
          for (const entry of entries) {
            if (!current()) break
            if (environment.now() - start >= recording.limits.maxDurationMs) { finishRecording('duration_limit'); return }
            if (!numeric(entry.duration) || !numeric(entry.startTime) || entry.startTime < start) continue
            if (type === 'event') {
              recording.eventTiming.reportedEvents += 1
              const id = entry.interactionId
              if (id === undefined || !Number.isSafeInteger(id) || id <= 0) {
                recording.eventTiming.ungroupedEvents += 1
                recording.eventTiming.grouping = 'unavailable_for_some_reported_events'
                append('event_ungrouped', entry.startTime, entry.duration)
                continue
              }
              if (recording.eventTiming.grouping === 'not_yet_observed') recording.eventTiming.grouping = 'available'
              const group = interactionSamples.get(id)
              if (group) {
                group.durationMs = Math.max(group.durationMs, entry.duration)
                group.startMs = Math.min(group.startMs, entry.startTime - start)
                group.counters.eventCount = (group.counters.eventCount ?? 0) + 1
              } else {
                recording.eventTiming.reportedInteractions += 1
                const sample = append(stage, entry.startTime, entry.duration, 'success', { eventCount: 1 })
                if (sample) interactionSamples.set(id, sample)
              }
            } else {
              append(stage, entry.startTime, entry.duration, 'success', type === 'resource' && entry.transferSize !== undefined ? { byteCount: entry.transferSize } : {})
            }
          }
        }, type === 'event' ? threshold : undefined)
        disposers.push(dispose)
        recording.capabilities[capability] = available()
      } catch {
        recording.capabilities[capability] = unavailable('Observer registration failed in this runtime')
      }
    }
    if (environment.listen) {
      disposers.push(environment.listen('input', () => { if (current() && recording) recording.eventTiming.observedInputs += 1 }))
      disposers.push(environment.listen('visibility', (hidden) => {
        if (!current()) return
        append(hidden ? 'lifecycle_hidden' : 'lifecycle_visible', environment.now(), 0)
        previousFrame = null
      }))
      if (environment.requestFrame) {
        const tick = (time: number) => {
          frameId = null
          if (!current() || environment.now() - lastScrollAt > 150) { previousFrame = null; return }
          if (previousFrame !== null) append('scroll_frame_interval', previousFrame, Math.max(0, time - previousFrame))
          if (!current()) return
          previousFrame = time
          frameId = environment.requestFrame!(tick)
        }
        disposers.push(environment.listen('scroll', () => {
          if (!current()) return
          lastScrollAt = environment.now()
          if (frameId === null) frameId = environment.requestFrame!(tick)
        }))
      }
    }
    timer = environment.setTimer(() => { if (current()) finishRecording('duration_limit') }, recording.limits.maxDurationMs)
    sampleResources(sessionId)
    notify()
    return getSnapshot()!
  }
  return {
    start: startRecording, stop: () => finishRecording('stopped'), cancel: () => finishRecording('cancelled'),
    getSnapshot, isActive: active, beginStage, finishStage,
    record: append, recordReactRender,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
  }
}

const browserEnvironment = (): PerformanceRecorderEnvironment => {
  const perf = globalThis.performance
  const browser = typeof window === 'undefined' ? undefined : window
  const memory = () => (perf as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null
  return {
    now: () => perf.now(), wallNow: () => Date.now(),
    randomId: () => globalThis.crypto?.randomUUID?.() ?? `local-${(`${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`).padEnd(16, '0').slice(0, 32)}`,
    supportedEntryTypes: typeof PerformanceObserver === 'undefined' ? [] : PerformanceObserver.supportedEntryTypes ?? [],
    observe: typeof PerformanceObserver === 'undefined' ? undefined : (type, callback, durationThreshold) => {
      const observer = new PerformanceObserver((list) => callback(list.getEntries()))
      // Deliberately avoid buffered:true: previous work is outside this recording.
      observer.observe({ type, ...(durationThreshold === undefined ? {} : { durationThreshold }) } as PerformanceObserverInit)
      return () => observer.disconnect()
    },
    listen: !browser ? undefined : (type, callback) => {
      const handler = () => callback(type === 'visibility' ? document.hidden : undefined)
      const names = type === 'input' ? ['pointerdown', 'keydown'] : type === 'visibility' ? ['visibilitychange'] : ['scroll']
      const target = type === 'visibility' ? document : browser
      for (const name of names) target.addEventListener(name, handler, { passive: true, capture: type === 'scroll' })
      return () => { for (const name of names) target.removeEventListener(name, handler, { capture: type === 'scroll' }) }
    },
    setTimer: (callback, ms) => globalThis.setTimeout(callback, ms), clearTimer: (id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>),
    requestFrame: browser && typeof browser.requestAnimationFrame === 'function' ? (callback) => browser.requestAnimationFrame(callback) : undefined,
    cancelFrame: browser && typeof browser.cancelAnimationFrame === 'function' ? (id) => browser.cancelAnimationFrame(id) : undefined,
    heapUsedBytes: memory, resourceCount: () => perf.getEntriesByType('resource').length,
    mark: (name) => { perf.mark(name) }, measure: (name, from, to) => { perf.measure(name, from, to) },
    clearMark: (name) => perf.clearMarks(name), clearMeasure: (name) => perf.clearMeasures(name),
  }
}
const fieldRecorder = createPerformanceRecorder(browserEnvironment())
export const startPerformanceRecording = fieldRecorder.start
export const stopPerformanceRecording = fieldRecorder.stop
export const cancelPerformanceRecording = fieldRecorder.cancel
export const getPerformanceRecordingSnapshot = fieldRecorder.getSnapshot
export const isPerformanceRecordingActive = fieldRecorder.isActive
export const subscribePerformanceRecording = fieldRecorder.subscribe
export const beginPerformanceStage = fieldRecorder.beginStage
export const finishPerformanceStage = fieldRecorder.finishStage
export const measurePerformanceStage = <T>(stage: PerformanceStage, operation: () => T, counters: PerformanceCounters = {}): T => {
  const token = beginPerformanceStage(stage)
  try {
    const value = operation()
    finishPerformanceStage(token, 'success', counters)
    return value
  } catch (error) {
    finishPerformanceStage(token, 'failure', counters)
    throw error
  }
}
export const recordPerformanceReactRender = fieldRecorder.recordReactRender
