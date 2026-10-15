import { ORDER_BENCHMARK_PROTOCOL, type OrderBenchmarkResult, type OrderBenchmarkScenario, type OrderBenchmarkTimings } from '@/services/orderBenchmark'

// Illustrative timings for UI previews/tests; never used by the workload or saved as a baseline.
const previewTimings = (scale: number): OrderBenchmarkTimings => ({
  optimisticCommitMs: 0.2 * scale, optimisticViewsMs: 1.2 * scale,
  authoritativeCommitMs: 0.2 * scale, authoritativeViewsMs: 1.2 * scale, totalMs: 2.8 * scale,
})
const previewScenarios = (scale: number): OrderBenchmarkScenario[] => [130, 520, 1820].map((totalOrders) => ({
  totalOrders, todayOrders: 130,
  metrics: { meat: previewTimings(scale), staple: previewTimings(scale + 0.05), served: previewTimings(scale + 0.1) },
  cases: [{
    id: 'remote-10', sceneId: 'C02', label: '同批远端更新（10 条）', batchSize: 10,
    samples: Array.from({ length: 5 }, (_, index) => ({
      iteration: index + 1, timings: { storeCommitMs: scale, viewDerivationMs: scale, totalMs: 2 * scale },
      inputEvents: 10, distinctIds: 10, acceptedUpdates: 10, correctness: 'passed',
    })),
    timings: { storeCommitMs: scale, viewDerivationMs: scale, totalMs: 2 * scale },
    statistics: { totalMs: { sampleCount: 5, mean: 2 * scale, min: 2 * scale, max: 2 * scale, standardDeviation: 0 } },
  }],
}))

export const makeBenchmarkPreviewResult = (): OrderBenchmarkResult => ({
  schemaVersion: 2, status: 'completed', capturedAt: '2026-10-15T04:00:00.000Z',
  environment: { runtime: 'browser', userAgent: 'Illustrative UI preview', logicalCpus: 8, appVersion: '0.0.23', appBuild: '23', build: { appVersion: '0.0.23', mode: 'illustrative-preview', profiling: false, commit: null, dirty: null, sourceSha256: {}, unavailableReason: 'synthetic UI preview' } },
  protocol: ORDER_BENCHMARK_PROTOCOL,
  configuration: { profile: 'default', fixtures: [130, 520, 1820].map((totalOrders) => ({ totalOrders, todayOrders: 130 })), batchSizes: [1, 10] },
  failure: null,
  trials: Array.from({ length: 5 }, (_, index) => ({
    run: index + 1, profile: 'default', status: 'completed', failure: null, incompleteScenario: null, scenarios: previewScenarios(1 + index * 0.1),
  })),
  means: previewScenarios(1.2),
})
