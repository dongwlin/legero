/**
 * Low-cardinality diagnostics for a realtime subscription.
 *
 * This module deliberately contains no logger and never accepts arbitrary
 * payloads. It stores connection lifecycle facts and aggregate counters only;
 * callers can expose the snapshot to a debug screen without risking a token,
 * ticket, order, or phone number leak.
 */

export type RealtimeConnectionState =
  | 'idle'
  | 'connecting'
  | 'online'
  | 'reconnecting'
  | 'closed'

export type RealtimeFailureStage =
  | 'auth'
  | 'session'
  | 'ws'
  | 'ready'
  | 'stale'

export type RealtimeNetworkType = 'wifi' | 'cellular' | 'none' | 'unknown'

export type SnapshotReconciliationOutcome =
  | 'success'
  | 'failure'
  | 'cancelled'

export type RealtimeDiagnosticsClock = {
  now: () => number
}

export type RealtimeDiagnosticsOptions = {
  clock?: RealtimeDiagnosticsClock
  debug?: boolean
  maxStateChanges?: number
}

export type RealtimeStateChange = {
  at: number
  state: RealtimeConnectionState
  reason: string
}

export type RealtimeCloseSnapshot = {
  at: number
  code: number | null
  reason: string | null
}

export type RealtimeSnapshotReconciliationSnapshot = {
  count: number
  failureCount: number
  cancelledCount: number
  lastDurationMs: number | null
  lastFailureAt: number | null
}

export type RealtimeDiagnosticsSnapshot = {
  state: RealtimeConnectionState
  failureStage: RealtimeFailureStage | null
  /** Number of connect() gates that actually started, including the first. */
  connectionAttemptCount: number
  reconnectCount: number
  lastReconnectReason: string | null
  lastConnectDurationMs: number | null
  lastClose: RealtimeCloseSnapshot | null
  /** Convenience fields for consumers that only need the latest close data. */
  lastCloseCode: number | null
  lastCloseReason: string | null
  /** Duration from the first anomaly in an outage to the next online state. */
  lastRecoveryDurationMs: number | null
  recoveryCount: number
  heartbeatCount: number
  serverActivityCount: number
  lastServerActivityAt: number | null
  /** Gap at the time of this snapshot and gap measured before the last event. */
  currentServerActivityGapMs: number | null
  lastServerActivityGapMs: number | null
  /** Alias retained for compact debug consumers. */
  serverActivityGapMs: number | null
  staleCount: number
  networkOnline: boolean | null
  networkType: RealtimeNetworkType | null
  appBackgrounded: boolean | null
  snapshotReconciliation: RealtimeSnapshotReconciliationSnapshot
  /** Empty in a production build; bounded to the configured N in debug. */
  stateChanges: ReadonlyArray<RealtimeStateChange>
}

export type RealtimeDiagnostics = {
  transition: (
    state: RealtimeConnectionState,
    reason?: string,
  ) => void
  recordFailure: (stage: RealtimeFailureStage) => void
  recordConnectionAttempt: (reason?: string) => void
  beginConnectSession: () => void
  finishConnectSession: (success: boolean) => void
  recordClose: (code?: number | null, reason?: string | null) => void
  recordServerActivity: (kind: 'heartbeat' | 'envelope') => void
  recordNetworkStatus: (online: boolean) => void
  recordNetworkType: (networkType: RealtimeNetworkType) => void
  recordAppState: (backgrounded: boolean) => void
  beginSnapshotReconciliation: () => void
  finishSnapshotReconciliation: (outcome: SnapshotReconciliationOutcome) => void
  getSnapshot: () => RealtimeDiagnosticsSnapshot
  reset: () => void
}

const DEFAULT_MAX_STATE_CHANGES = 32

const SAFE_RECONNECT_REASONS = new Set([
  'timer',
  'close',
  'ready_timeout',
  'stale',
  'network_recovery',
  'foreground_recovery',
  'initial',
])

const monotonicNow = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }

  return Date.now()
}

const defaultDebug = (): boolean =>
  typeof import.meta !== 'undefined' && import.meta.env?.DEV === true

const asNonNegativeFinite = (value: number): number =>
  Number.isFinite(value) && value >= 0 ? value : 0

// Reasons are intentionally normalized to a small, non-sensitive shape. The
// realtime layer supplies fixed reason labels; this guard is defense-in-depth
// for future callers and rejects IDs, JSON, URLs, and arbitrary error text.
const normalizeReason = (reason: string | undefined): string => {
  if (!reason) {
    return 'unknown'
  }

  const normalized = reason.trim().toLowerCase().replace(/\s+/g, '_')

  if (
    normalized.length === 0 ||
    normalized.length > 64 ||
    !/^[a-z][a-z0-9_:-]*$/.test(normalized) ||
    /(?:token|ticket|bearer|authorization|password|phone|order|手机号|订单)/i.test(
      normalized,
    ) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      normalized,
    ) ||
    /^\d{7,}$/.test(normalized)
  ) {
    return 'redacted'
  }

  return normalized
}

export const normalizeRealtimeNetworkType = (
  value: unknown,
): RealtimeNetworkType =>
  value === 'wifi' || value === 'cellular' || value === 'none'
    ? value
    : 'unknown'

const SAFE_CLOSE_REASONS = new Set([
  'client_closed',
  'network_offline',
  'network_recovery',
  'foreground_recovery',
  'server_activity_timeout',
  'ready_timeout',
  'server_restart',
  'server_shutdown',
  'normal_closure',
  'going_away',
  'abnormal_closure',
  'protocol_error',
  'policy_violation',
  'session_expired',
])

const normalizeCloseReason = (reason: string | null | undefined): string | null => {
  if (typeof reason !== 'string' || reason.trim() === '') {
    return null
  }

  const normalized = normalizeReason(reason)
  return SAFE_CLOSE_REASONS.has(normalized) ? normalized : 'redacted'
}

const normalizeCloseCode = (code: number | null | undefined): number | null =>
  typeof code === 'number' && Number.isInteger(code) && code >= 0 && code <= 65_535
    ? code
    : null

const cloneSnapshot = (
  snapshot: RealtimeDiagnosticsSnapshot,
): RealtimeDiagnosticsSnapshot => ({
  ...snapshot,
  lastClose: snapshot.lastClose ? { ...snapshot.lastClose } : null,
  snapshotReconciliation: { ...snapshot.snapshotReconciliation },
  stateChanges: snapshot.stateChanges.map((change) => ({ ...change })),
})

export const createRealtimeDiagnostics = (
  options: RealtimeDiagnosticsOptions = {},
): RealtimeDiagnostics => {
  const clock = options.clock ?? { now: monotonicNow }
  const debug = options.debug ?? defaultDebug()
  const requestedMaxStateChanges = options.maxStateChanges
  const maxStateChanges =
    typeof requestedMaxStateChanges === 'number' &&
    Number.isFinite(requestedMaxStateChanges)
      ? Math.max(1, Math.floor(requestedMaxStateChanges))
      : DEFAULT_MAX_STATE_CHANGES

  let state: RealtimeConnectionState = 'idle'
  let failureStage: RealtimeFailureStage | null = null
  let connectionAttemptCount = 0
  let reconnectCount = 0
  let lastReconnectReason: string | null = null
  let connectStartedAt: number | null = null
  let lastConnectDurationMs: number | null = null
  let lastClose: RealtimeCloseSnapshot | null = null
  let lastRecoveryDurationMs: number | null = null
  let recoveryCount = 0
  let heartbeatCount = 0
  let serverActivityCount = 0
  let lastServerActivityAt: number | null = null
  let lastServerActivityGapMs: number | null = null
  let staleCount = 0
  let networkOnline: boolean | null = null
  let networkType: RealtimeNetworkType | null = null
  let appBackgrounded: boolean | null = null
  let anomalyStartedAt: number | null = null
  let snapshotReconciliationStartedAt: number | null = null
  let snapshotReconciliation: RealtimeSnapshotReconciliationSnapshot = {
    count: 0,
    failureCount: 0,
    cancelledCount: 0,
    lastDurationMs: null,
    lastFailureAt: null,
  }
  let stateChanges: RealtimeStateChange[] = []

  const now = (): number => asNonNegativeFinite(clock.now())

  const transition = (
    nextState: RealtimeConnectionState,
    reason?: string,
  ): void => {
    if (nextState === state) {
      return
    }

    state = nextState

    if (debug) {
      stateChanges.push({
        at: now(),
        state: nextState,
        reason: normalizeReason(reason),
      })

      if (stateChanges.length > maxStateChanges) {
        stateChanges = stateChanges.slice(-maxStateChanges)
      }
    }

    if (nextState === 'online' && anomalyStartedAt !== null) {
      lastRecoveryDurationMs = Math.max(0, now() - anomalyStartedAt)
      recoveryCount += 1
      anomalyStartedAt = null
    }
  }

  const recordFailure = (stage: RealtimeFailureStage): void => {
    failureStage = stage
    if (stage === 'stale') {
      staleCount += 1
    }

    if (anomalyStartedAt === null) {
      anomalyStartedAt = now()
    }
  }

  const recordConnectionAttempt = (reason = 'initial'): void => {
    connectionAttemptCount += 1

    if (connectionAttemptCount > 1) {
      reconnectCount += 1
      const normalizedReason = normalizeReason(reason)
      lastReconnectReason = SAFE_RECONNECT_REASONS.has(normalizedReason)
        ? normalizedReason
        : 'redacted'
    }
  }

  const beginConnectSession = (): void => {
    connectStartedAt = now()
  }

  const finishConnectSession = (success: boolean): void => {
    const startedAt = connectStartedAt
    connectStartedAt = null

    if (!success || startedAt === null) {
      return
    }

    lastConnectDurationMs = Math.max(0, now() - startedAt)
  }

  const recordClose = (
    code?: number | null,
    reason?: string | null,
  ): void => {
    // A synthetic close callback in a test/browser shim may not carry the
    // CloseEvent fields. Do not erase a more precise close captured before
    // invoking socket.close().
    if (code === undefined && reason === undefined) {
      return
    }

    lastClose = {
      at: now(),
      code: normalizeCloseCode(code),
      reason: normalizeCloseReason(reason),
    }
  }

  const recordServerActivity = (kind: 'heartbeat' | 'envelope'): void => {
    const activityAt = now()

    if (lastServerActivityAt !== null) {
      lastServerActivityGapMs = Math.max(0, activityAt - lastServerActivityAt)
    }

    serverActivityCount += 1
    lastServerActivityAt = activityAt

    if (kind === 'heartbeat') {
      heartbeatCount += 1
    }
  }

  const recordNetworkStatus = (online: boolean): void => {
    networkOnline = online
  }

  const recordNetworkType = (nextNetworkType: RealtimeNetworkType): void => {
    networkType = normalizeRealtimeNetworkType(nextNetworkType)
  }

  const recordAppState = (backgrounded: boolean): void => {
    appBackgrounded = backgrounded
  }

  const beginSnapshotReconciliation = (): void => {
    snapshotReconciliationStartedAt = now()
  }

  const finishSnapshotReconciliation = (
    outcome: SnapshotReconciliationOutcome,
  ): void => {
    const startedAt = snapshotReconciliationStartedAt
    snapshotReconciliationStartedAt = null

    if (startedAt === null) {
      return
    }

    const finishedAt = now()
    const durationMs = Math.max(0, finishedAt - startedAt)

    snapshotReconciliation = {
      count:
        snapshotReconciliation.count + (outcome === 'success' ? 1 : 0),
      failureCount:
        snapshotReconciliation.failureCount + (outcome === 'failure' ? 1 : 0),
      cancelledCount:
        snapshotReconciliation.cancelledCount +
        (outcome === 'cancelled' ? 1 : 0),
      lastDurationMs: durationMs,
      lastFailureAt:
        outcome === 'failure'
          ? finishedAt
          : snapshotReconciliation.lastFailureAt,
    }
  }

  const getSnapshot = (): RealtimeDiagnosticsSnapshot => {
    const close = lastClose ? { ...lastClose } : null
    const currentServerActivityGapMs =
      lastServerActivityAt === null
        ? null
        : Math.max(0, now() - lastServerActivityAt)

    return cloneSnapshot({
      state,
      failureStage,
      connectionAttemptCount,
      reconnectCount,
      lastReconnectReason,
      lastConnectDurationMs,
      lastClose: close,
      lastCloseCode: close?.code ?? null,
      lastCloseReason: close?.reason ?? null,
      lastRecoveryDurationMs,
      recoveryCount,
      heartbeatCount,
      serverActivityCount,
      lastServerActivityAt,
      currentServerActivityGapMs,
      lastServerActivityGapMs,
      serverActivityGapMs: currentServerActivityGapMs,
      staleCount,
      networkOnline,
      networkType,
      appBackgrounded,
      snapshotReconciliation: { ...snapshotReconciliation },
      stateChanges: debug ? stateChanges : [],
    })
  }

  const reset = (): void => {
    state = 'idle'
    failureStage = null
    connectionAttemptCount = 0
    reconnectCount = 0
    lastReconnectReason = null
    connectStartedAt = null
    lastConnectDurationMs = null
    lastClose = null
    lastRecoveryDurationMs = null
    recoveryCount = 0
    heartbeatCount = 0
    serverActivityCount = 0
    lastServerActivityAt = null
    lastServerActivityGapMs = null
    staleCount = 0
    networkOnline = null
    networkType = null
    appBackgrounded = null
    anomalyStartedAt = null
    snapshotReconciliationStartedAt = null
    snapshotReconciliation = {
      count: 0,
      failureCount: 0,
      cancelledCount: 0,
      lastDurationMs: null,
      lastFailureAt: null,
    }
    stateChanges = []
  }

  return {
    transition,
    recordFailure,
    recordConnectionAttempt,
    beginConnectSession,
    finishConnectSession,
    recordClose,
    recordServerActivity,
    recordNetworkStatus,
    recordNetworkType,
    recordAppState,
    beginSnapshotReconciliation,
    finishSnapshotReconciliation,
    getSnapshot,
    reset,
  }
}
