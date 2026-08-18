import {
  AUTH_REFRESH_TIMEOUT_MS,
  ApiError,
  ensureFreshAuthTokens,
  getApiBaseUrl,
} from './apiClient'
import type {
  ClearWorkspaceMode,
  OrderDTO,
  OrderDeletedEvent,
  OrdersClearedEvent,
  RealtimeSessionResponse,
} from './apiTypes'
import { orderDtoToOrderRecord } from './orderRecordMapper'
import { startRealtimeRecoverySignals } from './realtimeRecovery'
import type { RealtimeRecoveryHandlers } from './realtimeRecovery'
import {
  createRealtimeDiagnostics,
  type RealtimeConnectionState,
  type RealtimeDiagnostics,
  type RealtimeDiagnosticsSnapshot,
  type RealtimeFailureStage,
} from './realtimeDiagnostics'
import { realtimeSession } from './realtimeSession'

type SubscriptionStatus =
  | 'SUBSCRIBED'
  | 'TIMED_OUT'
  | 'CLOSED'
  | 'CHANNEL_ERROR'

type OrderUpsertEvent = {
  item: OrderDTO
}

type RealtimeEnvelope = {
  type?: unknown
  data?: unknown
}

type WorkspaceOrderRealtimeOptions = {
  diagnostics?: RealtimeDiagnostics
  onClear?: (event: OrdersClearedEvent) => void
  onRemove: (id: string) => void
  onSubscriptionStatus?: (status: SubscriptionStatus) => void
  onUpsert: (order: ReturnType<typeof orderDtoToOrderRecord>) => void
  onUpsertMany?: (orders: ReturnType<typeof orderDtoToOrderRecord>[]) => void
}

// Connection lifecycle. The realtime channel is meant to run for as long as
// the user is signed in: transient failures (network loss, server restart,
// weak signal) move the machine back to reconnecting and keep retrying, and
// explicit close() reaches 'closed', while definitive auth/authorization
// failures reach the terminal 'failed' state and wait for the caller to close.
export type RealtimeState = RealtimeConnectionState

type ReconnectReason =
  | 'initial'
  | 'timer'
  | 'close'
  | 'ready_timeout'
  | 'stale'
  | 'network_recovery'
  | 'foreground_recovery'

type RealtimeAttemptPhase =
  | 'auth'
  | 'session'
  | 'ws'
  | 'ready'
  | 'online'

const normalizeClearMode = (mode: unknown): ClearWorkspaceMode =>
  mode === 'before_today' ? 'before_today' : 'all'

// The server executes a before_today clear against its own business day and
// carries that authoritative cutoff (YYYY-MM-DD) in the payload; anything
// that does not look like a date key is treated as absent, and the consumer
// then falls back to its receipt-time key as a best-effort approximation.
const normalizeClearDateKey = (value: unknown): string | undefined =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : undefined

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

type OrderDTOFieldValidator = (value: unknown) => boolean

const isString = (value: unknown): value is string => typeof value === 'string'

const isNonEmptyString = (value: unknown): value is string =>
  isString(value) && value.trim() !== ''

const isSafeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value)

const isPositiveSafeInteger = (value: unknown): value is number =>
  isSafeInteger(value) && value > 0

const isNullableSafeInteger = (value: unknown): value is number | null =>
  value === null || isSafeInteger(value)

const isSafeIntegerArray = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every(isSafeInteger)

const isNullableString = (value: unknown): value is string | null =>
  value === null || isString(value)

// Keep this validator map exhaustive against OrderDTO: adding a required DTO
// field is a compile-time error until its runtime rule is declared here too.
// Batch payloads are untrusted WebSocket data, so the typed mapper only sees a
// structurally complete DTO. Integer fields mirror the backend's Go integer
// types; version is additionally required to be a safe positive integer.
const ORDER_DTO_FIELD_VALIDATORS = {
  id: isNonEmptyString,
  version: isPositiveSafeInteger,
  displayNo: isNonEmptyString,
  stapleTypeCode: isNullableSafeInteger,
  sizeCode: isSafeInteger,
  customSizePriceCents: isNullableSafeInteger,
  stapleAmountCode: isSafeInteger,
  extraStapleUnits: isSafeInteger,
  friedEggCount: isSafeInteger,
  tofuSkewerCount: isSafeInteger,
  selectedMeatCodes: isSafeIntegerArray,
  greensCode: isSafeInteger,
  scallionCode: isSafeInteger,
  pepperCode: isSafeInteger,
  diningMethodCode: isSafeInteger,
  packagingCode: isNullableSafeInteger,
  packagingMethodCode: isNullableSafeInteger,
  totalPriceCents: isSafeInteger,
  stapleStepStatusCode: isSafeInteger,
  meatStepStatusCode: isSafeInteger,
  note: isString,
  createdAt: isNonEmptyString,
  updatedAt: isNonEmptyString,
  completedAt: isNullableString,
} satisfies { [Field in keyof OrderDTO]: OrderDTOFieldValidator }

const ORDER_DTO_FIELD_VALIDATOR_ENTRIES = Object.entries(
  ORDER_DTO_FIELD_VALIDATORS,
) as [keyof OrderDTO, OrderDTOFieldValidator][]

const isValidOrderDTO = (value: unknown): value is OrderDTO =>
  isObjectRecord(value) &&
  ORDER_DTO_FIELD_VALIDATOR_ENTRIES.every(([field, validate]) =>
    validate(value[field]),
  )

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new DOMException('Aborted', 'AbortError'))
    }, timeoutMs)

    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timer)
        reject(error)
      },
    )
  })

export type OrderRealtimeSubscription = {
  close: () => void
  getDiagnostics: () => RealtimeDiagnosticsSnapshot
}

// The session ticket request and the WS 'ready' handshake must complete
// within these windows; a hung request would otherwise stall recovery
// forever.
export const SESSION_TIMEOUT_MS = 5_000
export const READY_TIMEOUT_MS = 8_000

// ensureFreshAuthTokens() is single-flight, but apiClient now bounds its own
// refresh fetch with AUTH_REFRESH_TIMEOUT_MS and releases the single-flight
// slot on abort, so the next attempt starts a genuinely fresh refresh. The
// wrapper here is defense-in-depth: even if that bound is ever regressed, a
// hung refresh must not pin the channel in 'connecting' forever — the state
// machine moves on and retries.

// A connection is only considered stable after staying online for this long;
// only then is the failure counter reset. Resetting on 'ready' would turn a
// flapping connection into a fixed high-frequency reconnect loop.
export const STABLE_CONNECTION_MS = 30_000

// A socket that stays 'online' through a background session of at least this
// length is presumed stale on return to the foreground (mobile OSes routinely
// freeze or tear down background connections) and is rebuilt immediately.
export const BACKGROUND_STALE_MS = 30_000

// Application-level server activity is the health signal for an online
// socket. The watchdog is enabled only after the server explicitly negotiates
// its heartbeat capability and interval in the ready payload. Its timeout is
// two heartbeat intervals plus a small tolerance. Keep the default export for
// callers/tests that need the timeout corresponding to the backend's default
// 20s heartbeat interval.
export const HEARTBEAT_CAPABILITY = 'heartbeat'
// Clients must opt into the compact batch event through the WebSocket query
// string. The server advertises this capability in `ready`, but the
// advertisement alone does not enable batch delivery.
export const ORDER_UPSERT_MANY_CAPABILITY = 'order.upsert_many'
export const DEFAULT_HEARTBEAT_INTERVAL_MS = 20_000
export const SERVER_ACTIVITY_TOLERANCE_MS = 5_000
// Browsers clamp setTimeout delays above this signed 32-bit limit to a short
// delay. Reject negotiated values whose derived watchdog timeout would exceed
// it rather than accidentally spinning a reconnect loop.
export const MAX_SERVER_ACTIVITY_TIMEOUT_MS = 2_147_483_647
export const getServerActivityTimeoutMs = (heartbeatIntervalMs: number): number =>
  heartbeatIntervalMs * 2 + SERVER_ACTIVITY_TOLERANCE_MS
export const SERVER_ACTIVITY_TIMEOUT_MS = getServerActivityTimeoutMs(
  DEFAULT_HEARTBEAT_INTERVAL_MS,
)

export const INITIAL_RECONNECT_DELAY_MS = 1_000
export const MAX_RECONNECT_DELAY_MS = 30_000

// Exponential backoff with full jitter: after failureCount consecutive
// failures the delay is uniform in [0, min(cap, base * 2^(failureCount-1))).
export const getReconnectDelayMs = (failureCount: number): number => {
  const ceiling = Math.min(
    MAX_RECONNECT_DELAY_MS,
    INITIAL_RECONNECT_DELAY_MS * 2 ** Math.max(failureCount - 1, 0),
  )

  return Math.floor(Math.random() * ceiling)
}

const dispatchEvent = (
  eventType: string,
  payload: unknown,
  options: WorkspaceOrderRealtimeOptions,
) => {
  if (eventType === 'order.upsert') {
    const item = (payload as OrderUpsertEvent | null)?.item

    // Keep the legacy branch permissive for older servers/tests that may
    // carry a partial object, while rejecting primitive/null malformed data
    // before the typed mapper is called.
    if (item !== null && typeof item === 'object') {
      options.onUpsert(orderDtoToOrderRecord(item))
    }

    return
  }

  if (eventType === ORDER_UPSERT_MANY_CAPABILITY) {
    const items = isObjectRecord(payload) ? payload.items : undefined

    if (!Array.isArray(items)) {
      return
    }

    const orders = items.filter(isValidOrderDTO).map(orderDtoToOrderRecord)

    if (orders.length === 0) {
      return
    }

    // Keep a compatibility fallback for consumers that only implement the
    // legacy callback. The workspace hook supplies onUpsertMany so the whole
    // envelope enters its rAF queue in one callback.
    if (options.onUpsertMany) {
      options.onUpsertMany(orders)
    } else {
      for (const order of orders) {
        options.onUpsert(order)
      }
    }

    return
  }

  if (eventType === 'order.deleted') {
    const deletedId = (payload as OrderDeletedEvent | null)?.id

    if (deletedId) {
      options.onRemove(deletedId)
    }

    return
  }

  if (eventType === 'order.cleared') {
    const clearedEvent = payload as OrdersClearedEvent | null
    const clearedCount = clearedEvent?.clearedCount
    const clearDateKey = normalizeClearDateKey(clearedEvent?.clearDateKey)

    if (typeof clearedCount === 'number') {
      const clear: OrdersClearedEvent = {
        clearedCount,
        mode: normalizeClearMode(clearedEvent?.mode),
      }

      if (clearDateKey !== undefined) {
        clear.clearDateKey = clearDateKey
      }

      options.onClear?.(clear)
    }
  }
}

const parseRealtimeEnvelope = (
  value: unknown,
): {
  eventType: string
  payload: unknown
} | null => {
  if (typeof value !== 'string') {
    return null
  }

  try {
    const parsed = JSON.parse(value) as RealtimeEnvelope
    if (typeof parsed.type !== 'string' || parsed.type.trim() === '') {
      return null
    }

    return {
      eventType: parsed.type.trim(),
      payload: parsed.data,
    }
  } catch {
    return null
  }
}

type ReadyPayload = {
  capabilities?: unknown
  heartbeatIntervalMs?: unknown
}

// A legacy or partially upgraded server may still send a valid ready
// envelope without the heartbeat contract. In that case keep the socket
// usable, but do not arm a watchdog whose timeout cannot be justified.
const parseHeartbeatIntervalMs = (payload: unknown): number | null => {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return null
  }

  const ready = payload as ReadyPayload
  const capabilities = ready.capabilities
  const interval = ready.heartbeatIntervalMs

  if (
    !Array.isArray(capabilities) ||
    !capabilities.some((capability) => capability === HEARTBEAT_CAPABILITY) ||
    typeof interval !== 'number' ||
    !Number.isFinite(interval) ||
    interval <= 0
  ) {
    return null
  }

  const timeout = getServerActivityTimeoutMs(interval)
  return Number.isFinite(timeout) &&
    timeout > 0 &&
    timeout <= MAX_SERVER_ACTIVITY_TIMEOUT_MS
    ? interval
    : null
}

const buildWebSocketUrl = (ticket: string): string => {
  const url = new URL(getApiBaseUrl())
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/api/ws`
  url.search = ''
  url.hash = ''
  url.searchParams.set('ticket', ticket)
  url.searchParams.set('capabilities', ORDER_UPSERT_MANY_CAPABILITY)
  return url.toString()
}

export const orderRealtime = {
  subscribeToWorkspaceOrders(
    options: WorkspaceOrderRealtimeOptions,
  ): OrderRealtimeSubscription {
    const diagnostics = options.diagnostics ?? createRealtimeDiagnostics()
    let socket: WebSocket | null = null
    let reconnectTimer: number | null = null
    let pendingReconnectReason: ReconnectReason | null = null
    let reconnectAttempts = 0
    let generation = 0
    let activeAttempt: {
      generation: number
      phase: RealtimeAttemptPhase
    } | null = null
    let state: RealtimeState = 'idle'
    let stableConnectionTimer: number | null = null
    let sessionAbortController: AbortController | null = null
    let readyTimer: number | null = null
    let serverActivityTimer: number | null = null
    let lastServerActivityAt: number | null = null
    let serverActivityTimeoutMs: number | null = null
    let stopRecoverySignals: (() => void) | null = null
    let networkOnline = true
    let isBackgrounded = false
    let backgroundedWallClockAt: number | null = null
    let backgroundedMonotonicAt: number | null = null

    // The recovery signal source reports deviations (offline/background) on
    // startup; seed the diagnostics with the optimistic initial state so a
    // debug snapshot is never needlessly "unknown" while the source settles.
    diagnostics.recordNetworkStatus(networkOnline)
    diagnostics.recordAppState(isBackgrounded)

    const isClosed = (): boolean => state === 'closed'
    const isTerminalState = (): boolean =>
      state === 'closed' || state === 'failed'

    const transitionState = (nextState: RealtimeState, reason: string) => {
      if (state === nextState) {
        return
      }

      state = nextState
      diagnostics.transition(nextState, reason)
    }

    const setActiveAttemptPhase = (
      attemptGeneration: number,
      phase: RealtimeAttemptPhase,
    ) => {
      if (activeAttempt?.generation === attemptGeneration) {
        activeAttempt.phase = phase
      }
    }

    const clearActiveAttempt = (attemptGeneration?: number) => {
      if (
        attemptGeneration === undefined ||
        activeAttempt?.generation === attemptGeneration
      ) {
        activeAttempt = null
      }
    }

    const getActiveAttemptFailureStage = (): RealtimeFailureStage | null => {
      if (
        activeAttempt === null ||
        activeAttempt.generation !== generation
      ) {
        return null
      }

      switch (activeAttempt.phase) {
        case 'auth':
          return 'auth'
        case 'session':
          return 'session'
        case 'ready':
          return 'ready'
        case 'ws':
        case 'online':
        default:
          return 'ws'
      }
    }

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
    }

    const clearStableConnectionTimer = () => {
      if (stableConnectionTimer !== null) {
        window.clearTimeout(stableConnectionTimer)
        stableConnectionTimer = null
      }
    }

    const clearReadyTimer = () => {
      if (readyTimer !== null) {
        window.clearTimeout(readyTimer)
        readyTimer = null
      }
    }

    const clearServerActivityTimer = () => {
      if (serverActivityTimer !== null) {
        window.clearTimeout(serverActivityTimer)
        serverActivityTimer = null
      }
    }

    const resetServerActivity = () => {
      clearServerActivityTimer()
      lastServerActivityAt = null
      serverActivityTimeoutMs = null
    }

    const isServerActivityStale = (): boolean =>
      serverActivityTimeoutMs !== null &&
      lastServerActivityAt !== null &&
      performance.now() - lastServerActivityAt >= serverActivityTimeoutMs

    const startServerActivityTimer = (
      attemptSocket: WebSocket,
      attemptGeneration: number,
    ) => {
      clearServerActivityTimer()

      if (
        state !== 'online' ||
        isBackgrounded ||
        !networkOnline ||
        lastServerActivityAt === null ||
        serverActivityTimeoutMs === null
      ) {
        return
      }

      const elapsed = Math.max(0, performance.now() - lastServerActivityAt)
      const remaining = Math.max(0, serverActivityTimeoutMs - elapsed)

      serverActivityTimer = window.setTimeout(() => {
        serverActivityTimer = null

        if (
          isTerminalState() ||
          attemptGeneration !== generation ||
          socket !== attemptSocket ||
          state !== 'online' ||
          isBackgrounded ||
          !networkOnline
        ) {
          return
        }

        // A timer firing a little early or an activity event racing this
        // callback can make the nominal timeout appear premature. Re-arm from
        // the recorded activity instead of reconnecting before the full
        // window.
        if (!isServerActivityStale()) {
          startServerActivityTimer(attemptSocket, attemptGeneration)
          return
        }

        // Invalidate before connecting so late onclose/onmessage callbacks
        // from this socket cannot affect the fresh generation. connect() then
        // supplies the existing single-flight state-machine gate.
        diagnostics.recordFailure('stale')
        invalidateActiveSocket(1000, 'server_activity_timeout')
        void connect('stale')
      }, remaining)
    }

    const recordServerActivity = (
      attemptSocket: WebSocket,
      attemptGeneration: number,
    ) => {
      lastServerActivityAt = performance.now()

      if (state === 'online') {
        startServerActivityTimer(attemptSocket, attemptGeneration)
      }
    }

    const startStableConnectionTimer = () => {
      clearStableConnectionTimer()
      stableConnectionTimer = window.setTimeout(() => {
        stableConnectionTimer = null

        if (state === 'online') {
          reconnectAttempts = 0
        }
      }, STABLE_CONNECTION_MS)
    }

    const startReadyTimer = (
      attemptSocket: WebSocket,
      attemptGeneration: number,
    ) => {
      clearReadyTimer()
      readyTimer = window.setTimeout(() => {
        readyTimer = null

        if (
          isTerminalState() ||
          attemptGeneration !== generation ||
          socket !== attemptSocket
        ) {
          return
        }

        // The socket opened but never sent 'ready' within the window.
        // Invalidate this attempt first: a late 'ready' or message from the
        // closing socket must not move the state machine (in a real browser
        // close() -> onclose is asynchronous). Then close the socket and
        // fall through to the next reconnect ourselves, since onclose will
        // now be rejected by the generation guard.
        diagnostics.recordFailure('ready')
        diagnostics.finishConnectSession(false)
        const timedOutGeneration = generation
        generation += 1
        clearActiveAttempt(timedOutGeneration)
        closeSocket(1000, 'ready_timeout')
        scheduleReconnect('ready_timeout')
      }, READY_TIMEOUT_MS)
    }

    const scheduleReconnect = (reason: ReconnectReason) => {
      if (isTerminalState()) {
        return
      }

      transitionState('reconnecting', 'reconnect_scheduled')
      reconnectAttempts += 1
      pendingReconnectReason = reason
      clearStableConnectionTimer()
      clearReconnectTimer()
      resetServerActivity()

      // While offline or backgrounded, timer-based retries are paused: they
      // would burn battery on futile attempts. The recovery signals (network
      // online, app foreground) drive the next attempt instead.
      if (isBackgrounded || !networkOnline) {
        return
      }

      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null
        const reconnectReason = pendingReconnectReason ?? 'timer'
        pendingReconnectReason = null
        void connect(reconnectReason)
      }, getReconnectDelayMs(reconnectAttempts))
    }

    const closeSocket = (code?: number, reason?: string) => {
      if (!socket) {
        return
      }

      const activeSocket = socket
      socket = null

      if (
        activeSocket.readyState === WebSocket.OPEN ||
        activeSocket.readyState === WebSocket.CONNECTING
      ) {
        diagnostics.recordClose(code, reason)
        activeSocket.close(code, reason)
      }
    }

    // Abandon the current attempt (socket and/or in-flight session request):
    // bump the generation so late events from it are rejected, then tear down
    // whatever is live. Used when the environment changes underneath the
    // channel (network drop, network change, stale background socket).
    const invalidateActiveSocket = (code: number, reason: string) => {
      const invalidatedGeneration = generation
      generation += 1
      clearActiveAttempt(invalidatedGeneration)
      clearReadyTimer()
      resetServerActivity()
      diagnostics.finishConnectSession(false)
      closeSocket(code, reason)
      sessionAbortController?.abort()
      sessionAbortController = null
    }

    const handleNetworkOffline = () => {
      networkOnline = false
      diagnostics.recordNetworkStatus(false)

      if (isTerminalState()) {
        return
      }

      clearReconnectTimer()
      clearServerActivityTimer()

      if (state === 'online' || state === 'connecting') {
        // A possibly half-open socket or an in-flight attempt: tear it down
        // now instead of waiting for the OS to notice the dead interface.
        const failureStage =
          state === 'connecting' ? getActiveAttemptFailureStage() : 'ws'

        if (failureStage !== null) {
          diagnostics.recordFailure(failureStage)
        }
        invalidateActiveSocket(1000, 'network_offline')
        transitionState('reconnecting', 'network_offline')
      }
    }

    const handleNetworkOnline = () => {
      networkOnline = true
      diagnostics.recordNetworkStatus(true)

      if (isTerminalState() || isBackgrounded) {
        return
      }

      clearReconnectTimer()

      if (state === 'online') {
        // The network identity changed (e.g. Wi-Fi -> cellular) without an
        // offline event; the socket may be bound to a dead interface, so
        // rebuild it for a guaranteed-fresh server state.
        invalidateActiveSocket(1000, 'network_recovery')
        void connect('network_recovery')
        return
      }

      if (state === 'connecting') {
        // An attempt is already in flight; let it finish.
        return
      }

      // Break the backoff: a recovered network is a strong signal that the
      // previous failures were environmental, not server-side.
      reconnectAttempts = 0
      pendingReconnectReason = null
      void connect('network_recovery')
    }

    const handleAppBackground = () => {
      isBackgrounded = true
      diagnostics.recordAppState(true)
      backgroundedWallClockAt = Date.now()
      backgroundedMonotonicAt = performance.now()

      if (isTerminalState()) {
        return
      }

      // Pause timer-driven retries while backgrounded; recovery events resume
      // the state machine.
      clearReconnectTimer()
      // Keep the last activity timestamp while hidden, but do not judge the
      // socket until the app is usable again.
      clearServerActivityTimer()
    }

    const handleAppForeground = () => {
      isBackgrounded = false
      diagnostics.recordAppState(false)

      // Consume the background duration immediately: a later duplicate or
      // spurious foreground signal must not re-judge the socket against this
      // background's timestamp.
      const nowMonotonic = performance.now()
      const nowWallClock = Date.now()
      const backgroundWallClockAt = backgroundedWallClockAt
      const backgroundMonotonicAt = backgroundedMonotonicAt
      const backgroundDuration =
        backgroundWallClockAt !== null
          ? nowWallClock - backgroundWallClockAt
          : 0
      const monotonicBackgroundDuration =
        backgroundMonotonicAt !== null
          ? Math.max(0, nowMonotonic - backgroundMonotonicAt)
          : 0
      backgroundedWallClockAt = null
      backgroundedMonotonicAt = null

      if (isTerminalState() || !networkOnline) {
        return
      }

      clearReconnectTimer()

      const staleAfterBackground = backgroundDuration >= BACKGROUND_STALE_MS
      const invalidBackgroundDuration = backgroundDuration < 0

      if (state === 'online') {
        // A long background session is presumed to have torn down the socket;
        // rebuild it. This check intentionally precedes activity timeout: the
        // foreground recovery reason is more accurate for a long suspension
        // or a wall-clock rollback whose duration cannot be trusted.
        if (staleAfterBackground || invalidBackgroundDuration) {
          diagnostics.recordFailure('stale')
          invalidateActiveSocket(1000, 'foreground_recovery')
          void connect('foreground_recovery')
          return
        }

        // Pause the watchdog's budget while the app is hidden. Shifting the
        // activity timestamp by the monotonic hidden duration preserves the
        // remaining foreground budget. Clamp to now because a heartbeat
        // dispatched while backgrounded may already have refreshed the
        // timestamp; without the clamp this timestamp would incorrectly move
        // into the future.
        if (lastServerActivityAt !== null) {
          lastServerActivityAt = Math.min(
            nowMonotonic,
            lastServerActivityAt + monotonicBackgroundDuration,
          )
        }

        if (isServerActivityStale()) {
          diagnostics.recordFailure('stale')
          invalidateActiveSocket(1000, 'server_activity_timeout')
          void connect('stale')
        } else if (socket) {
          // The watchdog was paused while hidden. Resume it from the adjusted
          // server activity timestamp when the socket is retained.
          startServerActivityTimer(socket, generation)
        }
        return
      }

      if (state === 'connecting') {
        // An in-flight attempt that spanned a long background is presumed
        // stale: its auth refresh / session request / handshake may be hung
        // on a frozen network. Abandon it (generation bump + abort) and start
        // a fresh flow instead of trusting it to finish.
        if (staleAfterBackground || invalidBackgroundDuration) {
          diagnostics.recordFailure('stale')
          invalidateActiveSocket(1000, 'foreground_recovery')
          void connect('foreground_recovery')
        }
        return
      }

      reconnectAttempts = 0
      pendingReconnectReason = null
      void connect('foreground_recovery')
    }

    const connect = async (requestedReason: ReconnectReason) => {
      if (isTerminalState()) {
        return
      }

      // Starting a connection while offline or backgrounded would only burn
      // an auth/session request on a dead environment; the recovery signals
      // drive the attempt once it is usable again.
      if (isBackgrounded || !networkOnline) {
        transitionState('reconnecting', 'environment_unavailable')
        return
      }

      transitionState('connecting', 'connect_started')
      clearReconnectTimer()
      clearReadyTimer()
      resetServerActivity()

      const connectReason = requestedReason
      diagnostics.recordConnectionAttempt(connectReason)

      const currentGeneration = ++generation

      let attemptPhase: RealtimeAttemptPhase = 'auth'
      activeAttempt = { generation: currentGeneration, phase: attemptPhase }

      const updateAttemptPhase = (phase: RealtimeAttemptPhase) => {
        attemptPhase = phase
        setActiveAttemptPhase(currentGeneration, phase)
      }

      try {
        const tokens = await withTimeout(
          ensureFreshAuthTokens(),
          AUTH_REFRESH_TIMEOUT_MS,
        )

        // close() can land while the auth refresh is in flight: every await
        // boundary must re-check the generation before starting the next
        // async stage, or a closed subscription would still create a session.
        if (isTerminalState() || currentGeneration !== generation) {
          return
        }

        if (!tokens?.accessToken) {
          throw new ApiError(401, 'unauthorized', 'Not authenticated.')
        }

        updateAttemptPhase('session')
        const abortController = new AbortController()
        sessionAbortController = abortController
        const sessionTimeout = window.setTimeout(() => {
          abortController.abort()
        }, SESSION_TIMEOUT_MS)

        let session: RealtimeSessionResponse

        try {
          // The connection duration deliberately starts at the session
          // request, and ends at the first ready envelope. It excludes auth
          // refresh time while still covering the session and WS handshake.
          diagnostics.beginConnectSession()
          session = await realtimeSession.create(abortController.signal)
        } finally {
          window.clearTimeout(sessionTimeout)
          sessionAbortController = null
        }

        if (isTerminalState() || currentGeneration !== generation) {
          return
        }

        updateAttemptPhase('ws')
        const nextSocket = new WebSocket(buildWebSocketUrl(session.ticket))
        socket = nextSocket
        resetServerActivity()
        startReadyTimer(nextSocket, currentGeneration)

        nextSocket.onopen = () => {
          if (
            !isTerminalState() &&
            currentGeneration === generation &&
            socket === nextSocket
          ) {
            updateAttemptPhase('ready')
          }
        }

        nextSocket.onmessage = (event) => {
          if (
            isTerminalState() ||
            currentGeneration !== generation ||
            socket !== nextSocket
          ) {
            return
          }

          const parsed = parseRealtimeEnvelope(event.data)
          if (!parsed) {
            return
          }

          // Every valid server envelope is evidence that this socket can
          // still receive server data. This includes ready, heartbeat, known
          // business events, and future event types we do not dispatch yet.
          diagnostics.recordServerActivity(
            parsed.eventType === 'heartbeat' ? 'heartbeat' : 'envelope',
          )
          if (parsed.eventType === 'ready') {
            const heartbeatIntervalMs = parseHeartbeatIntervalMs(parsed.payload)
            serverActivityTimeoutMs =
              heartbeatIntervalMs === null
                ? null
                : getServerActivityTimeoutMs(heartbeatIntervalMs)
          }

          recordServerActivity(nextSocket, currentGeneration)

          if (parsed.eventType === 'ready') {
            updateAttemptPhase('online')
            diagnostics.finishConnectSession(true)
            clearReadyTimer()

            if (state !== 'online') {
              transitionState('online', 'ready_received')
              options.onSubscriptionStatus?.('SUBSCRIBED')
              startStableConnectionTimer()
            }

            // ready is the first point at which the connection is considered
            // online, so the activity timer is armed after the state change.
            startServerActivityTimer(nextSocket, currentGeneration)

            return
          }

          dispatchEvent(parsed.eventType, parsed.payload, options)
        }

        nextSocket.onerror = () => {
          if (
            isTerminalState() ||
            currentGeneration !== generation ||
            socket !== nextSocket
          ) {
            return
          }

          // The browser normally follows this with an onclose event, but
          // record the transport stage here as well so a shim or a delayed
          // close cannot hide the WebSocket failure.
          diagnostics.recordFailure(
            attemptPhase === 'ready' ? 'ready' : 'ws',
          )
        }

        nextSocket.onclose = (event) => {
          // Only the active socket may clear the ready timer: a stale onclose
          // from a previous attempt (close() -> onclose is asynchronous in a
          // real browser) must not cancel the new attempt's timer, or a
          // failing handshake would stall forever.
          if (
            isTerminalState() ||
            currentGeneration !== generation ||
            socket !== nextSocket
          ) {
            return
          }

          diagnostics.recordClose(event.code, event.reason)
          socket = null
          clearReadyTimer()
          resetServerActivity()
          diagnostics.finishConnectSession(false)
          clearActiveAttempt(currentGeneration)
          diagnostics.recordFailure(
            attemptPhase === 'ready' ? 'ready' : 'ws',
          )
          scheduleReconnect('close')
        }
      } catch (error) {
        if (isTerminalState() || currentGeneration !== generation) {
          return
        }

        diagnostics.finishConnectSession(false)
        diagnostics.recordFailure(attemptPhase)
        clearActiveAttempt(currentGeneration)

        if (error instanceof ApiError && error.status === 401) {
          transitionState('failed', 'auth_failed')
          options.onSubscriptionStatus?.('TIMED_OUT')
          return
        }

        if (error instanceof ApiError && error.status < 500) {
          transitionState('failed', 'channel_error')
          options.onSubscriptionStatus?.('CHANNEL_ERROR')
          return
        }

        // Network errors, aborts (session timeout), and 5xx are transient:
        // back off and retry instead of giving up.
        scheduleReconnect('timer')
      }
    }

    const recoveryHandlers: RealtimeRecoveryHandlers = {
      onNetworkOffline: handleNetworkOffline,
      onNetworkOnline: handleNetworkOnline,
      onNetworkType: diagnostics.recordNetworkType,
      onAppBackground: handleAppBackground,
      onAppForeground: handleAppForeground,
    }
    const recovery = startRealtimeRecoverySignals(recoveryHandlers)
    stopRecoverySignals = recovery.stop

    // The recovery initialization reports the initial network and lifecycle
    // state; on native that snapshot is read asynchronously (Capacitor plugin
    // calls), so the first connect must wait for it — otherwise a subscription
    // created while offline or backgrounded would still burn an auth/session
    // request before the gate is known. On web the snapshot is synchronous
    // and the ready promise is already resolved.
    void recovery.ready.then(() => void connect('initial'))

    return {
      close: () => {
        if (isClosed()) {
          return
        }

        transitionState('closed', 'client_closed')
        const closedGeneration = generation
        generation += 1
        clearActiveAttempt(closedGeneration)
        clearReconnectTimer()
        pendingReconnectReason = null
        clearStableConnectionTimer()
        clearReadyTimer()
        resetServerActivity()
        diagnostics.finishConnectSession(false)
        sessionAbortController?.abort()
        sessionAbortController = null
        closeSocket(1000, 'client_closed')
        stopRecoverySignals?.()
        stopRecoverySignals = null
        options.onSubscriptionStatus?.('CLOSED')
      },
      getDiagnostics: () => diagnostics.getSnapshot(),
    }
  },

  async unsubscribe(subscription: OrderRealtimeSubscription) {
    subscription.close()
  },
}
