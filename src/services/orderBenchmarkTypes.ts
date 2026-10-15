export type OrderBenchmarkAction = 'meat' | 'staple' | 'served'
export type OrderBenchmarkProfile = 'default' | 'history' | 'today' | 'batch'
export type OrderBenchmarkStatus = 'completed' | 'cancelled' | 'failed'
export type OrderBenchmarkSceneId = 'C01' | 'C02' | 'C03' | 'C04' | 'C05'

export type OrderBenchmarkTimings = {
  optimisticCommitMs: number
  optimisticViewsMs: number
  authoritativeCommitMs: number
  authoritativeViewsMs: number
  totalMs: number
}
export type OrderBenchmarkCaseTimings = {
  storeCommitMs: number
  viewDerivationMs: number
  totalMs: number
  journalMs?: number
} & Partial<OrderBenchmarkTimings>
export type OrderBenchmarkStatistics = {
  sampleCount: number
  mean: number
  min: number
  max: number
  standardDeviation: number
}
export type OrderBenchmarkSample = {
  iteration: number
  timings: OrderBenchmarkCaseTimings
  inputEvents: number
  distinctIds: number
  acceptedUpdates: number
  correctness: 'passed'
}
export type OrderBenchmarkCase = {
  id: string
  sceneId: OrderBenchmarkSceneId
  label: string
  batchSize: number | null
  samples: OrderBenchmarkSample[]
  timings: OrderBenchmarkCaseTimings | null
  statistics: Record<string, OrderBenchmarkStatistics>
  /** Only summaries have this: variation between five equally weighted round means. */
  trialMeanStatistics?: Record<string, OrderBenchmarkStatistics>
}
export type OrderBenchmarkScenario = {
  totalOrders: number
  todayOrders: number
  metrics: Record<OrderBenchmarkAction, OrderBenchmarkTimings>
  cases: OrderBenchmarkCase[]
}
export type OrderBenchmarkPartialScenario = Omit<OrderBenchmarkScenario, 'metrics'>
export type OrderBenchmarkTrial = {
  run: number
  profile: OrderBenchmarkProfile
  status: OrderBenchmarkStatus
  failure: { code: string; message: string } | null
  scenarios: OrderBenchmarkScenario[]
  incompleteScenario: OrderBenchmarkPartialScenario | null
}
export type OrderBenchmarkProgress = {
  run: number
  totalRuns: 5
  totalOrders: number
  todayOrders: number
  action: OrderBenchmarkAction | null
  caseId: string | null
  caseLabel: string | null
}
export type OrderBenchmarkOptions = {
  signal?: AbortSignal
  profile?: OrderBenchmarkProfile
  onCheckpoint?: (trial: OrderBenchmarkTrial) => void
  onProgress?: (progress: OrderBenchmarkProgress) => void
}
