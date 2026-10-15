import { readFileSync } from 'node:fs'

const storage = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value) },
    removeItem: (key: string) => { storage.delete(key) },
  },
  configurable: true,
})

const { runOrderBenchmarkTrial, summarizeOrderBenchmark } = await import('@/services/orderBenchmark')
const controller = new AbortController()
process.once('SIGINT', () => { controller.abort() })
process.once('SIGTERM', () => { controller.abort() })
const result = process.argv[2] === 'soak'
  ? await (await import('@/services/orderSoak')).runOrderSoak({
    ...JSON.parse(readFileSync(0, 'utf8')),
    signal: controller.signal,
    readHeap: () => ({ bytes: process.memoryUsage().heapUsed, source: 'node.process.memoryUsage.heapUsed', unavailableReason: null }),
  })
  : process.argv[2] === 'summarize'
  ? summarizeOrderBenchmark(JSON.parse(readFileSync(0, 'utf8')))
  : await runOrderBenchmarkTrial(Number(process.argv[2] ?? 1), {
    profile: (process.argv[3] ?? 'default') as import('@/services/orderBenchmark').OrderBenchmarkProfile,
    signal: controller.signal,
    onCheckpoint: (trial) => { console.log(JSON.stringify({ type: 'checkpoint', trial })) },
  })

console.log(JSON.stringify({ type: 'result', result }))
