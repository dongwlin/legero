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
  onClear?: (event: OrdersClearedEvent) => void
  onRemove: (id: string) => void
  onSubscriptionStatus?: (status: SubscriptionStatus) => void
  onUpsert: (order: ReturnType<typeof orderDtoToOrderRecord>) => void
}

// Connection lifecycle. The realtime channel is meant to run for as long as
// the user is signed in: transient failures (network loss, server restart,
// weak signal) move the machine back to reconnecting and keep retrying, and
// only an explicit close() reaches the terminal 'closed' state.
type RealtimeState = 'idle' | 'connecting' | 'online' | 'reconnecting' | 'closed'

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

    if (item) {
      options.onUpsert(orderDtoToOrderRecord(item))
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
  return url.toString()
}

export const orderRealtime = {
  subscribeToWorkspaceOrders(
    options: WorkspaceOrderRealtimeOptions,
  ): OrderRealtimeSubscription {
    let socket: WebSocket | null = null
    let reconnectTimer: number | null = null
    let reconnectAttempts = 0
    let generation = 0
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

    const isClosed = (): boolean => state === 'closed'

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
          isClosed() ||
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
        invalidateActiveSocket(1000, 'server_activity_timeout')
        void connect()
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
          isClosed() ||
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
        generation += 1
        closeSocket(1000, 'ready_timeout')
        scheduleReconnect()
      }, READY_TIMEOUT_MS)
    }

    const scheduleReconnect = () => {
      if (isClosed()) {
        return
      }

      state = 'reconnecting'
      reconnectAttempts += 1
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
        void connect()
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
        activeSocket.close(code, reason)
      }
    }

    // Abandon the current attempt (socket and/or in-flight session request):
    // bump the generation so late events from it are rejected, then tear down
    // whatever is live. Used when the environment changes underneath the
    // channel (network drop, network change, stale background socket).
    const invalidateActiveSocket = (code: number, reason: string) => {
      generation += 1
      clearReadyTimer()
      resetServerActivity()
      closeSocket(code, reason)
      sessionAbortController?.abort()
      sessionAbortController = null
    }

    const handleNetworkOffline = () => {
      networkOnline = false

      if (isClosed()) {
        return
      }

      clearReconnectTimer()
      clearServerActivityTimer()

      if (state === 'online' || state === 'connecting') {
        // A possibly half-open socket or an in-flight attempt: tear it down
        // now instead of waiting for the OS to notice the dead interface.
        invalidateActiveSocket(1000, 'network_offline')
        state = 'reconnecting'
      }
    }

    const handleNetworkOnline = () => {
      networkOnline = true

      if (isClosed() || isBackgrounded) {
        return
      }

      clearReconnectTimer()

      if (state === 'online') {
        // The network identity changed (e.g. Wi-Fi -> cellular) without an
        // offline event; the socket may be bound to a dead interface, so
        // rebuild it for a guaranteed-fresh server state.
        invalidateActiveSocket(1000, 'network_recovery')
        void connect()
        return
      }

      if (state === 'connecting') {
        // An attempt is already in flight; let it finish.
        return
      }

      // Break the backoff: a recovered network is a strong signal that the
      // previous failures were environmental, not server-side.
      reconnectAttempts = 0
      void connect()
    }

    const handleAppBackground = () => {
      isBackgrounded = true
      backgroundedWallClockAt = Date.now()
      backgroundedMonotonicAt = performance.now()

      if (isClosed()) {
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

      if (isClosed() || !networkOnline) {
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
          invalidateActiveSocket(1000, 'foreground_recovery')
          void connect()
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
          invalidateActiveSocket(1000, 'server_activity_timeout')
          void connect()
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
          invalidateActiveSocket(1000, 'foreground_recovery')
          void connect()
        }
        return
      }

      reconnectAttempts = 0
      void connect()
    }

    const connect = async () => {
      if (isClosed()) {
        return
      }

      // Starting a connection while offline or backgrounded would only burn
      // an auth/session request on a dead environment; the recovery signals
      // drive the attempt once it is usable again.
      if (isBackgrounded || !networkOnline) {
        state = 'reconnecting'
        return
      }

      state = 'connecting'
      clearReconnectTimer()
      clearReadyTimer()
      resetServerActivity()

      const currentGeneration = ++generation

      try {
        const tokens = await withTimeout(
          ensureFreshAuthTokens(),
          AUTH_REFRESH_TIMEOUT_MS,
        )

        // close() can land while the auth refresh is in flight: every await
        // boundary must re-check the generation before starting the next
        // async stage, or a closed subscription would still create a session.
        if (isClosed() || currentGeneration !== generation) {
          return
        }

        if (!tokens?.accessToken) {
          throw new ApiError(401, 'unauthorized', 'Not authenticated.')
        }

        const abortController = new AbortController()
        sessionAbortController = abortController
        const sessionTimeout = window.setTimeout(() => {
          abortController.abort()
        }, SESSION_TIMEOUT_MS)

        let session: RealtimeSessionResponse

        try {
          session = await realtimeSession.create(abortController.signal)
        } finally {
          window.clearTimeout(sessionTimeout)
          sessionAbortController = null
        }

        if (isClosed() || currentGeneration !== generation) {
          return
        }

        const nextSocket = new WebSocket(buildWebSocketUrl(session.ticket))
        socket = nextSocket
        resetServerActivity()
        startReadyTimer(nextSocket, currentGeneration)

        nextSocket.onmessage = (event) => {
          if (isClosed() || currentGeneration !== generation) {
            return
          }

          const parsed = parseRealtimeEnvelope(event.data)
          if (!parsed) {
            return
          }

          // Every valid server envelope is evidence that this socket can
          // still receive server data. This includes ready, heartbeat, known
          // business events, and future event types we do not dispatch yet.
          if (parsed.eventType === 'ready') {
            const heartbeatIntervalMs = parseHeartbeatIntervalMs(parsed.payload)
            serverActivityTimeoutMs =
              heartbeatIntervalMs === null
                ? null
                : getServerActivityTimeoutMs(heartbeatIntervalMs)
          }

          recordServerActivity(nextSocket, currentGeneration)

          if (parsed.eventType === 'ready') {
            clearReadyTimer()

            if (state !== 'online') {
              state = 'online'
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
          // The browser will follow with an onclose event.
        }

        nextSocket.onclose = () => {
          // Only the active socket may clear the ready timer: a stale onclose
          // from a previous attempt (close() -> onclose is asynchronous in a
          // real browser) must not cancel the new attempt's timer, or a
          // failing handshake would stall forever.
          if (socket === nextSocket) {
            socket = null
            clearReadyTimer()
            resetServerActivity()
          }

          if (isClosed() || currentGeneration !== generation) {
            return
          }

          scheduleReconnect()
        }
      } catch (error) {
        if (isClosed() || currentGeneration !== generation) {
          return
        }

        if (error instanceof ApiError && error.status === 401) {
          options.onSubscriptionStatus?.('TIMED_OUT')
          return
        }

        if (error instanceof ApiError && error.status < 500) {
          options.onSubscriptionStatus?.('CHANNEL_ERROR')
          return
        }

        // Network errors, aborts (session timeout), and 5xx are transient:
        // back off and retry instead of giving up.
        scheduleReconnect()
      }
    }

    const recoveryHandlers: RealtimeRecoveryHandlers = {
      onNetworkOffline: handleNetworkOffline,
      onNetworkOnline: handleNetworkOnline,
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
    void recovery.ready.then(() => void connect())

    return {
      close: () => {
        if (isClosed()) {
          return
        }

        state = 'closed'
        generation += 1
        clearReconnectTimer()
        clearStableConnectionTimer()
        clearReadyTimer()
        resetServerActivity()
        sessionAbortController?.abort()
        sessionAbortController = null
        closeSocket(1000, 'client_closed')
        stopRecoverySignals?.()
        stopRecoverySignals = null
        options.onSubscriptionStatus?.('CLOSED')
      },
    }
  },

  async unsubscribe(subscription: OrderRealtimeSubscription) {
    subscription.close()
  },
}
