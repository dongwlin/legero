/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  INITIAL_RECONNECT_DELAY_MS,
  MAX_RECONNECT_DELAY_MS,
  READY_TIMEOUT_MS,
  SESSION_TIMEOUT_MS,
  STABLE_CONNECTION_MS,
  getReconnectDelayMs,
  orderRealtime,
} from './orderRealtime'

const mocks = vi.hoisted(() => {
  class MockApiError extends Error {
    status: number
    code: string

    constructor(status: number, code: string, message: string) {
      super(message)
      this.name = 'ApiError'
      this.status = status
      this.code = code
    }
  }

  return {
    MockApiError,
    ensureFreshAuthTokens: vi.fn(),
    getApiBaseUrl: vi.fn(),
    realtimeSessionCreate: vi.fn(),
  }
})

vi.mock('./apiClient', () => ({
  ApiError: mocks.MockApiError,
  ensureFreshAuthTokens: mocks.ensureFreshAuthTokens,
  getApiBaseUrl: mocks.getApiBaseUrl,
}))

vi.mock('./realtimeSession', () => ({
  realtimeSession: { create: mocks.realtimeSessionCreate },
}))

class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances: FakeWebSocket[] = []

  readonly url: string
  readyState = FakeWebSocket.CONNECTING
  onopen: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: ((event: Event) => void) | null = null
  closeCalls: { code?: number; reason?: string }[] = []

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  close(code?: number, reason?: string) {
    this.closeCalls.push({ code, reason })
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.(new Event('close'))
  }

  open() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.(new Event('open'))
  }

  emit(eventType: string, data?: unknown) {
    this.onmessage?.(
      new MessageEvent('message', {
        data: JSON.stringify({ type: eventType, data }),
      }),
    )
  }

  serverClose() {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.(new Event('close'))
  }
}

const SESSION = {
  ticket: 'ticket-1',
  expiresAt: '2099-01-01T00:00:00.000Z',
}

const networkError = () => new TypeError('Failed to fetch')

const flushAsync = async () => {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve()
  }
}

const latestSocket = () =>
  FakeWebSocket.instances[FakeWebSocket.instances.length - 1]

const subscribe = (extra: {
  onSubscriptionStatus?: (status: string) => void
  onUpsert?: () => void
  onRemove?: () => void
  onClear?: () => void
} = {}) =>
  orderRealtime.subscribeToWorkspaceOrders({
    onSubscriptionStatus: extra.onSubscriptionStatus ?? vi.fn(),
    onUpsert: extra.onUpsert ?? vi.fn(),
    onRemove: extra.onRemove ?? vi.fn(),
    onClear: extra.onClear ?? vi.fn(),
  })

describe('getReconnectDelayMs', () => {
  it('grows exponentially with full jitter and caps at the max delay', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5)

    expect(getReconnectDelayMs(1)).toBe(INITIAL_RECONNECT_DELAY_MS * 0.5)
    expect(getReconnectDelayMs(2)).toBe(INITIAL_RECONNECT_DELAY_MS)
    expect(getReconnectDelayMs(3)).toBe(INITIAL_RECONNECT_DELAY_MS * 2)
    expect(getReconnectDelayMs(4)).toBe(INITIAL_RECONNECT_DELAY_MS * 4)
    expect(getReconnectDelayMs(5)).toBe(INITIAL_RECONNECT_DELAY_MS * 8)
    expect(getReconnectDelayMs(6)).toBe(MAX_RECONNECT_DELAY_MS * 0.5)
    expect(getReconnectDelayMs(20)).toBe(MAX_RECONNECT_DELAY_MS * 0.5)

    vi.mocked(Math.random).mockReturnValue(0.999)
    expect(getReconnectDelayMs(20)).toBe(Math.floor(MAX_RECONNECT_DELAY_MS * 0.999))
  })
})

describe('orderRealtime connection lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeWebSocket.instances.length = 0
    vi.stubGlobal('WebSocket', FakeWebSocket)
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    mocks.ensureFreshAuthTokens.mockReset().mockResolvedValue({ accessToken: 'access-1' })
    mocks.getApiBaseUrl.mockReset().mockReturnValue('http://localhost:8080')
    mocks.realtimeSessionCreate.mockReset().mockResolvedValue(SESSION)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('subscribes, reports SUBSCRIBED on ready, and dispatches order events', async () => {
    const onSubscriptionStatus = vi.fn()
    const onRemove = vi.fn()
    const onClear = vi.fn()

    const subscription = subscribe({ onSubscriptionStatus, onRemove, onClear })

    await flushAsync()

    expect(mocks.ensureFreshAuthTokens).toHaveBeenCalledTimes(1)
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(1)
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledWith(
      expect.any(AbortSignal),
    )

    const socket = latestSocket()
    expect(socket.url).toBe('ws://localhost:8080/api/ws?ticket=ticket-1')

    socket.open()
    socket.emit('ready', { serverTime: '2099-01-01T00:00:00.000Z' })

    expect(onSubscriptionStatus).toHaveBeenCalledTimes(1)
    expect(onSubscriptionStatus).toHaveBeenCalledWith('SUBSCRIBED')

    // A repeated ready must not re-report SUBSCRIBED.
    socket.emit('ready', { serverTime: '2099-01-01T00:00:00.000Z' })
    expect(onSubscriptionStatus).toHaveBeenCalledTimes(1)

    socket.emit('order.deleted', { id: 'o1' })
    expect(onRemove).toHaveBeenCalledWith('o1')

    socket.emit('order.cleared', { clearedCount: 3, mode: 'all' })
    expect(onClear).toHaveBeenCalledWith({ clearedCount: 3, mode: 'all' })

    subscription.close()
  })

  it('keeps retrying past the old 3-attempt limit and recovers once the network returns', async () => {
    mocks.realtimeSessionCreate.mockRejectedValue(networkError())

    const onSubscriptionStatus = vi.fn()
    const subscription = subscribe({ onSubscriptionStatus })

    await flushAsync()
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(1)

    // Simulate several offline retry cycles (well past 3 attempts).
    for (let cycle = 0; cycle < 2; cycle += 1) {
      await vi.advanceTimersByTimeAsync(MAX_RECONNECT_DELAY_MS)
      await flushAsync()
    }

    const offlineAttempts = mocks.realtimeSessionCreate.mock.calls.length
    expect(offlineAttempts).toBeGreaterThan(3)
    expect(onSubscriptionStatus).not.toHaveBeenCalled()
    expect(onSubscriptionStatus).not.toHaveBeenCalledWith('CHANNEL_ERROR')
    expect(onSubscriptionStatus).not.toHaveBeenCalledWith('TIMED_OUT')

    // Network comes back: the next scheduled retry succeeds.
    mocks.realtimeSessionCreate.mockResolvedValue(SESSION)
    await vi.advanceTimersByTimeAsync(MAX_RECONNECT_DELAY_MS)
    await flushAsync()

    const socket = latestSocket()
    socket.open()
    socket.emit('ready')

    expect(onSubscriptionStatus).toHaveBeenLastCalledWith('SUBSCRIBED')

    subscription.close()
  })

  it('does not reset the failure counter on ready; resets only after a stable window', async () => {
    mocks.realtimeSessionCreate
      .mockRejectedValueOnce(networkError())
      .mockRejectedValueOnce(networkError())
      .mockResolvedValue(SESSION)

    const onSubscriptionStatus = vi.fn()
    const subscription = subscribe({ onSubscriptionStatus })

    await flushAsync()

    // Attempt 1 fails -> backoff 500ms (0.5 * 1s).
    await vi.advanceTimersByTimeAsync(499)
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await flushAsync()

    // Attempt 2 fails -> backoff 1000ms (0.5 * 2s).
    await vi.advanceTimersByTimeAsync(999)
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    await flushAsync()

    // Attempt 3 succeeds.
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(3)
    const socket = latestSocket()
    socket.open()
    socket.emit('ready')
    expect(onSubscriptionStatus).toHaveBeenLastCalledWith('SUBSCRIBED')

    // Dropping right after ready must NOT reset the counter: the next delay
    // is attempt 3 -> 2000ms (0.5 * 4s), not the initial 500ms.
    socket.serverClose()
    await vi.advanceTimersByTimeAsync(1999)
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(1)
    await flushAsync()
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(4)

    // Stay online past the stability window, then drop: the counter resets
    // and the next delay is back to 500ms.
    const stableSocket = latestSocket()
    stableSocket.open()
    stableSocket.emit('ready')
    expect(onSubscriptionStatus).toHaveBeenLastCalledWith('SUBSCRIBED')

    await vi.advanceTimersByTimeAsync(STABLE_CONNECTION_MS)
    stableSocket.serverClose()

    await vi.advanceTimersByTimeAsync(499)
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(1)
    await flushAsync()
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(5)

    subscription.close()
  })

  it('times out a hung session request and falls through to the next retry', async () => {
    mocks.realtimeSessionCreate.mockImplementation(
      (signal?: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }),
    )

    const onSubscriptionStatus = vi.fn()
    const subscription = subscribe({ onSubscriptionStatus })

    await flushAsync()
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(1)
    expect(onSubscriptionStatus).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(SESSION_TIMEOUT_MS - 1)
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(1)

    // The session request aborts, then the backoff fires a new attempt.
    await vi.advanceTimersByTimeAsync(1)
    await flushAsync()
    await vi.advanceTimersByTimeAsync(500)
    await flushAsync()
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(2)

    subscription.close()
  })

  it('closes the socket and retries when the ready handshake never arrives', async () => {
    const onSubscriptionStatus = vi.fn()
    const subscription = subscribe({ onSubscriptionStatus })

    await flushAsync()
    const socket = latestSocket()
    socket.open()

    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(1)
    expect(onSubscriptionStatus).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS - 1)
    expect(socket.closeCalls).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(1)
    expect(socket.closeCalls).toEqual([{ code: 1000, reason: 'ready_timeout' }])

    await flushAsync()
    await vi.advanceTimersByTimeAsync(500)
    await flushAsync()
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(2)

    subscription.close()
  })

  it('reports TIMED_OUT on 401 and never retries', async () => {
    mocks.realtimeSessionCreate.mockRejectedValue(
      new mocks.MockApiError(401, 'unauthorized', 'Not authenticated.'),
    )

    const onSubscriptionStatus = vi.fn()
    const subscription = subscribe({ onSubscriptionStatus })

    await flushAsync()

    expect(onSubscriptionStatus).toHaveBeenCalledTimes(1)
    expect(onSubscriptionStatus).toHaveBeenCalledWith('TIMED_OUT')

    await vi.advanceTimersByTimeAsync(MAX_RECONNECT_DELAY_MS * 5)
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(1)
    expect(onSubscriptionStatus).not.toHaveBeenCalledWith('SUBSCRIBED')

    subscription.close()
  })

  it('reports CHANNEL_ERROR on an explicit business error and never retries', async () => {
    mocks.realtimeSessionCreate.mockRejectedValue(
      new mocks.MockApiError(403, 'forbidden', 'Workspace access denied.'),
    )

    const onSubscriptionStatus = vi.fn()
    const subscription = subscribe({ onSubscriptionStatus })

    await flushAsync()

    expect(onSubscriptionStatus).toHaveBeenCalledTimes(1)
    expect(onSubscriptionStatus).toHaveBeenCalledWith('CHANNEL_ERROR')

    await vi.advanceTimersByTimeAsync(MAX_RECONNECT_DELAY_MS * 5)
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(1)
    expect(onSubscriptionStatus).not.toHaveBeenCalledWith('SUBSCRIBED')

    subscription.close()
  })

  it('reports TIMED_OUT when no auth tokens are available and never retries', async () => {
    mocks.ensureFreshAuthTokens.mockResolvedValue(null)

    const onSubscriptionStatus = vi.fn()
    const subscription = subscribe({ onSubscriptionStatus })

    await flushAsync()

    expect(onSubscriptionStatus).toHaveBeenCalledTimes(1)
    expect(onSubscriptionStatus).toHaveBeenCalledWith('TIMED_OUT')
    expect(mocks.realtimeSessionCreate).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(MAX_RECONNECT_DELAY_MS * 5)
    expect(mocks.realtimeSessionCreate).not.toHaveBeenCalled()

    subscription.close()
  })

  it('stops reconnecting entirely after an explicit close', async () => {
    mocks.realtimeSessionCreate.mockRejectedValue(networkError())

    const onSubscriptionStatus = vi.fn()
    const subscription = subscribe({ onSubscriptionStatus })

    await flushAsync()
    await vi.advanceTimersByTimeAsync(500)
    await flushAsync()
    expect(mocks.realtimeSessionCreate.mock.calls.length).toBeGreaterThan(1)

    subscription.close()
    expect(onSubscriptionStatus).toHaveBeenLastCalledWith('CLOSED')

    await vi.advanceTimersByTimeAsync(MAX_RECONNECT_DELAY_MS * 10)
    const callsAfterClose = mocks.realtimeSessionCreate.mock.calls.length
    await vi.advanceTimersByTimeAsync(MAX_RECONNECT_DELAY_MS * 10)
    expect(mocks.realtimeSessionCreate.mock.calls.length).toBe(callsAfterClose)
    expect(onSubscriptionStatus).not.toHaveBeenCalledWith('SUBSCRIBED')
  })

  it('aborts an in-flight session request on close and stays closed', async () => {
    mocks.realtimeSessionCreate.mockImplementation((signal?: AbortSignal) => {
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    })

    const onSubscriptionStatus = vi.fn()
    const subscription = subscribe({ onSubscriptionStatus })

    await flushAsync()
    const signal = mocks.realtimeSessionCreate.mock.calls[0]?.[0] as
      | AbortSignal
      | undefined
    expect(signal).toBeDefined()
    expect(signal?.aborted).toBe(false)

    subscription.close()
    expect(signal?.aborted).toBe(true)
    expect(onSubscriptionStatus).toHaveBeenCalledTimes(1)
    expect(onSubscriptionStatus).toHaveBeenCalledWith('CLOSED')

    await flushAsync()
    await vi.advanceTimersByTimeAsync(MAX_RECONNECT_DELAY_MS * 10)
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(1)

    // A second close is a no-op.
    subscription.close()
    expect(onSubscriptionStatus).toHaveBeenCalledTimes(1)
  })

  it('ignores messages and close from a stale socket after close', async () => {
    const onUpsert = vi.fn()
    const subscription = subscribe({ onUpsert })

    await flushAsync()
    const socket = latestSocket()
    socket.open()

    subscription.close()

    socket.emit('ready', { serverTime: '2099-01-01T00:00:00.000Z' })
    socket.emit('order.upsert', { item: { id: 'o1' } })

    expect(onUpsert).not.toHaveBeenCalled()
  })
})
