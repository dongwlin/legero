import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { build } from 'vite'

const root = fileURLToPath(new URL('../../', import.meta.url))
const benchmarkDir = fileURLToPath(new URL('./', import.meta.url))
const require = createRequire(import.meta.url)
const runs = 5
const readArg = (name) => {
  const index = process.argv.indexOf(name)
  return index < 0 ? undefined : process.argv[index + 1]
}
const label = readArg('--label') ?? 'current'
const output = path.resolve(root, readArg('--output') ?? `benchmarks/order-workspace/results/${label}.json`)
const comparePath = readArg('--compare')
const git = (...args) => {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr)
  return result.stdout.trim()
}
const sourceFiles = [
  'src/services/orderWorkspaceView.ts',
  'src/services/orderDomainUtils.ts',
  'src/services/orderStatus.ts',
  'src/services/orderBenchmark.ts',
  'src/services/orderSorting.ts',
  'src/store/order.ts',
  'src/types/orderForm.ts',
  'src/types/codes.ts',
  'benchmarks/order-workspace/workload.ts',
  'benchmarks/order-workspace/run.mjs',
  'pnpm-lock.yaml',
]
const sourceHashes = Object.fromEntries(await Promise.all(sourceFiles.map(async (file) => [
  file,
  createHash('sha256').update(await readFile(path.join(root, file))).digest('hex'),
])))
const source = {
  commit: git('rev-parse', 'HEAD'),
  branch: git('branch', '--show-current'),
  workingTreeStatus: git('status', '--porcelain'),
  sha256: sourceHashes,
}
const tempParent = path.join(root, 'node_modules/.tmp')
await mkdir(tempParent, { recursive: true })
const tempDir = await mkdtemp(path.join(tempParent, 'order-workspace-benchmark-'))
const trials = []
let summary

try {
  await build({
    configFile: false,
    root,
    logLevel: 'error',
    resolve: { alias: { '@': path.join(root, 'src') } },
    build: {
      ssr: path.join(benchmarkDir, 'workload.ts'),
      outDir: tempDir,
      emptyOutDir: false,
      target: 'node24',
      minify: false,
      rolldownOptions: { output: { entryFileNames: 'workload.mjs', chunkFileNames: '[name].mjs' } },
    },
  })

  for (let run = 1; run <= runs; run += 1) {
    console.log(`Running ${label}: trial ${run}/${runs} (fresh Node process)`)
    const result = spawnSync(process.execPath, [path.join(tempDir, 'workload.mjs'), String(run)], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, TZ: 'UTC', NODE_ENV: 'production' },
    })
    if (result.status !== 0) throw new Error(result.stderr || result.stdout)
    trials.push(JSON.parse(result.stdout))
  }
  const result = spawnSync(process.execPath, [path.join(tempDir, 'workload.mjs'), 'summarize'], {
    cwd: root,
    encoding: 'utf8',
    input: JSON.stringify(trials),
    env: { ...process.env, TZ: 'UTC', NODE_ENV: 'production' },
  })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout)
  summary = JSON.parse(result.stdout)
} finally {
  await rm(tempDir, { recursive: true, force: true })
}

const { means } = summary
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const result = {
  ...summary,
  label,
  source,
  environment: {
    ...summary.environment,
    appVersion: packageJson.version,
    node: process.version,
    v8: process.versions.v8,
    pnpm: process.env.npm_config_user_agent ?? null,
    platform: process.platform,
    arch: process.arch,
    cpu: os.cpus()[0]?.model ?? 'unknown',
    logicalCpus: os.cpus().length,
    memoryBytes: os.totalmem(),
    dependencies: Object.fromEntries(['vite', 'dayjs', 'zustand'].map((name) => [name, require(`${name}/package.json`).version])),
    timezone: 'UTC',
  },
  protocol: {
    ...summary.protocol,
    aggregation: 'arithmetic mean of the five fresh-process trial means',
    additionalExcludes: ['Android WebView'],
  },
  trials,
  means,
}

if (comparePath) {
  const previous = JSON.parse(await readFile(path.resolve(root, comparePath), 'utf8'))
  if (JSON.stringify(previous.protocol) !== JSON.stringify(result.protocol)) {
    throw new Error('Cannot compare results produced by different benchmark protocols')
  }
  if (previous.environment.node !== result.environment.node || previous.environment.cpu !== result.environment.cpu) {
    throw new Error('Cannot compare results from different Node versions or CPUs')
  }
  result.comparison = {
    baseline: path.relative(root, path.resolve(root, comparePath)),
    means: means.map((scenario) => {
      const baseline = previous.means.find((item) => item.totalOrders === scenario.totalOrders)
      if (!baseline) throw new Error(`Missing baseline scenario: ${scenario.totalOrders}`)
      return {
        totalOrders: scenario.totalOrders,
        metrics: Object.fromEntries(Object.entries(scenario.metrics).map(([metric, values]) => {
          const baselineMs = baseline.metrics[metric].totalMs
          return [metric, {
            baselineMs,
            currentMs: values.totalMs,
            reductionPercent: (1 - values.totalMs / baselineMs) * 100,
            speedup: baselineMs / values.totalMs,
          }]
        })),
      }
    }),
  }
}

await mkdir(path.dirname(output), { recursive: true })
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`)
for (const scenario of means) {
  console.log(`${scenario.totalOrders} orders (${scenario.todayOrders} today): ${Object.entries(scenario.metrics).map(([metric, values]) => `${metric}=${values.totalMs.toFixed(3)} ms`).join(', ')}`)
}
console.log(`Saved five raw trials and arithmetic means to ${path.relative(root, output)}`)
