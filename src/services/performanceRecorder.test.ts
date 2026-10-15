import { describe, expect, it, vi } from 'vitest'
import {
  createPerformanceRecorder,
  type PerformanceRecorderEnvironment,
  type RecordedPerformanceEntry,
} from '@/services/performanceRecorder'

const setup = (supportedEntryTypes: string[] = []) => {
  let time = 100
  let nextId = 0
  const observers = new Map<string, (entries: readonly RecordedPerformanceEntry[]) => void>()
  const events = new Map<string, (hidden?: boolean) => void>()
  const timers = new Map<number, { callback: () => void; ms: number }>()
  const frames = new Map<number, (time: number) => void>()
  const disconnect = vi.fn()
  const clearMark = vi.fn()
  const clearMeasure = vi.fn()
  const environment: PerformanceRecorderEnvironment = {
    now: () => time,
    wallNow: () => 0,
    randomId: () => `recording-${++nextId}`,
    supportedEntryTypes,
    observe: (type, callback) => {
      observers.set(type, callback)
      return () => { observers.delete(type); disconnect() }
    },
    listen: (type, callback) => {
      events.set(type, callback)
      return () => { events.delete(type) }
    },
    setTimer: (callback, ms) => { const id = ++nextId; timers.set(id, { callback, ms }); return id },
    clearTimer: (id) => { timers.delete(id as number) },
    requestFrame: (callback) => { const id = ++nextId; frames.set(id, callback); return id },
    cancelFrame: (id) => { frames.delete(id) },
    mark: vi.fn(), measure: vi.fn(), clearMark, clearMeasure,
  }
  return {
    recorder: createPerformanceRecorder(environment), environment, observers, events, timers, frames,
    advance: (ms: number) => { time += ms }, disconnect, clearMark, clearMeasure,
  }
}

describe('bounded opt-in field performance recording', () => {
  it('does no observer/timer/mark work while disabled; measures controlled slow stages and cleans User Timing', () => {
    const fixture = setup(['longtask'])
    const clock = vi.spyOn(fixture.environment, 'now')
    expect(fixture.recorder.beginStage('store_commit')).toBeNull()
    fixture.recorder.finishStage(null)
    fixture.recorder.recordReactRender('orders', 100, 'update')
    expect(clock).not.toHaveBeenCalled()
    expect(fixture.environment.mark).not.toHaveBeenCalled()
    expect(fixture.timers.size).toBe(0)
    fixture.recorder.start()
    const token = fixture.recorder.beginStage('store_commit')
    fixture.advance(85)
    fixture.recorder.finishStage(token, 'success', { acceptedCount: 2 })
    const sample = fixture.recorder.getSnapshot()!.samples.find((entry) => entry.stage === 'store_commit')!
    expect(sample.durationMs).toBe(85)
    expect(sample.counters).toEqual({ acceptedCount: 2 })
    expect(fixture.clearMark).toHaveBeenCalledTimes(2)
    expect(fixture.clearMeasure).toHaveBeenCalledTimes(1)
    fixture.observers.get('longtask')!([{ entryType: 'longtask', startTime: 110, duration: 85 }])
    expect(fixture.recorder.stop()!.samples.some((entry) => entry.stage === 'long_task' && entry.durationMs === 85)).toBe(true)
    expect(fixture.disconnect).toHaveBeenCalledTimes(1)
    expect(fixture.timers.size).toBe(0)
    expect(fixture.events.size).toBe(0)
  })

  it('keeps unsolicited observation correlations distinct from request/stage correlations', () => {
    const fixture = setup(['longtask'])
    fixture.recorder.start()
    const token = fixture.recorder.beginStage('api_headers')!
    fixture.recorder.finishStage(token)
    const snapshot = fixture.recorder.stop()!
    const observations = snapshot.samples.filter((sample) => sample.stage === 'resource_trend')
    expect(observations).toHaveLength(1)
    expect(observations[0].correlation).not.toBe(token.correlation)
    expect(observations[0].correlation).toContain(':sample:')
  })

  it('reports missing capabilities as unavailable and distinguishes no input from inputs below reporting threshold', () => {
    const unsupported = setup().recorder
    unsupported.start()
    const absent = unsupported.stop()!
    expect(absent.capabilities.eventTiming.status).toBe('unavailable')
    expect(absent.eventTiming.coverage).toBe('unavailable')
    expect(absent.eventTiming.retainedReportedInteractionMeanMs).toBeNull()
    const fixture = setup(['event'])
    fixture.recorder.start({ eventDurationThresholdMs: 40 })
    expect(fixture.recorder.getSnapshot()!.eventTiming.coverage).toBe('no_observed_input')
    fixture.events.get('input')!()
    expect(fixture.recorder.getSnapshot()!.eventTiming.coverage).toBe('inputs_without_reported_interactions')
    expect(fixture.recorder.stop()!.eventTiming.retainedReportedInteractionMeanMs).toBeNull()
  })

  it('groups only nonzero reliable interaction IDs, retains numeric allowlisted data and describes reported-only statistics', () => {
    const fixture = setup(['event'])
    fixture.recorder.start()
    fixture.observers.get('event')!([
      { entryType: 'event', startTime: 110, duration: 64, interactionId: 37 },
      { entryType: 'event', startTime: 112, duration: 80, interactionId: 37 },
      { entryType: 'event', startTime: 120, duration: 48, interactionId: 0 },
      { entryType: 'event', startTime: 130, duration: 56 },
    ])
    const result = fixture.recorder.stop()!
    expect(result.eventTiming).toMatchObject({ reportedEvents: 4, reportedInteractions: 1, ungroupedEvents: 2, retainedReportedInteractionMeanMs: 80 })
    expect(result.samples.find((sample) => sample.stage === 'event_interaction')!.counters.eventCount).toBe(2)
    expect(JSON.stringify(result)).not.toContain('interactionId')
    expect(result.eventTiming.interpretation).toBe('reported_entries_only_not_all_interactions_or_page_inp')
  })

  it('freezes an existing interaction group when event delivery crosses the deadline', () => {
    const fixture = setup(['event'])
    fixture.recorder.start({ maxDurationMs: 1_000 })
    const deliver = fixture.observers.get('event')!
    deliver([{ entryType: 'event', startTime: 110, duration: 64, interactionId: 37 }])
    fixture.advance(1_001)
    deliver([{ entryType: 'event', startTime: 120, duration: 200, interactionId: 37 }])
    const result = fixture.recorder.getSnapshot()!
    expect(result.status).toBe('duration_limit')
    expect(result.eventTiming.reportedEvents).toBe(1)
    expect(result.samples.find((sample) => sample.stage === 'event_interaction')!.durationMs).toBe(64)
    expect(fixture.timers.size).toBe(0)
  })

  it('limits sample/stage capacity and duration, cancels pending stages and clears every listener, observer and rAF', () => {
    const fixture = setup(['event', 'longtask'])
    fixture.recorder.start({ maxSamples: 2, maxDurationMs: 1_000 })
    const pending = Array.from({ length: 129 }, () => fixture.recorder.beginStage('api_headers'))
    expect(pending.filter(Boolean)).toHaveLength(128)
    for (const token of pending.slice(0, 5)) fixture.recorder.finishStage(token)
    fixture.events.get('scroll')!()
    expect(fixture.frames.size).toBe(1)
    fixture.timers.forEach((timer) => { if (timer.ms === 1_000) timer.callback() })
    const result = fixture.recorder.getSnapshot()!
    expect(result.status).toBe('duration_limit')
    expect(result.samples).toHaveLength(2)
    expect(result.droppedSamples).toBe(4)
    expect(result.droppedStages).toBe(1)
    expect(result.incompleteStages).toBe(123)
    expect(fixture.frames.size).toBe(0)
    expect(fixture.events.size).toBe(0)
    expect(fixture.observers.size).toBe(0)
    expect(fixture.timers.size).toBe(0)
    fixture.recorder.finishStage(pending[5])
    expect(fixture.recorder.getSnapshot()!.samples).toHaveLength(2)
  })

  it('does not queue an old commit after finishing a stage crosses the deadline', () => {
    const fixture = setup()
    fixture.recorder.start({ profilingBuild: true, maxDurationMs: 1_000 })
    const token = fixture.recorder.beginStage('sync_receive_to_state')!
    fixture.advance(1_000)
    fixture.recorder.finishStage(token)
    const expired = fixture.recorder.getSnapshot()!
    expect(expired.status).toBe('duration_limit')
    expect(expired.incompleteStages).toBe(1)
    expect(fixture.timers.size).toBe(0)
    fixture.recorder.start({ profilingBuild: true })
    fixture.recorder.recordReactRender('orders', 30, 'update')
    const next = fixture.recorder.stop()!
    expect(next.incompleteStages).toBe(0)
    expect(next.samples.some((sample) => sample.stage === 'sync_receive_to_commit_approximation')).toBe(false)
  })

  it('does not reschedule a resource trend timer after sampling reaches the deadline', () => {
    const fixture = setup()
    fixture.recorder.start({ maxDurationMs: 1_000 })
    const sample = [...fixture.timers.values()].find((timer) => timer.ms === 10_000)!.callback
    fixture.advance(1_000)
    sample()
    expect(fixture.recorder.getSnapshot()!.status).toBe('duration_limit')
    expect(fixture.timers.size).toBe(0)
    fixture.recorder.start()
    const timersBeforeStaleCallback = fixture.timers.size
    sample()
    expect(fixture.recorder.getSnapshot()!.status).toBe('recording')
    expect(fixture.timers.size).toBe(timersBeforeStaleCallback)
    fixture.recorder.stop()
    expect(fixture.timers.size).toBe(0)
  })

  it('does not schedule another scroll frame after its interval append reaches the deadline', () => {
    const fixture = setup()
    fixture.recorder.start({ maxDurationMs: 1_000 })
    fixture.events.get('scroll')!()
    const [firstId, firstFrame] = [...fixture.frames.entries()][0]
    fixture.frames.delete(firstId)
    firstFrame(100)
    const [secondId, secondFrame] = [...fixture.frames.entries()][0]
    fixture.frames.delete(secondId)
    fixture.advance(1_000)
    // Keep scrolling active at the deadline, exercising the interval append rather than inactivity exit.
    fixture.events.get('scroll')!()
    secondFrame(1_100)
    expect(fixture.recorder.getSnapshot()!.status).toBe('duration_limit')
    expect(fixture.frames.size).toBe(0)
    expect(fixture.timers.size).toBe(0)
  })

  it('keeps a replacement session isolated when a deadline listener starts it synchronously', () => {
    const fixture = setup()
    fixture.recorder.start({ maxDurationMs: 1_000, profilingBuild: true })
    const token = fixture.recorder.beginStage('sync_receive_to_state')!
    let replacementToken: ReturnType<typeof fixture.recorder.beginStage> = null
    const unsubscribe = fixture.recorder.subscribe(() => {
      if (fixture.recorder.getSnapshot()?.status !== 'duration_limit') return
      fixture.recorder.start({ profilingBuild: true })
      replacementToken = fixture.recorder.beginStage('api_body')
    })
    fixture.advance(1_000)
    fixture.recorder.finishStage(token)
    expect(fixture.recorder.getSnapshot()!.status).toBe('recording')
    fixture.recorder.finishStage(replacementToken)
    fixture.recorder.recordReactRender('orders', 10, 'update')
    unsubscribe()
    const result = fixture.recorder.stop()!
    expect(result.samples.some((sample) => sample.stage === 'api_body')).toBe(true)
    expect(result.samples.some((sample) => sample.stage === 'sync_receive_to_commit_approximation')).toBe(false)
    expect(result.incompleteStages).toBe(0)
  })

  it('ignores previously queued callbacks after a new recording starts', () => {
    const fixture = setup(['event'])
    fixture.recorder.start()
    const oldObserver = fixture.observers.get('event')!
    const oldTimer = [...fixture.timers.values()].find((timer) => timer.ms === 120_000)!.callback
    fixture.recorder.cancel()
    fixture.recorder.start()
    oldTimer()
    oldObserver([{ entryType: 'event', startTime: 100, duration: 88, interactionId: 5 }])
    expect(fixture.recorder.getSnapshot()!.status).toBe('recording')
    expect(fixture.recorder.stop()!.eventTiming.reportedEvents).toBe(0)
  })

  it('isolates cancellation and stale tokens across sessions; snapshots cannot mutate retained state', () => {
    const fixture = setup()
    fixture.recorder.start()
    const old = fixture.recorder.beginStage('workspace_ready_state')
    expect(fixture.recorder.cancel()!.status).toBe('cancelled')
    fixture.recorder.start()
    fixture.recorder.finishStage(old)
    const token = fixture.recorder.beginStage('api_headers')
    const child = fixture.recorder.beginStage('api_body', token)
    fixture.recorder.finishStage(child)
    fixture.recorder.finishStage(token)
    const snapshot = fixture.recorder.getSnapshot()!
    expect(snapshot.samples.filter((entry) => entry.stage.startsWith('api_')).map((entry) => entry.correlation)).toEqual([token!.correlation, token!.correlation])
    snapshot.samples.length = 0
    expect(fixture.recorder.stop()!.samples.length).toBeGreaterThan(0)
  })
})

describe('Profiler state/commit boundaries', () => {
  it('keeps a controlled slow render separate and correlates the next orders commit as an approximation', () => {
    const fixture = setup()
    fixture.recorder.start({ profilingBuild: true })
    const received = fixture.recorder.beginStage('sync_receive_to_state')!
    fixture.advance(10)
    fixture.recorder.finishStage(received)
    fixture.advance(90)
    fixture.recorder.recordReactRender('statistics', 60, 'update', 200)
    expect(fixture.recorder.getSnapshot()!.samples.some((sample) => sample.stage === 'sync_receive_to_commit_approximation')).toBe(false)
    fixture.recorder.recordReactRender('orders', 80, 'update', 200)
    const snapshot = fixture.recorder.stop()!
    expect(snapshot.samples.find((sample) => sample.stage === 'react_render_orders')!.durationMs).toBe(80)
    expect(snapshot.samples.find((sample) => sample.stage === 'sync_receive_to_commit_approximation')).toMatchObject({ durationMs: 100, correlation: received.correlation })
  })

  it('closes an overdue recording on observation even when the browser timer was throttled', () => {
    const fixture = setup()
    fixture.recorder.start({ maxDurationMs: 1_000 })
    fixture.advance(1_001)
    expect(fixture.recorder.beginStage('api_headers')).toBeNull()
    expect(fixture.recorder.getSnapshot()!.status).toBe('duration_limit')
    expect(fixture.timers.size).toBe(0)
  })
})
