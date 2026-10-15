import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const root = fileURLToPath(new URL('../../', import.meta.url))
const arg = (name) => {
  const index = process.argv.indexOf(name)
  if (index < 0) return undefined
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`Missing ${name} value`)
  return value
}
const profile = arg('--profile') ?? 'quick'
if (!['quick', '2h', '8h'].includes(profile)) throw new Error('Profile must be quick, 2h or 8h')
const numberArg = (name) => arg(name) === undefined ? undefined : Number(arg(name))
const options = {
  profile, roundDurationMs: numberArg('--round-ms'), intervalMs: numberArg('--interval-ms'),
  totalOrders: numberArg('--total-orders'), todayOrders: numberArg('--today-orders'),
  sampleCapacity: numberArg('--sample-capacity'), windowCapacity: numberArg('--window-capacity'), windowMs: numberArg('--window-ms'),
}
const output = path.resolve(root, arg('--output') ?? `benchmarks/order-workspace/results/soak-${profile}.json`)
const sourceFiles = ['src/services/orderSoak.ts', 'src/services/orderBenchmarkScenes.ts', 'src/services/orderBenchmarkFixtures.ts', 'src/services/orderOptimistic.ts', 'src/services/orderWorkspaceView.ts', 'src/services/orderSorting.ts', 'src/services/orderStatus.ts', 'src/store/order.ts', 'benchmarks/order-workspace/soak.mjs', 'benchmarks/order-workspace/workload.ts', 'pnpm-lock.yaml']
const sha256 = Object.fromEntries(await Promise.all(sourceFiles.map(async (file) => [file, createHash('sha256').update(await readFile(path.join(root, file))).digest('hex')])))
const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' }).stdout.trim()
const source = { commit: git('rev-parse', 'HEAD'), workingTreeStatus: git('status', '--porcelain'), sha256 }
const parent = path.join(root, 'node_modules/.tmp')
await mkdir(parent, { recursive: true })
const temporary = await mkdtemp(path.join(parent, 'order-soak-'))
let result
try {
  await build({ configFile: false, root, logLevel: 'error', resolve: { alias: { '@': path.join(root, 'src') } }, build: { ssr: path.join(root, 'benchmarks/order-workspace/workload.ts'), outDir: temporary, target: 'node24', minify: false, rolldownOptions: { output: { entryFileNames: 'workload.mjs' } } } })
  console.log(`L01 ${profile}: five fixed-size rounds; round duration ${options.roundDurationMs ?? (profile === 'quick' ? 1000 : profile === '2h' ? 7_200_000 : 28_800_000)} ms. Ctrl+C retains partial rounds.`)
  result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(temporary, 'workload.mjs'), 'soak'], { cwd: root, env: { ...process.env, TZ: 'UTC', NODE_ENV: 'production' }, stdio: ['pipe', 'pipe', 'inherit'] })
    const cancel = () => { child.kill('SIGTERM') }
    process.on('SIGINT', cancel)
    process.on('SIGTERM', cancel)
    let data = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { data += chunk })
    child.on('error', reject)
    child.on('close', (code) => {
      process.removeListener('SIGINT', cancel)
      process.removeListener('SIGTERM', cancel)
      try {
        const value = JSON.parse(data.trim()).result
        if (!value) throw new Error('Soak returned no result')
        resolve(value)
      } catch { reject(new Error(`Soak exited without valid result (code ${code})`)) }
    })
    child.stdin.end(JSON.stringify(options))
  })
} finally { await rm(temporary, { recursive: true, force: true }) }
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'))
const report = {
  ...result, source,
  build: { ...result.build, appVersion: packageJson.version, mode: 'production-ssr', profiling: false, commit: source.commit, dirty: Boolean(source.workingTreeStatus), sourceSha256: sha256, unavailableReason: null },
  environment: { runtime: 'node', node: process.version, v8: process.versions.v8, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model ?? 'unknown', logicalCpus: os.cpus().length, timezone: 'UTC' },
}
await mkdir(path.dirname(output), { recursive: true })
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`)
console.log(`Saved ${report.status} L01 result, ${report.rounds.reduce((sum, round) => sum + round.operationCount, 0)} operations, ${report.rounds.length}/5 rounds to ${path.relative(root, output)}`)
if (report.status !== 'completed') process.exitCode = 1
