import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { build } from 'vite'
import { readComparisonBaseline } from './benchmarkPaths.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const benchmarkDir = fileURLToPath(new URL('./', import.meta.url))
const require = createRequire(import.meta.url)
const runs = 5
const readArg = (name) => {
  const index = process.argv.indexOf(name)
  if (index < 0) return undefined
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`)
  return value
}
const label = readArg('--label') ?? 'current-v3'
const profile = readArg('--profile') ?? 'default'
if (!['default', 'history', 'today', 'batch'].includes(profile)) throw new Error('Profile must be default, history, today or batch')
const output = path.resolve(root, readArg('--output') ?? `benchmarks/order-workspace/results/${label}.json`)
const comparePath = readArg('--compare')
const previous = await readComparisonBaseline(output, comparePath ? path.resolve(root, comparePath) : undefined)
const timeoutMs = Number(readArg('--timeout-ms') ?? 180_000)
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('timeout-ms must be positive')
const git = (...args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(result.stderr)
  return result.stdout.trim()
}
const sourceFiles = [
  'src/services/orderWorkspaceView.ts', 'src/services/orderDomainUtils.ts', 'src/services/orderStatus.ts',
  'src/services/orderBenchmark.ts', 'src/services/orderBenchmarkTypes.ts', 'src/services/orderBenchmarkFixtures.ts',
  'src/services/orderBenchmarkScenes.ts', 'src/services/orderOptimistic.ts', 'src/services/orderSorting.ts',
  'src/store/order.ts', 'src/types/orderForm.ts', 'src/types/codes.ts',
  'benchmarks/order-workspace/workload.ts', 'benchmarks/order-workspace/run.mjs',
  'benchmarks/order-workspace/benchmarkPaths.mjs', 'pnpm-lock.yaml',
]
const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async (file) => [file, createHash('sha256').update(await readFile(path.join(root, file))).digest('hex')])))
const source = { commit: git('rev-parse', 'HEAD'), branch: git('branch', '--show-current'), workingTreeStatus: git('status', '--porcelain'), sha256: sourceHashes }
const tempParent = path.join(root, 'node_modules/.tmp')
await mkdir(tempParent, { recursive: true })
const tempDir = await mkdtemp(path.join(tempParent, 'order-workspace-benchmark-'))
const trials = []
let summary
let activeCancel
let activeTrial = false
let cancelled = false
const onCancel = () => { cancelled = true; if (activeTrial) activeCancel?.() }
process.on('SIGINT', onCancel)
process.on('SIGTERM', onCancel)

const runChild = (args, input, run) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [path.join(tempDir, 'workload.mjs'), ...args], {
    cwd: root,
    env: { ...process.env, TZ: 'UTC', NODE_ENV: 'production' },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  activeTrial = Boolean(run)
  let buffer = ''
  let stderr = ''
  let result
  let checkpoint
  let timedOut = false
  let forceKill
  const terminate = () => {
    child.kill('SIGTERM')
    forceKill ??= setTimeout(() => { child.kill('SIGKILL') }, 2000)
  }
  activeCancel = terminate
  const timer = setTimeout(() => { timedOut = true; terminate() }, run ? timeoutMs : 10_000)
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    buffer += chunk
    let index
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index)
      buffer = buffer.slice(index + 1)
      try {
        const message = JSON.parse(line)
        if (message.type === 'checkpoint') checkpoint = message.trial
        else if (message.type === 'result') result = message.result
      } catch { stderr += 'Invalid workload output\n' }
    }
  })
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4096) })
  child.on('error', (error) => { clearTimeout(timer); clearTimeout(forceKill); activeCancel = undefined; reject(error) })
  child.on('close', (code) => {
    clearTimeout(timer)
    clearTimeout(forceKill)
    activeCancel = undefined
    activeTrial = false
    if (run && (timedOut || cancelled || !result || code !== 0)) {
      const partial = result ?? checkpoint ?? { run, profile, scenarios: [], incompleteScenario: null }
      partial.status = timedOut ? 'failed' : cancelled ? 'cancelled' : 'failed'
      partial.failure = { code: timedOut ? 'TIMEOUT' : cancelled ? 'ABORTED' : 'CHILD_FAILED', message: timedOut ? 'Trial exceeded timeout' : cancelled ? 'Benchmark cancelled' : 'Workload process failed' }
      resolve(partial)
    } else if (!result || code !== 0) reject(new Error(stderr || 'Could not summarize workload'))
    else resolve(result)
  })
  child.stdin.end(input)
  if (cancelled && run) terminate()
})

try {
  await build({
    configFile: false, root, logLevel: 'error',
    resolve: { alias: { '@': path.join(root, 'src') } },
    build: {
      ssr: path.join(benchmarkDir, 'workload.ts'), outDir: tempDir, emptyOutDir: false,
      target: 'node24', minify: false,
      rolldownOptions: { output: { entryFileNames: 'workload.mjs', chunkFileNames: '[name].mjs' } },
    },
  })
  for (let run = 1; run <= runs; run += 1) {
    console.log(`Running ${label}: trial ${run}/${runs}, profile ${profile} (fresh Node process)`)
    const trial = await runChild([String(run), profile], undefined, run)
    trials.push(trial)
    if (trial.status !== 'completed') break
  }
  summary = await runChild(['summarize'], JSON.stringify(trials))
} finally {
  process.removeListener('SIGINT', onCancel)
  process.removeListener('SIGTERM', onCancel)
  await rm(tempDir, { recursive: true, force: true })
}

const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const result = {
  ...summary, label, source,
  environment: {
    ...summary.environment, appVersion: packageJson.version,
    build: { ...summary.environment.build, appVersion: packageJson.version, mode: 'production-ssr', profiling: false, commit: source.commit, dirty: Boolean(source.workingTreeStatus), sourceSha256: sourceHashes, unavailableReason: null },
    node: process.version, v8: process.versions.v8, pnpm: process.env.npm_config_user_agent ?? null,
    platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model ?? 'unknown',
    logicalCpus: os.cpus().length, memoryBytes: os.totalmem(),
    dependencies: Object.fromEntries(['vite', 'dayjs', 'zustand'].map((name) => [name, require(`${name}/package.json`).version])),
    timezone: 'UTC',
  },
  execution: { isolation: 'five sequential fresh Node processes', timeoutMs, additionalExcludes: ['Android WebView'] },
}

await mkdir(path.dirname(output), { recursive: true })
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`)

if (comparePath) {
  if (previous.status !== 'completed' || result.status !== 'completed') throw new Error('Only complete five-round results may be compared')
  if (JSON.stringify(previous.protocol) !== JSON.stringify(result.protocol) || JSON.stringify(previous.configuration) !== JSON.stringify(result.configuration)) throw new Error('Cannot compare different protocols or configurations')
  if (previous.environment.node !== result.environment.node || previous.environment.cpu !== result.environment.cpu || previous.environment.build?.mode !== result.environment.build.mode) throw new Error('Cannot compare different Node versions, CPUs or build modes')
  result.comparison = {
    baseline: path.relative(root, path.resolve(root, comparePath)),
    means: result.means.map((scenario, index) => {
      const baseline = previous.means[index]
      if (!baseline || baseline.totalOrders !== scenario.totalOrders || baseline.todayOrders !== scenario.todayOrders) throw new Error('Missing baseline fixture')
      return {
        totalOrders: scenario.totalOrders, todayOrders: scenario.todayOrders,
        cases: scenario.cases.map((item, caseIndex) => {
          const baselineCase = baseline.cases[caseIndex]
          if (baselineCase?.id !== item.id) throw new Error('Missing baseline case')
          const baselineMs = baselineCase.timings.totalMs
          const currentMs = item.timings.totalMs
          return { id: item.id, baselineMs, currentMs, reductionPercent: baselineMs === 0 ? null : (1 - currentMs / baselineMs) * 100, speedup: currentMs === 0 ? null : baselineMs / currentMs }
        }),
      }
    }),
  }
}

await mkdir(path.dirname(output), { recursive: true })
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`)
for (const scenario of result.means) {
  console.log(`${scenario.totalOrders} orders (${scenario.todayOrders} today): ${Object.entries(scenario.metrics).map(([metric, values]) => `${metric}=${values.totalMs.toFixed(3)} ms`).join(', ')}; ${scenario.cases.length} cases`)
}
console.log(`Saved ${result.status} result with raw samples to ${path.relative(root, output)}`)
if (result.status !== 'completed') process.exitCode = 1
