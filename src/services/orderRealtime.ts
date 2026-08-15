import { ApiError, ensureFreshAuthTokens, getApiBaseUrl } from './apiClient'
import type {
  ClearWorkspaceMode,
  OrderDTO,
  OrderDeletedEvent,
  OrdersClearedEvent,
  RealtimeSessionResponse,
} from './apiTypes'
import { orderDtoToOrderRecord } from './orderRecordMapper'
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

export type OrderRealtimeSubscription = {
  close: () => void
}

// The session ticket request and the WS 'ready' handshake must complete
// within these windows; a hung request would otherwise stall recovery
// forever.
export const SESSION_TIMEOUT_MS = 5_000
export const READY_TIMEOUT_MS = 8_000

// A connection is only considered stable after staying online for this long;
// only then is the failure counter reset. Resetting on 'ready' would turn a
// flapping connection into a fixed high-frequency reconnect loop.
export const STABLE_CONNECTION_MS = 30_000

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

    if (typeof clearedCount === 'number') {
      options.onClear?.({
        clearedCount,
        mode: normalizeClearMode(clearedEvent?.mode),
      })
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

    const connect = async () => {
      if (isClosed()) {
        return
      }

      state = 'connecting'
      clearReconnectTimer()
      clearReadyTimer()

      const currentGeneration = ++generation

      try {
        const tokens = await ensureFreshAuthTokens()

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
        startReadyTimer(nextSocket, currentGeneration)

        nextSocket.onmessage = (event) => {
          if (isClosed() || currentGeneration !== generation) {
            return
          }

          const parsed = parseRealtimeEnvelope(event.data)
          if (!parsed) {
            return
          }

          if (parsed.eventType === 'ready') {
            clearReadyTimer()

            if (state !== 'online') {
              state = 'online'
              options.onSubscriptionStatus?.('SUBSCRIBED')
              startStableConnectionTimer()
            }

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

    void connect()

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
        sessionAbortController?.abort()
        sessionAbortController = null
        closeSocket(1000, 'client_closed')
        options.onSubscriptionStatus?.('CLOSED')
      },
    }
  },

  async unsubscribe(subscription: OrderRealtimeSubscription) {
    subscription.close()
  },
}
