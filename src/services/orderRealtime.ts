import { ApiError, ensureFreshAuthTokens, getApiBaseUrl } from './apiClient'
import type {
  OrderDTO,
  OrderDeletedEvent,
  OrdersClearedEvent,
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
  onClear?: (clearedCount: number) => void
  onRemove: (id: string) => void
  onSubscriptionStatus?: (status: SubscriptionStatus) => void
  onUpsert: (order: ReturnType<typeof orderDtoToOrderRecord>) => void
}

export type OrderRealtimeSubscription = {
  close: () => void
}

const INITIAL_RECONNECT_DELAY_MS = 1_000
const MAX_INITIAL_RECONNECT_ATTEMPTS = 3
const MAX_RECONNECT_DELAY_MS = 10_000

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
    const clearedCount = (payload as OrdersClearedEvent | null)?.clearedCount

    if (typeof clearedCount === 'number') {
      options.onClear?.(clearedCount)
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

const getReconnectDelayMs = (attempt: number): number =>
  Math.min(
    INITIAL_RECONNECT_DELAY_MS * 2 ** Math.max(attempt - 1, 0),
    MAX_RECONNECT_DELAY_MS,
  )

export const orderRealtime = {
  subscribeToWorkspaceOrders(
    options: WorkspaceOrderRealtimeOptions,
  ): OrderRealtimeSubscription {
    let socket: WebSocket | null = null
    let reconnectTimer: number | null = null
    let reconnectAttempts = 0
    let generation = 0
    let closedByUser = false
    let hasEverSubscribed = false

    const clearReconnectTimer = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
    }

    const scheduleReconnect = () => {
      if (closedByUser) {
        return
      }

      reconnectAttempts += 1

      if (
        !hasEverSubscribed &&
        reconnectAttempts > MAX_INITIAL_RECONNECT_ATTEMPTS
      ) {
        options.onSubscriptionStatus?.('CHANNEL_ERROR')
        return
      }

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
      clearReconnectTimer()

      const currentGeneration = ++generation

      try {
        if (!(await ensureFreshAuthTokens())?.accessToken) {
          throw new ApiError(401, 'unauthorized', 'Not authenticated.')
        }

        const session = await realtimeSession.create()
        if (closedByUser || currentGeneration !== generation) {
          return
        }

        const nextSocket = new WebSocket(buildWebSocketUrl(session.ticket))
        socket = nextSocket

        nextSocket.onmessage = (event) => {
          if (closedByUser || currentGeneration !== generation) {
            return
          }

          const parsed = parseRealtimeEnvelope(event.data)
          if (!parsed) {
            return
          }

          if (parsed.eventType === 'ready') {
            reconnectAttempts = 0
            hasEverSubscribed = true
            options.onSubscriptionStatus?.('SUBSCRIBED')
            return
          }

          dispatchEvent(parsed.eventType, parsed.payload, options)
        }

        nextSocket.onerror = () => {
          // The browser will follow with an onclose event.
        }

        nextSocket.onclose = () => {
          if (socket === nextSocket) {
            socket = null
          }

          if (closedByUser || currentGeneration !== generation) {
            return
          }

          scheduleReconnect()
        }
      } catch (error) {
        if (closedByUser || currentGeneration !== generation) {
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

        scheduleReconnect()
      }
    }

    void connect()

    return {
      close: () => {
        closedByUser = true
        generation += 1
        clearReconnectTimer()
        closeSocket(1000, 'client_closed')
        options.onSubscriptionStatus?.('CLOSED')
      },
    }
  },

  async unsubscribe(subscription: OrderRealtimeSubscription) {
    subscription.close()
  },
}
