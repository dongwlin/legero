import type {
  RealtimeConnectionState,
  RealtimeFailureStage,
  RealtimeNetworkType,
} from '@/services/realtimeDiagnostics'

const CONNECTION_STATE_LABELS: Record<RealtimeConnectionState, string> = {
  idle: '未开始',
  connecting: '正在连接',
  online: '在线',
  reconnecting: '正在重连',
  failed: '连接失败',
  closed: '已关闭',
}

const FAILURE_STAGE_LABELS: Record<RealtimeFailureStage, string> = {
  auth: '身份认证',
  session: '会话创建',
  ws: 'WebSocket',
  ready: '握手确认',
  stale: '连接失活',
}

const RECONNECT_REASON_LABELS: Record<string, string> = {
  timer: '定时重试',
  close: '连接关闭',
  ws_timeout: 'WebSocket 连接超时',
  ready_timeout: '握手确认超时',
  stale: '连接失活',
  network_recovery: '网络恢复',
  foreground_recovery: '回到前台',
  initial: '初次连接',
  unknown: '未知原因',
  redacted: '详细原因已隐藏',
}

const STATE_CHANGE_REASON_LABELS: Record<string, string> = {
  unknown: '未知原因',
  connect_started: '开始建立连接',
  reconnect_scheduled: '已安排重连',
  network_offline: '网络断开',
  environment_unavailable: '网络或应用状态暂不可用',
  ready_received: '收到握手确认',
  client_closed: '客户端关闭连接',
  auth_failed: '身份认证失败',
  channel_error: '实时通道异常',
  redacted: '详细原因已隐藏',
}

const NETWORK_TYPE_LABELS: Record<RealtimeNetworkType, string> = {
  wifi: 'Wi-Fi',
  cellular: '移动网络',
  none: '无网络',
  unknown: '未知网络',
}

const CLOSE_REASON_LABELS: Record<string, string> = {
  client_closed: '客户端关闭',
  network_offline: '网络断开',
  network_recovery: '网络恢复',
  foreground_recovery: '回到前台后恢复',
  server_activity_timeout: '服务端活动超时',
  ws_timeout: 'WebSocket 连接超时',
  ready_timeout: '握手确认超时',
  server_restart: '服务端重启',
  server_shutdown: '服务端关闭',
  normal_closure: '正常关闭',
  going_away: '对端离开',
  abnormal_closure: '异常关闭',
  protocol_error: '协议错误',
  policy_violation: '策略限制',
  session_expired: '会话过期',
  redacted: '详细原因已隐藏',
}

const trimTrailingZero = (value: string): string =>
  value.replace(/\.0$/, '')

export const formatDuration = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) {
    return '—'
  }

  if (value < 1000) {
    return `${Math.round(value)} ms`
  }

  if (value < 60_000) {
    return `${trimTrailingZero((value / 1000).toFixed(1))} s`
  }

  return `${trimTrailingZero((value / 60_000).toFixed(1))} min`
}

export const formatActivityGap = (
  value: number | null | undefined,
): string => {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) {
    return '—'
  }

  if (value < 1000) {
    return '刚刚'
  }

  if (value < 60_000) {
    return `${trimTrailingZero((value / 1000).toFixed(1))} 秒`
  }

  return `${trimTrailingZero((value / 60_000).toFixed(1))} 分钟`
}

const timestampFormatter = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'Asia/Shanghai',
})

export const formatTimestamp = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—'
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : timestampFormatter.format(date)
}

export const connectionStateLabel = (
  state: RealtimeConnectionState,
): string => CONNECTION_STATE_LABELS[state] ?? '未知状态'

export const failureStageLabel = (
  stage: RealtimeFailureStage | null | undefined,
): string => (stage ? FAILURE_STAGE_LABELS[stage] ?? '未知阶段' : '—')

export const reconnectReasonLabel = (
  reason: string | null | undefined,
): string => {
  if (!reason) {
    return '—'
  }

  return RECONNECT_REASON_LABELS[reason] ?? '其他原因'
}

export const stateChangeReasonLabel = (reason: string | null | undefined): string => {
  if (!reason) {
    return '未知原因'
  }

  return STATE_CHANGE_REASON_LABELS[reason] ?? '状态更新'
}

export const networkTypeLabel = (
  networkType: RealtimeNetworkType | null | undefined,
): string => (networkType ? NETWORK_TYPE_LABELS[networkType] ?? '未知网络' : '—')

export const networkOnlineLabel = (
  online: boolean | null | undefined,
): string => {
  if (online === true) {
    return '在线'
  }

  if (online === false) {
    return '离线'
  }

  return '未知'
}

export const appBackgroundedLabel = (
  backgrounded: boolean | null | undefined,
): string => {
  if (backgrounded === true) {
    return '后台'
  }

  if (backgrounded === false) {
    return '前台'
  }

  return '未知'
}

export const closeCodeLabel = (code: number | null | undefined): string =>
  code === null || code === undefined ? '—' : String(code)

export const closeReasonLabel = (reason: string | null | undefined): string => {
  if (!reason) {
    return '—'
  }

  return CLOSE_REASON_LABELS[reason] ?? '其他原因'
}
