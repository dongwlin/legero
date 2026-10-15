import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const root = fileURLToPath(new URL('../../', import.meta.url))
const argument = (name) => {
  const index = process.argv.indexOf(name)
  if (index < 0) return undefined
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`)
  return value
}
const output = path.resolve(root, argument('--output') ?? 'benchmarks/order-workspace/results/recorder-overhead-node.json')
const sourceFiles = [
  'src/services/performanceRecorder.ts', 'src/services/buildMetadata.ts',
  'benchmarks/order-workspace/recorder-overhead.mjs', 'benchmarks/order-workspace/recorder-overhead-workload.ts',
  'package.json', 'pnpm-lock.yaml',
]
const git = (...args) => {
  const command = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  if (command.error) throw command.error
  if (command.status !== 0) throw new Error(command.stderr || 'Cannot read source provenance')
  return command.stdout.trim()
}
const source = {
  commit: git('rev-parse', 'HEAD'), branch: git('branch', '--show-current'),
  workingTreeStatus: git('status', '--porcelain'),
  sha256: Object.fromEntries(await Promise.all(sourceFiles.map(async (file) => [
    file, createHash('sha256').update(await readFile(path.join(root, file))).digest('hex'),
  ]))),
}
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const parent = path.join(root, 'node_modules/.tmp')
await mkdir(parent, { recursive: true })
const temporary = await mkdtemp(path.join(parent, 'recorder-overhead-'))
const trials = []
let cancelled = false
let activeCancel
const cancel = () => { cancelled = true; activeCancel?.() }
process.on('SIGINT', cancel)
process.on('SIGTERM', cancel)

const runTrial = (run) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [path.join(temporary, 'recorder-overhead-workload.mjs'), String(run)], {
    cwd: root, env: { ...process.env, TZ: 'UTC', NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let buffer = ''
  let stderr = ''
  const checkpoints = []
  let result
  let timedOut = false
  let forceKill
  const terminate = () => {
    child.kill('SIGTERM')
    forceKill ??= setTimeout(() => { child.kill('SIGKILL') }, 2_000)
  }
  activeCancel = terminate
  const timeout = setTimeout(() => { timedOut = true; terminate() }, 30_000)
  const cleanup = () => { clearTimeout(timeout); clearTimeout(forceKill); activeCancel = undefined }
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    buffer += chunk
    let end
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end)
      buffer = buffer.slice(end + 1)
      try {
        const message = JSON.parse(line)
        if (message.type === 'checkpoint') checkpoints.push(message.observation)
        else if (message.type === 'result') result = message.result
      } catch { stderr = `${stderr}Invalid workload output\n`.slice(-4_096) }
    }
  })
  child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-4_096) })
  child.on('error', (error) => { cleanup(); reject(error) })
  child.on('close', (code) => {
    cleanup()
    if (code === 0 && result?.status === 'completed' && !timedOut && !cancelled) resolve(result)
    else resolve({ run, status: cancelled ? 'cancelled' : 'failed', observations: checkpoints, failure: { code: cancelled ? 'ABORTED' : timedOut ? 'TIMEOUT' : 'CHILD_FAILED', detail: stderr.trim() || null } })
  })
  if (cancelled) terminate()
})
try {
  await build({
    configFile: false, root, logLevel: 'error', resolve: { alias: { '@': path.join(root, 'src') } },
    build: {
      ssr: path.join(root, 'benchmarks/order-workspace/recorder-overhead-workload.ts'), outDir: temporary,
      target: 'node24', minify: false,
      rolldownOptions: { output: { entryFileNames: 'recorder-overhead-workload.mjs', chunkFileNames: '[name].mjs' } },
    },
  })
  for (let run = 1; run <= 5; run += 1) {
    console.log(`Recorder switch overhead: trial ${run}/5 (fresh Node process)`)
    const trial = await runTrial(run)
    trials.push(trial)
    if (trial.status !== 'completed') break
  }
} finally {
  process.removeListener('SIGINT', cancel)
  process.removeListener('SIGTERM', cancel)
  await rm(temporary, { recursive: true, force: true })
}
const completed = trials.length === 5 && trials.every((trial) => trial.status === 'completed')
const statistics = (values) => {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  return { sampleCount: values.length, meanPerCallMs: mean, minTrialPerCallMs: Math.min(...values), maxTrialPerCallMs: Math.max(...values), standardDeviationPerCallMs: Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length) }
}
const means = completed ? Object.fromEntries(['disabled', 'enabled'].map((condition) => [
  condition, statistics(trials.map((trial) => trial.observations.find((observation) => observation.condition === condition).measuredPerCallMeanMs)),
])) : null
const result = {
  type: 'legero-recorder-stage-switch-overhead', schemaVersion: 1,
  status: completed ? 'completed' : trials.find((trial) => trial.status !== 'completed')?.status ?? 'failed',
  capturedAt: new Date().toISOString(), source,
  environment: {
    runtime: 'node', node: process.version, v8: process.versions.v8, platform: process.platform, arch: process.arch,
    cpu: os.cpus()[0]?.model ?? null, logicalCpus: os.cpus().length, memoryBytes: os.totalmem(),
    pnpm: process.env.npm_config_user_agent ?? null, timezone: 'UTC',
    build: { appVersion: packageJson.version, mode: 'production-ssr', profiling: false, commit: source.commit, dirty: Boolean(source.workingTreeStatus), sourceSha256: source.sha256, unavailableReason: null },
  },
  protocol: {
    version: 1, plannedTrials: 5, isolation: 'five sequential fresh Node processes',
    warmupCallsPerCondition: 1_000, measuredCallsPerCondition: 5_000,
    conditionOrder: 'odd trials disabled then enabled; even trials enabled then disabled',
    workload: 'actual createPerformanceRecorder beginStage(store_commit)/finishStage around an empty workload; no business/store mutation',
    activeSampleCapacity: 2_000, activeMaxDurationMs: 120_000,
    boundary: 'outer synchronous loop duration divided by 5,000 measured calls; includes collector, real User Timing, bounded sample retention and loop overhead; excludes start/stop, warmup and snapshot cloning',
    aggregation: 'each condition retains five trial per-call means; final values are their equally weighted arithmetic means; difference is enabled minus disabled, not a business speedup',
    verification: 'enabled runs retain 2,000 samples and drop 4,001 (6,000 stage calls plus one initial resource-trend sample); both conditions leave zero owned timers, marks and measures',
    excludes: ['browser Event Timing/Long Task/LoAF/resource/scroll observer overhead (unavailable in this Node adapter)', 'React profiling and UI', 'real business code, HTTP/server/database and Android devices', 'recorder getSnapshot/start/stop overhead'],
  },
  trials, means,
  enabledMinusDisabledPerCallMs: means ? means.enabled.meanPerCallMs - means.disabled.meanPerCallMs : null,
}
await mkdir(path.dirname(output), { recursive: true })
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
console.log(`Saved ${result.status} recorder switch result to ${path.relative(root, output)}`)
if (!completed) process.exitCode = 1
