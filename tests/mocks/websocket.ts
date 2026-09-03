/**
 * Small controllable WebSocket implementation for the realtime client. The
 * application still executes its real realtime state machine; tests only
 * replace the browser transport and explicitly advance it through open,
 * ready, event, and close states.
 */
export class TestWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  static instances: TestWebSocket[] = []

  readonly url: string
  readyState = TestWebSocket.CONNECTING
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null

  constructor(url: string) {
    this.url = url
    TestWebSocket.instances.push(this)
  }

  close(code?: number, reason?: string) {
    this.readyState = TestWebSocket.CLOSED
    const event = new Event('close') as CloseEvent
    Object.defineProperties(event, {
      code: { value: code ?? 1000 },
      reason: { value: reason ?? '' },
    })
    this.onclose?.(event)
  }

  open() {
    this.readyState = TestWebSocket.OPEN
    this.onopen?.(new Event('open'))
  }

  emit(type: string, data?: unknown) {
    this.onmessage?.(
      new MessageEvent('message', {
        data: JSON.stringify({
          type,
          data:
            type === 'ready' && data === undefined
              ? {
                  serverTime: '2026-09-03T02:00:00.000Z',
                  capabilities: ['heartbeat', 'order.upsert_many'],
                  heartbeatIntervalMs: 20_000,
                }
              : data,
        }),
      }),
    )
  }

  serverClose(code = 1006, reason = '') {
    this.readyState = TestWebSocket.CLOSED
    const event = new Event('close') as CloseEvent
    Object.defineProperties(event, {
      code: { value: code },
      reason: { value: reason },
    })
    this.onclose?.(event)
  }
}

export const resetTestWebSockets = () => {
  TestWebSocket.instances.length = 0
}

export const latestTestWebSocket = (): TestWebSocket => {
  const socket = TestWebSocket.instances.at(-1)

  if (!socket) {
    throw new Error('Expected a realtime WebSocket to have been created.')
  }

  return socket
}
