import {
  ApiError,
  ensureFreshAuthTokens,
  getApiBaseUrl,
  refreshAuthTokens,
} from './apiClient'
import type {
  OrderDTO,
  OrderDeletedEvent,
  OrdersClearedEvent,
} from './apiTypes'
import { orderDtoToOrderRecord } from './orderRecordMapper'

type SubscriptionStatus =
  | 'SUBSCRIBED'
  | 'TIMED_OUT'
  | 'CLOSED'
  | 'CHANNEL_ERROR'

type OrderUpsertEvent = {
  item: OrderDTO
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

const parseApiError = (status: number, payload: string): ApiError => {
  if (payload.trim() === '') {
    return new ApiError(status, `http_${status}`, `Request failed with status ${status}.`)
  }

  try {
    const parsed = JSON.parse(payload) as {
      error?: {
        code?: string
        message?: string
      }
    }

    return new ApiError(
      status,
      parsed.error?.code?.trim() || `http_${status}`,
      parsed.error?.message?.trim() ||
        payload.trim() ||
        `Request failed with status ${status}.`,
    )
  } catch {
    return new ApiError(
      status,
      `http_${status}`,
      payload.trim() || `Request failed with status ${status}.`,
    )
  }
}

const parseEventBlock = (
  block: string,
): {
  eventType: string
  payload: unknown
} | null => {
  const lines = block
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line !== '')

  if (lines.length === 0) {
    return null
  }

  let eventType = 'message'
  const dataLines: string[] = []

  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventType = line.slice('event:'.length).trim()
      continue
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim())
    }
  }

  if (dataLines.length === 0) {
    return null
  }

  const payloadText = dataLines.join('\n')

  try {
    return {
      eventType,
      payload: JSON.parse(payloadText),
    }
  } catch {
    return {
      eventType,
      payload: payloadText,
    }
  }
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
    const clearedCount = (payload as OrdersClearedEvent | null)?.clearedCount

    if (typeof clearedCount === 'number') {
      options.onClear?.(clearedCount)
    }
  }
}

const readEventStream = async (
  response: Response,
  signal: AbortSignal,
  options: WorkspaceOrderRealtimeOptions,
) => {
  if (!response.body) {
    throw new Error('SSE response body is missing.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (!signal.aborted) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })

    while (true) {
      const separatorIndex = buffer.search(/\r?\n\r?\n/)

      if (separatorIndex === -1) {
        break
      }

      const block = buffer.slice(0, separatorIndex)
      const separatorMatch = buffer.match(/\r?\n\r?\n/)
      const separatorLength = separatorMatch?.[0].length ?? 2
      buffer = buffer.slice(separatorIndex + separatorLength)

      const parsed = parseEventBlock(block)

      if (parsed) {
        dispatchEvent(parsed.eventType, parsed.payload, options)
      }
    }
  }
}

const openEventStream = async (
  options: WorkspaceOrderRealtimeOptions,
  signal: AbortSignal,
  allowRefreshRetry: boolean,
) => {
  const accessToken = (await ensureFreshAuthTokens())?.accessToken

  if (!accessToken) {
    throw new ApiError(401, 'unauthorized', 'Not authenticated.')
  }

  const response = await fetch(`${getApiBaseUrl()}/api/events`, {
    headers: {
      Accept: 'text/event-stream',
      Authorization: `Bearer ${accessToken}`,
      'Cache-Control': 'no-cache',
    },
    signal,
  })

  if (!response.ok) {
    const apiError = parseApiError(response.status, await response.text())

    if (
      allowRefreshRetry &&
      apiError.status === 401 &&
      apiError.code === 'token_expired'
    ) {
      await refreshAuthTokens()
      return openEventStream(options, signal, false)
    }

    throw apiError
  }

  options.onSubscriptionStatus?.('SUBSCRIBED')
  await readEventStream(response, signal, options)
}

export const orderRealtime = {
  subscribeToWorkspaceOrders(
    options: WorkspaceOrderRealtimeOptions,
  ): OrderRealtimeSubscription {
    const controller = new AbortController()

    void openEventStream(options, controller.signal, true)
      .then(() => {
        if (!controller.signal.aborted) {
          options.onSubscriptionStatus?.('TIMED_OUT')
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return
        }

        if (
          error instanceof ApiError &&
          error.status === 401 &&
          error.code === 'token_expired'
        ) {
          options.onSubscriptionStatus?.('TIMED_OUT')
          return
        }

        options.onSubscriptionStatus?.('CHANNEL_ERROR')
      })

    return {
      close: () => {
        controller.abort()
        options.onSubscriptionStatus?.('CLOSED')
      },
    }
  },

  async unsubscribe(subscription: OrderRealtimeSubscription) {
    subscription.close()
  },
}
