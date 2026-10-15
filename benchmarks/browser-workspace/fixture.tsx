import { useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import 'dayjs/locale/zh-cn'
import { useOrderWorkspaceSync } from '@/hooks/useOrderWorkspaceSync'
import { persistAuthTokens } from '@/services/apiClient'
import { setStoredApiBaseUrl } from '@/services/apiConfig'
import { orderOptimistic } from '@/services/orderOptimistic'
import { getPerformanceRecordingSnapshot, startPerformanceRecording, stopPerformanceRecording } from '@/services/performanceRecorder'
import { useAuthStore } from '@/store/auth'
import { useOrderStore } from '@/store/order'
import { useOrderItemActions } from '@/views/Order/components/list/useOrderItemActions'
import type { OrderRecord } from '@/types'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.locale('zh-cn')
dayjs.tz.setDefault('Asia/Shanghai')

type ExpectedRecord = { version: number; meat: number; staple: number; served: boolean }
type ExpectedState = Record<string, ExpectedRecord>
let root: Root | null = null
let readDiagnostics: ReturnType<typeof useOrderWorkspaceSync>['getDiagnostics'] = () => null
let mutationFailed = false
let clientMarker = ''

const setWorkspace = (id: string) => useAuthStore.getState().setAuthenticatedContext({
  user: { id: 'synthetic-user', phone: 'synthetic', role: 'owner' },
  workspace: { id, name: '隔离夹具' }, permissions: [], serverTime: '2026-10-15T04:00:00Z',
})

export function Actions({ record }: { record: OrderRecord }) {
  const actions = useOrderItemActions(record)
  useEffect(() => { mutationFailed = actions.mutationError !== null }, [actions.mutationError])
  return <div>
    <button data-action="meat" onClick={actions.handleToggleMeatStep}>肉</button>
    <button data-action="staple" onClick={actions.handleToggleStapleStep}>主食</button>
    <button data-action="served" onClick={actions.handleServeMeal}>出餐</button>
  </div>
}

export function WorkspaceFixture() {
  const sync = useOrderWorkspaceSync()
  const target = useOrderStore((state) => state.ordersById.initial)
  useEffect(() => { readDiagnostics = sync.getDiagnostics }, [sync.getDiagnostics])
  return <main>
    <p>隔离功能测试：{sync.status}</p>
    {target ? <Actions record={target} /> : null}
  </main>
}

const fixture = {
  start(marker: string) {
    if (root) throw new Error('Fixture already started')
    localStorage.clear()
    clientMarker = marker
    localStorage.setItem('synthetic-client-marker', marker)
    setStoredApiBaseUrl('http://isolated-client-workspace.invalid')
    persistAuthTokens({
      accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh', tokenType: 'Bearer',
      accessTokenExpiresAt: '2099-01-01T00:00:00Z', refreshTokenExpiresAt: '2099-01-01T00:00:00Z',
    })
    useOrderStore.setState({
      ordersById: {}, orderDisplayIds: [], filter: 'all', updateTargetID: '',
      isQuickCalcMode: false, quickCalcSelectedOrderIds: [], lastHydratedAt: null,
      status: 'idle', errorMessage: null, orderSyncSeq: 0,
    })
    mutationFailed = false
    setWorkspace('synthetic-workspace-a')
    startPerformanceRecording({ maxSamples: 1_000, maxDurationMs: 60_000 })
    root = createRoot(document.getElementById('root')!)
    root.render(<WorkspaceFixture />)
  },
  check(expected: ExpectedState) {
    const state = useOrderStore.getState()
    return state.status === 'ready'
      && state.orderDisplayIds.length === Object.keys(expected).length
      && Object.keys(state.ordersById).length === Object.keys(expected).length
      && new Set(state.orderDisplayIds).size === state.orderDisplayIds.length
      && Object.entries(expected).every(([id, value]) => {
        const actual = state.ordersById[id]
        return actual?.version === value.version
          && actual.meatStepStatusCode === value.meat
          && actual.stapleStepStatusCode === value.staple
          && (actual.completedAt !== null) === value.served
      })
  },
  probe() {
    const diagnostics = readDiagnostics()
    return {
      status: useOrderStore.getState().status,
      online: diagnostics?.state === 'online',
      reconciliations: diagnostics?.snapshotReconciliation.count ?? 0,
      failedReconciliations: diagnostics?.snapshotReconciliation.failureCount ?? 0,
      mutationPending: orderOptimistic.hasPending('initial'), mutationFailed,
      decodedEnvelopes: getPerformanceRecordingSnapshot()?.samples.filter((sample) => sample.stage === 'realtime_decode').length ?? 0,
      storageIsolated: localStorage.getItem('synthetic-client-marker') === clientMarker,
    }
  },
  network(online: boolean) { window.dispatchEvent(new Event(online ? 'online' : 'offline')) },
  switchWorkspace() { setWorkspace('synthetic-workspace-b') },
  stop() {
    root?.unmount()
    root = null
    readDiagnostics = () => null
    const recording = stopPerformanceRecording()
    localStorage.clear()
    performance.clearResourceTimings()
    return recording
  },
}

declare global { interface Window { workspaceFixture: typeof fixture } }
window.workspaceFixture = fixture
