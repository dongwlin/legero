import type { OrderBenchmarkResult, OrderBenchmarkScenario, OrderBenchmarkTimings } from '@/services/orderBenchmark'

// Illustrative timings for UI previews and tests; never used by the benchmark.
const previewTimings = (scale: number): OrderBenchmarkTimings => ({
  optimisticCommitMs: 0.2 * scale,
  optimisticViewsMs: 1.2 * scale,
  authoritativeCommitMs: 0.2 * scale,
  authoritativeViewsMs: 1.2 * scale,
  totalMs: 2.8 * scale,
})

const previewScenarios = (scale: number): OrderBenchmarkScenario[] => [130, 520, 1820].map((totalOrders) => ({
  totalOrders,
  todayOrders: 130,
  metrics: {
    meat: previewTimings(scale),
    staple: previewTimings(scale + 0.05),
    served: previewTimings(scale + 0.1),
  },
}))

export const makeBenchmarkPreviewResult = (): OrderBenchmarkResult => ({
  schemaVersion: 1,
  capturedAt: '2026-10-15T04:00:00.000Z',
  environment: { runtime: 'browser', userAgent: 'Illustrative UI preview', logicalCpus: 8, appVersion: '0.0.22', appBuild: '22' },
  protocol: {
    protocolVersion: 1,
    runs: 5,
    scenarioTotalOrders: [130, 520, 1820],
    todayOrders: 130,
    warmupOperationsPerMetric: 2,
    measuredOperationsPerMetric: 5,
    referenceTime: '2026-10-15T12:00:00+08:00',
    filter: 'all',
    unit: 'milliseconds per action',
    action: 'optimistic domain toggle/store commit + controls/list derivation, then simulated authoritative store commit + controls/list derivation',
    excludes: [
      'network',
      'HTTP/server/PostgreSQL',
      'React render and DOM/layout/paint',
      'localStorage disk I/O',
      'optimistic mutation journal and request bookkeeping',
      '300 ms duplicate-tap guard',
    ],
  },
  trials: Array.from({ length: 5 }, (_, index) => ({ run: index + 1, scenarios: previewScenarios(1 + index * 0.1) })),
  means: previewScenarios(1.2),
})
