/* @vitest-environment jsdom */

import { act, renderHook, waitFor } from '@testing-library/react'
import { writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useOrderWorkspaceSync } from '@/hooks/useOrderWorkspaceSync'
import { persistAuthTokens } from '@/services/apiClient'
import { setStoredApiBaseUrl } from '@/services/apiConfig'
import type { OrderDTO } from '@/services/apiTypes'
import { BACKGROUND_STALE_MS } from '@/services/orderRealtime'
import type { RealtimeRecoveryHandlers } from '@/services/realtimeRecovery'
import {
  startPerformanceRecording, stopPerformanceRecording,
  type PerformanceRecordingSnapshot, PerformanceStage,
} from '@/services/performanceRecorder'
import { useAuthStore } from '@/store/auth'
import { useOrderStore } from '@/store/order'
import { DEFAULT_ORDER_FORM_VALUE } from '@/types'

const collectSourceProvenance = () => {
  const files = [
    'tests/performance/workspaceSyncFlows.test.tsx', 'src/services/performanceRecorder.ts',
    'src/services/apiClient.ts', 'src/services/orderRepository.ts', 'src/services/orderRealtime.ts',
    'src/hooks/useOrderWorkspaceSync.ts', 'src/store/order.ts', 'src/services/orderOptimistic.ts',
    'src/services/orderReconcile.ts', 'src/services/orderTombstones.ts', 'pnpm-lock.yaml',
  ]
  try {
    return {
      commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() !== '',
      sourceSha256: Object.fromEntries(files.map((file) => [file, createHash('sha256').update(readFileSync(file)).digest('hex')])),
      unavailableReason: null,
    }
  } catch {
    return { commit: null, dirty: null, sourceSha256: {}, unavailableReason: 'Node source provenance unavailable; not a clean-release baseline' }
  }
}
const sourceProvenance = collectSourceProvenance()

const recovery = vi.hoisted(() => ({ handlers: null as RealtimeRecoveryHandlers | null, stop: vi.fn() }))
vi.mock('@/services/realtimeRecovery', () => ({
  startRealtimeRecoverySignals: (handlers: RealtimeRecoveryHandlers) => {
    recovery.handlers = handlers
    return { ready: Promise.resolve(), stop: recovery.stop }
  },
}))

class FixtureSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 3
  static instances: FixtureSocket[] = []
  readyState = FixtureSocket.CONNECTING
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  constructor() { FixtureSocket.instances.push(this) }
  close() { this.readyState = FixtureSocket.CLOSED }
  ready() {
    this.readyState = FixtureSocket.OPEN
    this.onopen?.(new Event('open'))
    this.emit('ready', { capabilities: ['order.upsert_many'] })
  }
  emit(type: string, data: unknown) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify({ type, data }) }))
  }
}
const dto = (id: string, version = 1, createdAt = '2026-10-15T12:00:00+08:00'): OrderDTO => ({
  ...DEFAULT_ORDER_FORM_VALUE, id, version, displayNo: 'fixture', totalPriceCents: 1500,
  stapleStepStatusCode: 1, meatStepStatusCode: 1, createdAt, updatedAt: createdAt, completedAt: null,
})
const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
const flush = async () => { for (let step = 0; step < 60; step += 1) await Promise.resolve() }
const rows: { run: number; status: 'completed' | 'failure'; correctness: 'passed' | 'failed'; recording: PerformanceRecordingSnapshot }[] = []
const fixtures = vi.fn<() => Promise<Response>>()
const setWorkspace = (id: string) => useAuthStore.setState({
  status: 'authenticated', user: { id: 'fixture-user', phone: 'fixture', role: 'owner' },
  permissions: [], serverTime: '2026-10-15T15:59:58Z', workspaceStatus: 'ready',
  activeWorkspace: { id, name: 'isolated fixture', role: 'owner' }, errorMessage: null,
})

const summarize = (trials: typeof rows) => {
  const stages = new Set<PerformanceStage>(trials.flatMap((trial) => trial.recording.samples.map((sample) => sample.stage)))
  return [...stages].map((stage) => {
    const trialMeans = trials.map((trial) => {
      const samples = trial.recording.samples.filter((sample) => sample.stage === stage && sample.outcome === 'success')
      return { run: trial.run, sampleCount: samples.length, meanMs: samples.length ? samples.reduce((sum, sample) => sum + sample.durationMs, 0) / samples.length : null }
    })
    const complete = trials.length === 5 && trials.every((trial) => trial.status === 'completed') && trialMeans.every((trial) => trial.meanMs !== null)
    return { stage, trialMeans, fiveTrialMeanMs: complete ? trialMeans.reduce((sum, trial) => sum + trial.meanMs!, 0) / 5 : null }
  })
}

beforeEach(() => {
  // Only the business/lifecycle wall clock is fixed. Monotonic measurements and task scheduling remain real.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime('2026-10-15T15:59:58Z')
  localStorage.clear()
  FixtureSocket.instances = []
  recovery.handlers = null
  recovery.stop.mockReset()
  fixtures.mockReset()
  vi.stubGlobal('WebSocket', FixtureSocket)
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(input)
    if (url.pathname === '/api/realtime/session') return response({ ticket: 'isolated-fixture-ticket' })
    if (url.pathname === '/api/orders') return fixtures()
    throw new Error('Unexpected fixture request path')
  }))
  setStoredApiBaseUrl('http://isolated-performance.invalid')
  persistAuthTokens({
    accessToken: 'isolated-fixture-access', refreshToken: 'isolated-fixture-refresh', tokenType: 'Bearer',
    accessTokenExpiresAt: '2099-01-01T00:00:00Z', refreshTokenExpiresAt: '2099-01-01T00:00:00Z',
  })
  useOrderStore.setState({
    ordersById: {}, orderDisplayIds: [], filter: 'all', updateTargetID: '',
    isQuickCalcMode: false, quickCalcSelectedOrderIds: [], lastHydratedAt: null,
    status: 'idle', errorMessage: null, orderSyncSeq: 0,
  })
  setWorkspace('fixture-workspace-a')
})
afterEach(() => { stopPerformanceRecording(); vi.useRealTimers() })
afterAll(async () => {
  if (!process.env.LEGERO_SYNC_REPORT) return
  await writeFile(process.env.LEGERO_SYNC_REPORT, JSON.stringify({
    type: 'legero-workspace-sync-functional-traces', schemaVersion: 1,
    status: rows.length === 5 && rows.every((row) => row.status === 'completed') ? 'completed' : 'partial', expectedTrials: 5,
    sourceProvenance,
    clientCount: 1, scenarios: ['S01', 'S02', 'S03'],
    faultSchedule: ['ready while first snapshot is deferred', 'duplicate/higher-version batch during snapshot', 'offline then online before reconnect ready', 'remove/full clear and batch during reconnect snapshot, followed by post-clear snapshot', 'long background crossing Shanghai midnight then foreground', 'workspace switch then stale previous-socket event'],
    stageSummary: summarize(rows),
    boundaries: [
      'Actual apiClient, repository, WebSocket decoder, sync hook, journal, tombstones and store execute in an isolated jsdom context.',
      'Fetch, WebSocket transport and native recovery signals are controlled fixtures; no real server, database, Android, browser paint or network fault is measured.',
      'Five trials preserve raw stage samples and explicitly scoped functional-stage means. This is not a device latency baseline or the computation benchmark protocol.',
      'Node sourceProvenance records the collection checkout independently of optional browser build injection; no clean-release provenance is claimed when dirty or unavailable.',
      'Only one singleton client exists per trial. Two/three concurrent clients require separate browser contexts and remain unverified.',
      'Business/lifecycle Date is injected around Shanghai midnight; durations use the real local monotonic clock.',
    ], trials: rows,
  }, null, 2) + '\n', 'utf8')
})

describe('S01-S03 actual workspace pipeline, five isolated functional trials', () => {
  it.each([1, 2, 3, 4, 5])('trial %i: paged startup, reconnect-buffer replay, midnight resume and workspace isolation', async (run) => {
    const initialPage = deferred<Response>()
    const reconnectPage = deferred<Response>()
    fixtures.mockReturnValueOnce(initialPage.promise)
      .mockResolvedValueOnce(response({ items: [dto('second-page')], nextCursor: null }))
      .mockReturnValueOnce(reconnectPage.promise)
      .mockResolvedValueOnce(response({ items: [dto('newer', 5)], nextCursor: null }))
      .mockResolvedValueOnce(response({ items: [dto('after-midnight', 1, '2026-10-16T00:01:00+08:00')], nextCursor: null }))
      .mockResolvedValueOnce(response({ items: [dto('workspace-b')], nextCursor: null }))
    startPerformanceRecording({ maxSamples: 500, maxDurationMs: 10_000 })
    const hook = renderHook(() => useOrderWorkspaceSync())
    try {
    await waitFor(() => expect(FixtureSocket.instances).toHaveLength(1), { interval: 5 })
    const first = FixtureSocket.instances[0]
    act(() => first.ready())
    expect(hook.result.current.status).toBe('loading')
    expect(hook.result.current.getDiagnostics()?.state).toBe('online')
    // Online/ready precedes snapshot completion. A higher buffered version must survive the stale snapshot.
    act(() => first.emit('order.upsert_many', { items: [dto('initial', 3), dto('initial', 2)] }))
    await act(async () => { initialPage.resolve(response({ items: [dto('initial', 1)], nextCursor: 'fixture-page-2' })); await flush() })
    await waitFor(() => expect(hook.result.current.status).toBe('ready'), { interval: 5 })
    expect(useOrderStore.getState().ordersById.initial.version).toBe(3)
    expect(useOrderStore.getState().orderDisplayIds).toHaveLength(2)

    // Reconnect is driven through the production recovery machine with a fixed offline/online point.
    act(() => { recovery.handlers!.onNetworkOffline(); recovery.handlers!.onNetworkOnline() })
    await waitFor(() => expect(FixtureSocket.instances).toHaveLength(2), { interval: 5 })
    const second = FixtureSocket.instances[1]
    act(() => second.ready())
    act(() => {
      second.emit('order.deleted', { id: 'initial' })
      second.emit('order.cleared', { mode: 'all', clearedCount: 2 })
      second.emit('order.upsert_many', { items: [dto('initial', 7), dto('newer', 5), dto('newer', 4)] })
    })
    await act(async () => { reconnectPage.resolve(response({ items: [dto('initial', 1), dto('newer', 1)], nextCursor: null })); await flush() })
    expect(useOrderStore.getState().ordersById.initial).toBeUndefined()
    expect(useOrderStore.getState().ordersById.newer.version).toBe(5)

    // A long background spans explicit Shanghai midnight, then forces a fresh ready + reconciliation.
    act(() => recovery.handlers!.onAppBackground())
    vi.setSystemTime(new Date(Date.now() + Math.max(BACKGROUND_STALE_MS + 1, 120_000)))
    act(() => recovery.handlers!.onAppForeground())
    await waitFor(() => expect(FixtureSocket.instances).toHaveLength(3), { interval: 5 })
    const third = FixtureSocket.instances[2]
    await act(async () => { third.ready(); await flush() })
    expect(Object.keys(useOrderStore.getState().ordersById)).toEqual(['after-midnight'])

    // Switching workspace invalidates every old callback and journal/tombstone session before the new snapshot.
    act(() => setWorkspace('fixture-workspace-b'))
    await waitFor(() => expect(FixtureSocket.instances).toHaveLength(4), { interval: 5 })
    const fourth = FixtureSocket.instances[3]
    await act(async () => { fourth.ready(); await flush() })
    act(() => third.emit('order.upsert', { item: dto('stale-workspace-a', 20) }))
    await act(flush)
    expect(Object.keys(useOrderStore.getState().ordersById)).toEqual(['workspace-b'])
    expect(hook.result.current.getDiagnostics()?.snapshotReconciliation.failureCount).toBe(0)
    hook.unmount()
    expect(FixtureSocket.instances.every((socket) => socket.readyState === FixtureSocket.CLOSED)).toBe(true)
    expect(recovery.stop).toHaveBeenCalledTimes(2)
    const recording = stopPerformanceRecording()!
    expect(recording.samples.filter((sample) => sample.stage === 'realtime_ready')).toHaveLength(4)
    expect(recording.samples.filter((sample) => sample.stage === 'workspace_ready_state')).toHaveLength(5)
    expect(recording.samples.every((sample) => sample.outcome === 'success')).toBe(true)
    rows.push({ run, status: 'completed', correctness: 'passed', recording })
    } catch (error) {
      hook.unmount()
      const recording = stopPerformanceRecording()!
      rows.push({ run, status: 'failure', correctness: 'failed', recording })
      throw error
    }
  })
})


describe('S01 failure and cancellation are explicit', () => {
  it('retains failed snapshot outcome without a success duration', async () => {
    fixtures.mockRejectedValueOnce(new Error('controlled fixture network failure'))
    startPerformanceRecording()
    const hook = renderHook(() => useOrderWorkspaceSync())
    await waitFor(() => expect(FixtureSocket.instances).toHaveLength(1), { interval: 5 })
    await act(async () => { FixtureSocket.instances[0].ready(); await flush() })
    expect(hook.result.current.status).toBe('error')
    expect(stopPerformanceRecording()!.samples.find((sample) => sample.stage === 'workspace_ready_state')!.outcome).toBe('failure')
    hook.unmount()
  })

  it('cancels diagnostic spans on disposal while an outstanding snapshot settles harmlessly later', async () => {
    const page = deferred<Response>()
    fixtures.mockReturnValueOnce(page.promise)
    startPerformanceRecording()
    const hook = renderHook(() => useOrderWorkspaceSync())
    await waitFor(() => expect(FixtureSocket.instances).toHaveLength(1), { interval: 5 })
    await act(async () => { FixtureSocket.instances[0].ready(); await flush() })
    hook.unmount()
    const snapshot = stopPerformanceRecording()!
    expect(snapshot.samples.find((sample) => sample.stage === 'workspace_ready_state')!.outcome).toBe('cancelled')
    await act(async () => { page.resolve(response({ items: [dto('late')], nextCursor: null })); await flush() })
    expect(useOrderStore.getState().ordersById.late).toBeUndefined()
  })
})
