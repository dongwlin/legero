import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'

const root = fileURLToPath(new URL('../../', import.meta.url))
const fixtureOrigin = 'http://isolated-client-workspace.invalid'
const expectedTrials = 5
const argument = (name) => {
  const index = process.argv.indexOf(name)
  if (index < 0) return undefined
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`)
  return value
}
const output = path.resolve(root, argument('--output') ?? 'benchmarks/order-workspace/results/workspace-clients-desktop.json')
const clientCounts = (argument('--clients') ?? '1,2,3').split(',').map(Number)
if (!clientCounts.length || new Set(clientCounts).size !== clientCounts.length || clientCounts.some((count) => ![1, 2, 3].includes(count))) {
  throw new Error('--clients must be a unique comma-separated subset of 1,2,3')
}
const timeoutMs = Number(argument('--timeout-ms') ?? 60_000)
if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 5_000 || timeoutMs > 120_000) throw new Error('--timeout-ms must be 5000..120000')
const sourceFiles = [
  'benchmarks/browser-workspace/index.html', 'benchmarks/browser-workspace/fixture.tsx',
  'benchmarks/browser-workspace/run.mjs', 'src/services/apiClient.ts', 'src/services/apiConfig.ts',
  'benchmarks/browser-workspace/tsconfig.json',
  'src/services/orderRepository.ts', 'src/services/orderRealtime.ts', 'src/services/realtimeRecovery.ts',
  'src/services/orderOptimistic.ts', 'src/services/orderReconcile.ts', 'src/services/orderTombstones.ts',
  'src/services/orderStatus.ts', 'src/hooks/useOrderWorkspaceSync.ts', 'src/store/order.ts',
  'src/views/Order/components/list/useOrderItemActions.ts', 'src/services/performanceRecorder.ts',
  'src/services/buildMetadata.ts', 'package.json', 'pnpm-lock.yaml',
]
const git = (...args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  if (result.error || result.status !== 0) throw new Error('Source provenance unavailable')
  return result.stdout.trim()
}
const source = {
  commit: git('rev-parse', 'HEAD'), dirty: git('status', '--porcelain') !== '',
  sourceSha256: Object.fromEntries(await Promise.all(sourceFiles.map(async (file) => [
    file, createHash('sha256').update(await readFile(path.join(root, file))).digest('hex'),
  ]))), unavailableReason: null,
}
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const buildMetadata = { appVersion: packageJson.version, mode: 'functional-development-fixture', profiling: false, ...source }
const deferred = () => {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}
// These rows are synthetic transport fixtures. Their contents never enter the saved report.
const dto = (id, version = 1, changes = {}) => ({
  id, version, displayNo: 'synthetic', stapleTypeCode: 1, sizeCode: 1, customSizePriceCents: null,
  stapleAmountCode: 1, extraStapleUnits: 0, friedEggCount: 0, tofuSkewerCount: 0,
  selectedMeatCodes: [1], greensCode: 1, scallionCode: 1, pepperCode: 1,
  diningMethodCode: 1, packagingCode: null, packagingMethodCode: null, totalPriceCents: 1500,
  stapleStepStatusCode: 2, meatStepStatusCode: 2, note: '',
  createdAt: '2026-10-15T12:00:00+08:00', updatedAt: '2026-10-15T12:00:00+08:00', completedAt: null,
  ...changes,
})
const expected = (...rows) => Object.fromEntries(rows.map((row) => [row.id, {
  version: row.version, meat: row.meatStepStatusCode, staple: row.stapleStepStatusCode,
  served: row.completedAt !== null,
}]))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const waitFor = async (predicate) => {
  const deadline = performance.now() + 15_000
  while (!predicate()) {
    if (performance.now() >= deadline) throw new Error('Controlled fixture deadline exceeded')
    await sleep(10)
  }
}
let cancelled = false
let activeCancel
const cancel = () => { cancelled = true; activeCancel?.() }
process.on('SIGINT', cancel)
process.on('SIGTERM', cancel)
let browser
let server
let browserVersion = null
let startupFailure = null
let startupStep = 'vite_startup'
const groups = []

const runTrial = async (clientCount, run, origin) => {
  const clients = []
  const checks = []
  let step = 'create_clients'
  let timedOut = false
  let cleanupRequested = false
  let failureDetail = null
  const interrupt = deferred()
  const timeout = setTimeout(() => { timedOut = true; interrupt.resolve() }, timeoutMs)
  const rows = [dto('initial', 3), dto('second-page')]
  const backend = new Map(rows.map((row) => [row.id, row]))
  let mutationPlan = null
  const interruptTrial = () => { interrupt.resolve() }
  activeCancel = interruptTrial

  const checkClients = async (state, label) => {
    await Promise.all(clients.map(async (client) => {
      await client.page.waitForFunction((value) => window.workspaceFixture.check(value), state, { timeout: 15_000 })
      const probe = await client.page.evaluate(() => window.workspaceFixture.probe())
      assert.equal(probe.online, true)
      assert.equal(probe.storageIsolated, true)
      assert.equal(probe.failedReconciliations, 0)
    }))
    checks.push({ check: label, passed: true, clientCount })
  }
  const broadcast = async (type, data) => {
    for (const client of clients) {
      const socket = client.sockets.findLast((entry) => !entry.closed)
      assert.ok(socket)
      socket.route.send(JSON.stringify({ type, data }))
      client.receivedEnvelopes += 1
    }
    // Observe decode locally before releasing any held HTTP body: transport arrival order is intentional.
    await Promise.all(clients.map((client) => client.page.waitForFunction(
      (count) => window.workspaceFixture.probe().decodedEnvelopes >= count,
      client.receivedEnvelopes,
    )))
  }
  const perform = async (action, plan) => {
    mutationPlan = { ...plan, gate: deferred(), seen: false }
    await clients[0].page.locator(`[data-action="${action}"]`).click()
    await waitFor(() => mutationPlan.seen)
    return mutationPlan
  }
  const finishMutation = async (plan) => {
    plan.gate.resolve()
    await clients[0].page.waitForFunction(() => !window.workspaceFixture.probe().mutationPending, { timeout: 15_000 })
  }
  const closeResources = async () => {
    if (cleanupRequested) return
    cleanupRequested = true
    for (const client of clients) {
      for (const plan of client.snapshotPlans) plan.gate?.resolve()
      for (const gate of client.pendingGates) gate.resolve()
    }
    mutationPlan?.gate.resolve()
    for (const client of clients) {
      try { client.recording = await client.page.evaluate(() => window.workspaceFixture.stop()) } catch { /* A closed/crashed context has no safe samples to invent. */ }
    }
    // stop() unmounts the actual hook before closing its independent context.
    try { await waitFor(() => clients.every((client) => client.sockets.every((socket) => socket.closed))) } catch { /* Resource failure stays explicit below. */ }
    for (const client of clients) {
      client.closedByHook = client.sockets.every((socket) => socket.closed)
      await client.context.close().catch(() => {})
      client.contextClosed = true
    }
  }

  const execute = async () => {
    for (let index = 0; index < clientCount; index += 1) {
      const context = await browser.newContext({ timezoneId: 'Asia/Shanghai', locale: 'zh-CN', serviceWorkers: 'block' })
      const page = await context.newPage()
      const initialGate = deferred()
      const client = {
        index, context, page, sockets: [], pendingGates: [], recording: null, pageErrors: 0,
        snapshotPlans: [
          { gate: initialGate, body: { items: [dto('initial')], nextCursor: 'synthetic-page-2' } },
          { body: { items: [dto('second-page')], nextCursor: null } },
        ], initialGate, heldSnapshots: 0, snapshotRequests: 0, sessionRequests: 0,
        mutationRequests: 0, receivedEnvelopes: 0, unexpectedRequests: 0,
        closedByHook: false, contextClosed: false,
      }
      clients.push(client)
      page.on('pageerror', () => { client.pageErrors += 1 })
      await context.route('**/*', async (route) => {
        const url = new URL(route.request().url())
        if (url.origin === origin) return route.continue()
        if (url.origin !== fixtureOrigin) {
          client.unexpectedRequests += 1
          return route.abort('blockedbyclient')
        }
        const method = route.request().method()
        const headers = {
          'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        }
        const fulfill = (body, status = 200) => route.fulfill({ status, headers, body: JSON.stringify(body) })
        if (method === 'OPTIONS') return route.fulfill({ status: 204, headers })
        if (url.pathname === '/api/realtime/session' && method === 'POST') {
          client.sessionRequests += 1
          return fulfill({ ticket: 'synthetic-ticket', expiresAt: '2099-01-01T00:00:00Z' })
        }
        if (url.pathname === '/api/orders' && method === 'GET') {
          client.snapshotRequests += 1
          const plan = client.snapshotPlans.shift()
          if (!plan) {
            client.unexpectedRequests += 1
            return fulfill({ message: 'Unexpected synthetic snapshot' }, 500)
          }
          if (plan.gate) {
            client.pendingGates.push(plan.gate)
            client.heldSnapshots += 1
            await plan.gate.promise
          }
          return fulfill(plan.body)
        }
        if (url.pathname.startsWith('/api/orders/initial/actions/') && method === 'POST' && client.index === 0) {
          client.mutationRequests += 1
          const plan = mutationPlan
          let body
          try { body = route.request().postDataJSON() } catch { /* Invalid fixture requests fail through the controlled response below. */ }
          if (!plan || plan.seen || body?.expectedVersion !== backend.get('initial')?.version
            || (url.pathname.endsWith('/toggle-step') && body?.step !== plan.step)) {
            client.unexpectedRequests += 1
            return fulfill({ error: { code: 'synthetic_contract_failure', message: 'Controlled request contract failure' } }, 500)
          }
          plan.seen = true
          if (plan.row) backend.set('initial', plan.row)
          client.pendingGates.push(plan.gate)
          await plan.gate.promise
          return fulfill(plan.failure ? { error: { code: 'synthetic_failure', message: 'Controlled failure' } } : { item: plan.row }, plan.failure ? 503 : 200)
        }
        client.unexpectedRequests += 1
        return fulfill({ message: 'Unexpected synthetic route' }, 500)
      })
      await context.routeWebSocket('ws://isolated-client-workspace.invalid/**', (route) => {
        const entry = { route, closed: false }
        client.sockets.push(entry)
        route.onClose(() => { entry.closed = true; void route.close() })
        route.send(JSON.stringify({ type: 'ready', data: { capabilities: ['order.upsert_many'] } }))
        client.receivedEnvelopes += 1
      })
      await page.goto(`${origin}/benchmarks/browser-workspace/index.html`)
      await page.waitForFunction(() => Boolean(window.workspaceFixture))
      await page.evaluate((marker) => window.workspaceFixture.start(marker), `synthetic-client-${index}`)
    }

    step = 'initial_snapshot'
    await waitFor(() => clients.every((client) => client.heldSnapshots === 1 && client.sockets.length === 1))
    // Ready is independent of snapshot readiness and must be visible while the HTTP page is still held.
    for (const client of clients) {
      await client.page.waitForFunction(() => window.workspaceFixture.probe().online)
      assert.equal(await client.page.evaluate(() => window.workspaceFixture.probe().status), 'loading')
    }
    checks.push({ check: 'ready_precedes_snapshot_completion', passed: true, clientCount })
    await broadcast('order.upsert_many', { items: [dto('initial', 3), dto('initial', 2), dto('initial', 3)] })
    for (const client of clients) client.initialGate.resolve()
    await checkClients(expected(...rows), 'initial_paging_and_highest_version')

    step = 'http_before_ws'
    const meat = dto('initial', 4, { meatStepStatusCode: 3 })
    const firstMutation = await perform('meat', { step: 'meat', row: meat })
    await clients[0].page.waitForFunction(() => window.workspaceFixture.check({
      initial: { version: 3, meat: 3, staple: 2, served: false },
      'second-page': { version: 1, meat: 2, staple: 2, served: false },
    }))
    checks.push({ check: 'initiator_optimistic_state_before_http_ack', passed: true, clientCount: 1 })
    await finishMutation(firstMutation)
    await broadcast('order.upsert', { item: meat })
    await checkClients(expected(meat, rows[1]), 'http_before_ws_converges')

    step = 'ws_before_http'
    const staple = dto('initial', 5, { meatStepStatusCode: 3, stapleStepStatusCode: 3 })
    const secondMutation = await perform('staple', { step: 'staple', row: staple })
    const newer = { ...staple, version: 6 }
    backend.set('initial', newer)
    await broadcast('order.upsert_many', { items: [newer, staple, newer] })
    await checkClients(expected(newer, rows[1]), 'ws_newer_commit_before_http_ack')
    await finishMutation(secondMutation)
    await checkClients(expected(newer, rows[1]), 'late_http_does_not_downgrade')

    step = 'failed_mutation_rollback'
    const failedMutation = await perform('served', { failure: true })
    await clients[0].page.waitForFunction(() => window.workspaceFixture.check({
      initial: { version: 6, meat: 3, staple: 3, served: true },
      'second-page': { version: 1, meat: 2, staple: 2, served: false },
    }))
    await finishMutation(failedMutation)
    await clients[0].page.waitForFunction(() => window.workspaceFixture.probe().mutationFailed)
    await checkClients(expected(newer, rows[1]), 'controlled_http_failure_rolls_back')

    step = 'reconnect_snapshot'
    const survivor = dto('survivor', 5)
    backend.clear()
    backend.set(survivor.id, survivor)
    for (const client of clients) {
      client.reconnectGate = deferred()
      client.snapshotPlans.push(
        { gate: client.reconnectGate, body: { items: [dto('initial'), dto('second-page'), dto('survivor')], nextCursor: null } },
        { body: { items: [survivor], nextCursor: null } },
      )
      await client.page.evaluate(() => { window.workspaceFixture.network(false); window.workspaceFixture.network(true) })
    }
    await waitFor(() => clients.every((client) => client.heldSnapshots === 2 && client.sockets.length === 2))
    await broadcast('order.deleted', { id: 'initial' })
    await broadcast('order.cleared', { mode: 'all', clearedCount: 2 })
    await broadcast('order.upsert_many', { items: [dto('initial', 20), dto('second-page', 20), survivor, dto('survivor', 4)] })
    for (const client of clients) client.reconnectGate.resolve()
    await checkClients(expected(survivor), 'reconnect_delete_clear_buffer_and_postclear_snapshot')
    for (const client of clients) {
      await client.page.waitForFunction(() => window.workspaceFixture.probe().reconciliations === 3)
    }
    step = 'postclear_stale_events'
    const survivorNewer = { ...survivor, version: 6 }
    await broadcast('order.upsert_many', { items: [dto('initial', 25), dto('second-page', 25), survivorNewer, survivor, survivorNewer] })
    await checkClients(expected(survivorNewer), 'postclear_no_resurrection_and_highest_version')

    step = 'workspace_switch'
    const workspaceB = dto('workspace-b')
    for (const client of clients) {
      client.snapshotPlans.push({ body: { items: [workspaceB], nextCursor: null } })
      await client.page.evaluate(() => window.workspaceFixture.switchWorkspace())
    }
    await checkClients(expected(workspaceB), 'workspace_switch_data_isolation')
    await waitFor(() => clients.every((client) => client.sockets.length === 3 && client.sockets.slice(0, 2).every((socket) => socket.closed)))
    checks.push({ check: 'old_workspace_sockets_closed', passed: true, clientCount })
    assert.ok(clients.every((client) => client.pageErrors === 0 && client.unexpectedRequests === 0))
    checks.push({ check: 'no_page_errors_or_unexpected_network', passed: true, clientCount })
  }

  let status = 'completed'
  const running = execute()
  try {
    await Promise.race([
      running,
      interrupt.promise.then(() => { throw new Error('Interrupted synthetic flow') }),
    ])
  } catch (error) {
    status = cancelled ? 'cancelled' : timedOut ? 'timed_out' : 'failed'
    const errorType = ['AssertionError', 'TimeoutError', 'TargetClosedError', 'Error'].includes(error?.name) ? error.name : 'UnknownError'
    failureDetail = {
      errorType,
      reason: cancelled ? 'signal_received' : timedOut ? 'trial_deadline_exceeded'
        : errorType === 'AssertionError' ? 'controlled_correctness_assertion_failed'
          : errorType === 'TimeoutError' ? 'page_condition_deadline_exceeded'
            : errorType === 'TargetClosedError' ? 'browser_context_closed_during_flow' : 'controlled_flow_exception',
    }
  } finally {
    clearTimeout(timeout)
    activeCancel = undefined
    await closeResources()
    // Closing pages interrupts the active Playwright wait; consume it before the next trial.
    await running.catch(() => {})
  }
  const resourceCleanup = clients.length === clientCount && clients.every((client) => client.closedByHook && client.contextClosed)
  if (status === 'completed' && !resourceCleanup) {
    status = 'failed'
    failureDetail = { errorType: 'ResourceCleanupError', reason: 'hook_socket_or_context_cleanup_unconfirmed' }
  }
  const sampleIntegrity = clients.length === clientCount && clients.every((client) => {
    const recording = client.recording
    const samples = recording?.samples ?? []
    const successes = (stage) => samples.filter((sample) => sample.stage === stage && sample.outcome === 'success').length
    return recording?.status === 'stopped' && recording.droppedSamples === 0 && recording.droppedStages === 0
      && recording.incompleteStages === 0 && successes('realtime_ready') === 3
      && successes('workspace_ready_state') === 4
      && samples.filter((sample) => sample.stage === 'server_ack').length === (client.index === 0 ? 3 : 0)
      && samples.filter((sample) => sample.stage === 'server_ack' && sample.outcome === 'failure').length === (client.index === 0 ? 1 : 0)
  })
  if (status === 'completed' && !sampleIntegrity) {
    status = 'failed'
    failureDetail = { errorType: 'SampleIntegrityError', reason: 'required_local_stage_count_or_retention_mismatch' }
  }
  if (status === 'completed') checks.push({ check: 'hooks_close_all_sockets_and_contexts_close', passed: true, clientCount })
  if (status === 'completed') checks.push({ check: 'required_local_stage_counts_and_no_sample_loss', passed: true, clientCount })
  return {
    run, status, correctness: status === 'completed' ? 'passed' : 'failed',
    failure: status === 'completed' ? null : { code: status === 'cancelled' ? 'ABORTED' : status === 'timed_out' ? 'TIMEOUT' : 'FUNCTIONAL_CHECK_FAILED', step, ...failureDetail },
    checks, resourceCleanup, sampleIntegrity,
    clients: clients.map((client) => ({
      clientIndex: client.index, role: client.index === 0 ? 'initiator' : 'peer',
      counters: {
        snapshotRequests: client.snapshotRequests, sessionRequests: client.sessionRequests,
        mutationRequests: client.mutationRequests, receivedEnvelopes: client.receivedEnvelopes,
        socketsCreated: client.sockets.length, socketsClosedByHook: client.sockets.filter((socket) => socket.closed).length,
        pageErrors: client.pageErrors, unexpectedRequests: client.unexpectedRequests,
      }, recording: client.recording,
    })),
  }
}

const summarize = (trials) => {
  const stages = new Set(trials.flatMap((trial) => trial.clients.flatMap((client) => client.recording?.samples.map((sample) => sample.stage) ?? [])))
  return [...stages].sort().map((stage) => {
    const trialMeans = trials.map((trial) => {
      const samples = trial.clients.flatMap((client) => client.recording?.samples.filter((sample) => sample.stage === stage && sample.outcome === 'success') ?? [])
      return { run: trial.run, sampleCount: samples.length, meanMs: samples.length ? samples.reduce((sum, sample) => sum + sample.durationMs, 0) / samples.length : null }
    })
    const complete = trials.length === expectedTrials && trials.every((trial) => trial.status === 'completed') && trialMeans.every((trial) => trial.meanMs !== null)
    const values = trialMeans.map((trial) => trial.meanMs)
    const mean = complete ? values.reduce((sum, value) => sum + value, 0) / expectedTrials : null
    return {
      stage, trialMeans, fiveTrialMeanMs: mean,
      minTrialMeanMs: complete ? Math.min(...values) : null,
      maxTrialMeanMs: complete ? Math.max(...values) : null,
      standardDeviationOfTrialMeansMs: complete ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / expectedTrials) : null,
    }
  })
}

try {
  server = await createServer({
    configFile: false, root, logLevel: 'error', plugins: [react()],
    define: { __LEGERO_BUILD__: JSON.stringify(buildMetadata) },
    resolve: { alias: { '@': path.join(root, 'src') } },
    server: { host: '127.0.0.1', port: 0, strictPort: true, hmr: false, open: false },
  })
  await server.listen()
  const address = server.httpServer.address()
  assert.ok(address && typeof address !== 'string')
  const origin = `http://127.0.0.1:${address.port}`
  startupStep = 'chromium_launch'
  browser = await chromium.launch({ headless: true })
  browserVersion = browser.version()
  startupStep = 'trial_dispatch'
  for (const clientCount of clientCounts) {
    const trials = []
    groups.push({ clientCount, trials })
    for (let run = 1; run <= expectedTrials; run += 1) {
      if (cancelled) break
      console.log(`Desktop workspace functional flow: ${clientCount} client(s), trial ${run}/${expectedTrials}`)
      const trial = await runTrial(clientCount, run, origin)
      trials.push(trial)
      if (trial.status !== 'completed') break
    }
    if (cancelled || trials.some((trial) => trial.status !== 'completed')) break
  }
} catch (error) {
  startupFailure = {
    code: cancelled ? 'ABORTED' : 'RUNNER_UNAVAILABLE', step: startupStep,
    errorType: ['Error', 'TimeoutError', 'AssertionError'].includes(error?.name) ? error.name : 'UnknownError',
    detail: 'Vite/Chromium fixture startup or execution unavailable; install the existing Playwright Chromium runtime if absent. No five-trial mean is fabricated.',
  }
} finally {
  await browser?.close().catch(() => {})
  await server?.close().catch(() => {})
  process.removeListener('SIGINT', cancel)
  process.removeListener('SIGTERM', cancel)
}
const completed = !startupFailure && !cancelled && groups.length === clientCounts.length && groups.every((group) => group.trials.length === expectedTrials && group.trials.every((trial) => trial.status === 'completed'))
const report = {
  type: 'legero-desktop-workspace-multiclient-functional-traces', schemaVersion: 1,
  status: completed ? 'completed' : cancelled ? 'cancelled' : startupFailure ? 'unavailable' : groups.flatMap((group) => group.trials).find((trial) => trial.status !== 'completed')?.status ?? 'partial',
  capturedAt: new Date().toISOString(), sourceProvenance: source,
  startupFailure,
  environment: {
    runtime: 'desktop-chromium-playwright', browserVersion, node: process.version,
    platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model ?? null,
    logicalCpus: os.cpus().length, memoryBytes: os.totalmem(),
    appVersion: packageJson.version, mode: 'functional-development-fixture', profiling: false,
    deviceModel: null, androidVersion: null, webViewVersion: null,
    unavailableReason: 'Desktop isolated browser contexts; actual Android devices, native lifecycle and screen presentation are excluded.',
  },
  protocol: {
    version: 1, scenarios: ['S01', 'S02', 'S03-workspace-switch'], clientCounts,
    plannedTrialsPerCount: expectedTrials, trialTimeoutMs: timeoutMs, warmup: 'no warmup; functional development traces only',
    isolation: 'fresh independent browser contexts and localStorage for every client in every sequential trial; one Chromium process; synthetic reserved .invalid HTTP/WebSocket routes only',
    dataSeed: 'fixed-synthetic-v1', businessDate: '2026-10-15', timezone: 'Asia/Shanghai',
    initialOrderCount: 2, snapshotPages: { initial: 2, reconnectWithClear: 2, nextWorkspace: 1 },
    acceptedLocalOperations: { initiator: 3, peers: 0, expectedSuccess: 2, expectedFailure: 1 },
    operationSequence: [
      'ready while first paged snapshot remains held; duplicate and newer same-ID batch before stale snapshot completes',
      'actual meat action optimistic state then HTTP acknowledgement then WS echo',
      'actual staple action then WS newer/duplicate batch before delayed older HTTP acknowledgement',
      'actual served action optimistic state then controlled HTTP 503 and rollback',
      'actual web offline/online signals then deferred reconnect snapshot; delete, clear, duplicate batch and guaranteed post-clear snapshot',
      'delayed deleted-ID statement plus newer/duplicate survivor batch; no resurrection',
      'workspace switch; new isolated snapshot and closure of both previous sockets',
    ],
    timing: 'Raw recorder stages use each client context performance.now(). No subtraction across clients. Ready, snapshot calibration and state readiness are distinct; overlapping stages are not summed.',
    aggregation: 'Each stage trial mean pools successful samples from that client-count trial; final mean equally weights five complete trial means. Intentional server_ack failure remains a failure sample and is excluded from success means. Any incomplete/failing trial disables every five-trial mean for that group.',
    includes: ['production sync hook', 'production action hook/domain rules', 'production apiClient/repository', 'real browser WebSocket object plus production decoder', 'rAF batch queue', 'production journal/tombstones/store', 'web recovery signals and workspace isolation'],
    excludes: ['real HTTP/backend/database or network latency', 'full application authentication flow', 'production build performance baseline', 'React Profiler commits', 'actual target pixels or screen availability', 'Android/WebView/native lifecycle', 'Shanghai midnight and long background resume (covered by separate single-client controlled fixture)', 'late callback delivery after a closed old workspace socket'],
    privacy: 'Saved report contains fixed stages, counters, booleans, environment and source hashes only; no request/response body, URL, token, ticket, user/workspace/order identifier or order content is saved.',
  },
  groups: groups.map((group) => ({ ...group, stageSummary: summarize(group.trials) })),
}
await mkdir(path.dirname(output), { recursive: true })
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
console.log(`Saved ${report.status} desktop workspace result to ${path.relative(root, output)}`)
if (!completed) process.exitCode = 1
