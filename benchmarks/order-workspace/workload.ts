import { readFileSync } from 'node:fs'

// Provide browser globals before importing the shared browser/CLI workload.
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
const result = process.argv[2] === 'summarize'
  ? summarizeOrderBenchmark(JSON.parse(readFileSync(0, 'utf8')))
  : await runOrderBenchmarkTrial(Number(process.argv[2] ?? 1))

console.log(JSON.stringify(result))
