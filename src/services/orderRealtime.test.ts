/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUTH_REFRESH_TIMEOUT_MS,
  BACKGROUND_STALE_MS,
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
    startRealtimeRecoverySignals: vi.fn(),
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

vi.mock('./realtimeRecovery', () => ({
  startRealtimeRecoverySignals: mocks.startRealtimeRecoverySignals,
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

type RecoveryHandlers = {
  onNetworkOffline: () => void
  onNetworkOnline: () => void
  onAppBackground: () => void
  onAppForeground: () => void
}

const recoveryHandlers = (): RecoveryHandlers =>
  mocks.startRealtimeRecoverySignals.mock.calls.at(-1)?.[0] as RecoveryHandlers

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
    mocks.startRealtimeRecoverySignals
      .mockReset()
      .mockReturnValue(() => {})
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
    const onRemove = vi.fn()
    const subscription = subscribe({ onSubscriptionStatus, onRemove })

    await flushAsync()
    const socket = latestSocket()
    socket.open()

    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(1)
    expect(onSubscriptionStatus).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS - 1)
    expect(socket.closeCalls).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(1)
    expect(socket.closeCalls).toEqual([{ code: 1000, reason: 'ready_timeout' }])

    // A late 'ready' or message from the timed-out socket must not move the
    // state machine (in a real browser close() -> onclose is asynchronous,
    // so this window exists in production).
    socket.emit('ready', { serverTime: '2099-01-01T00:00:00.000Z' })
    socket.emit('order.deleted', { id: 'o1' })
    expect(onSubscriptionStatus).not.toHaveBeenCalled()
    expect(onRemove).not.toHaveBeenCalled()

    await flushAsync()
    await vi.advanceTimersByTimeAsync(500)
    await flushAsync()
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(2)

    subscription.close()
  })

  it('ignores a stale onclose so the new attempt keeps its ready timer', async () => {
    const onSubscriptionStatus = vi.fn()
    const subscription = subscribe({ onSubscriptionStatus })

    await flushAsync()
    const socket1 = latestSocket()
    socket1.open()

    // socket1 never sends 'ready' -> its attempt times out and reconnects.
    await vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS)
    expect(socket1.closeCalls).toEqual([{ code: 1000, reason: 'ready_timeout' }])

    // Wait for the backoff; attempt 2 creates socket2 with its own timer.
    await flushAsync()
    await vi.advanceTimersByTimeAsync(500)
    await flushAsync()

    const socket2 = latestSocket()
    expect(socket2).not.toBe(socket1)
    socket2.open()

    // The browser delivers socket1's onclose only now (close() -> onclose is
    // asynchronous). It must not cancel socket2's ready timer.
    socket1.onclose?.(new Event('close'))

    const attemptsAfterStaleClose = mocks.realtimeSessionCreate.mock.calls.length

    await vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS - 1)
    expect(mocks.realtimeSessionCreate.mock.calls.length).toBe(attemptsAfterStaleClose)

    // socket2's own ready timeout still fires 8s after its open.
    await vi.advanceTimersByTimeAsync(1)
    expect(socket2.closeCalls).toEqual([{ code: 1000, reason: 'ready_timeout' }])

    // ...and the next retry is scheduled (attempt 3 -> 0.5 * 2s = 1000ms).
    await flushAsync()
    await vi.advanceTimersByTimeAsync(1000)
    await flushAsync()
    expect(mocks.realtimeSessionCreate.mock.calls.length).toBe(attemptsAfterStaleClose + 1)

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

  it('does not create a session when closed while the auth refresh is pending', async () => {
    const pendingAuth: {
      resolve: ((value: { accessToken: string }) => void) | null
    } = { resolve: null }

    mocks.ensureFreshAuthTokens.mockImplementation(
      () =>
        new Promise((resolve) => {
          pendingAuth.resolve = resolve
        }),
    )

    const onSubscriptionStatus = vi.fn()
    const subscription = subscribe({ onSubscriptionStatus })

    await flushAsync()
    expect(pendingAuth.resolve).not.toBeNull()

    subscription.close()
    expect(onSubscriptionStatus).toHaveBeenCalledWith('CLOSED')

    // The refresh resolves after close: the attempt must be abandoned before
    // any session request is started.
    pendingAuth.resolve?.({ accessToken: 'access-1' })

    await flushAsync()
    expect(mocks.realtimeSessionCreate).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(MAX_RECONNECT_DELAY_MS * 10)
    expect(mocks.realtimeSessionCreate).not.toHaveBeenCalled()
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

  it('unregisters recovery signals on close', async () => {
    const stopRecoverySignals = vi.fn()
    mocks.startRealtimeRecoverySignals.mockReturnValue(stopRecoverySignals)

    const subscription = subscribe()
    await flushAsync()

    expect(mocks.startRealtimeRecoverySignals).toHaveBeenCalledTimes(1)
    expect(stopRecoverySignals).not.toHaveBeenCalled()

    subscription.close()
    expect(stopRecoverySignals).toHaveBeenCalledTimes(1)
  })

  it('defers timer retries while offline and reconnects immediately on network recovery', async () => {
    mocks.realtimeSessionCreate.mockRejectedValue(networkError())

    const onSubscriptionStatus = vi.fn()
    const subscription = subscribe({ onSubscriptionStatus })

    await flushAsync()
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(1)

    // Network drops before the first backoff fires.
    recoveryHandlers().onNetworkOffline()

    // No timer-driven retries while offline.
    await vi.advanceTimersByTimeAsync(MAX_RECONNECT_DELAY_MS * 10)
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(1)

    // Network returns: the backoff is broken and the next attempt is
    // immediate, with no timer wait.
    mocks.realtimeSessionCreate.mockResolvedValue(SESSION)
    recoveryHandlers().onNetworkOnline()
    await flushAsync()
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(2)

    const socket = latestSocket()
    socket.open()
    socket.emit('ready')
    expect(onSubscriptionStatus).toHaveBeenLastCalledWith('SUBSCRIBED')

    subscription.close()
  })

  it('closes a half-open online socket when the network drops', async () => {
    const subscription = subscribe()
    await flushAsync()
    const socket = latestSocket()
    socket.open()
    socket.emit('ready')

    recoveryHandlers().onNetworkOffline()
    expect(socket.closeCalls).toEqual([{ code: 1000, reason: 'network_offline' }])

    // No retries while offline; a network recovery event drives the next try.
    await vi.advanceTimersByTimeAsync(MAX_RECONNECT_DELAY_MS * 10)
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(1)

    subscription.close()
  })

  it('aborts an in-flight session request when the network drops', async () => {
    mocks.realtimeSessionCreate.mockImplementation((signal?: AbortSignal) => {
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    })

    const subscription = subscribe()
    await flushAsync()

    const signal = mocks.realtimeSessionCreate.mock.calls[0]?.[0] as
      | AbortSignal
      | undefined
    expect(signal).toBeDefined()
    expect(signal?.aborted).toBe(false)

    recoveryHandlers().onNetworkOffline()
    expect(signal?.aborted).toBe(true)

    // Offline: no timer retries. Network recovery reconnects immediately.
    await vi.advanceTimersByTimeAsync(MAX_RECONNECT_DELAY_MS * 10)
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(1)

    mocks.realtimeSessionCreate.mockResolvedValue(SESSION)
    recoveryHandlers().onNetworkOnline()
    await flushAsync()
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(2)

    subscription.close()
  })

  it('rebuilds an online socket after a network identity change', async () => {
    const onSubscriptionStatus = vi.fn()
    const subscription = subscribe({ onSubscriptionStatus })

    await flushAsync()
    const socket = latestSocket()
    socket.open()
    socket.emit('ready')
    expect(onSubscriptionStatus).toHaveBeenLastCalledWith('SUBSCRIBED')

    // Wi-Fi -> cellular often arrives as a change event without an offline
    // transition; the old socket is rebuilt to guarantee fresh server state.
    recoveryHandlers().onNetworkOnline()
    await flushAsync()

    expect(socket.closeCalls).toEqual([{ code: 1000, reason: 'network_recovery' }])
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(2)

    const nextSocket = latestSocket()
    nextSocket.open()
    nextSocket.emit('ready')
    expect(onSubscriptionStatus).toHaveBeenCalledTimes(2)

    subscription.close()
  })

  it('pauses timer retries while backgrounded and reconnects immediately on foreground', async () => {
    mocks.realtimeSessionCreate.mockRejectedValue(networkError())
    const onSubscriptionStatus = vi.fn()
    const subscription = subscribe({ onSubscriptionStatus })

    await flushAsync()
    await vi.advanceTimersByTimeAsync(500)
    await flushAsync()

    const attemptsBeforeBackground = mocks.realtimeSessionCreate.mock.calls.length
    expect(attemptsBeforeBackground).toBeGreaterThan(1)

    recoveryHandlers().onAppBackground()

    // No timer-driven retries while backgrounded.
    await vi.advanceTimersByTimeAsync(MAX_RECONNECT_DELAY_MS * 10)
    expect(mocks.realtimeSessionCreate.mock.calls.length).toBe(attemptsBeforeBackground)

    // Foreground resumes with an immediate attempt.
    mocks.realtimeSessionCreate.mockResolvedValue(SESSION)
    recoveryHandlers().onAppForeground()
    await flushAsync()
    expect(mocks.realtimeSessionCreate.mock.calls.length).toBe(attemptsBeforeBackground + 1)

    const socket = latestSocket()
    socket.open()
    socket.emit('ready')
    expect(onSubscriptionStatus).toHaveBeenLastCalledWith('SUBSCRIBED')

    subscription.close()
  })

  it('rebuilds a stale online socket after a long background', async () => {
    const subscription = subscribe()
    await flushAsync()
    const socket = latestSocket()
    socket.open()
    socket.emit('ready')

    recoveryHandlers().onAppBackground()
    await vi.advanceTimersByTimeAsync(BACKGROUND_STALE_MS)

    recoveryHandlers().onAppForeground()
    await flushAsync()

    expect(socket.closeCalls).toEqual([{ code: 1000, reason: 'foreground_recovery' }])
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(2)

    subscription.close()
  })

  it('abandons an in-flight connecting attempt that spanned a long background', async () => {
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
    const hungSignal = mocks.realtimeSessionCreate.mock.calls[0]?.[0] as
      | AbortSignal
      | undefined
    expect(hungSignal).toBeDefined()
    expect(hungSignal?.aborted).toBe(false)

    // The app is backgrounded (e.g. OS suspend) while the session request is
    // still in flight; the handshake cannot complete while frozen.
    recoveryHandlers().onAppBackground()
    await vi.advanceTimersByTimeAsync(BACKGROUND_STALE_MS)

    // Foreground: the old attempt must be invalidated and exactly one fresh
    // connection flow must start.
    mocks.realtimeSessionCreate.mockResolvedValue(SESSION)
    recoveryHandlers().onAppForeground()
    await flushAsync()

    expect(hungSignal?.aborted).toBe(true)
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(2)

    const socket = latestSocket()
    socket.open()
    socket.emit('ready')
    expect(onSubscriptionStatus).toHaveBeenLastCalledWith('SUBSCRIBED')

    subscription.close()
  })

  it('keeps a healthy online socket after a short background', async () => {
    const subscription = subscribe()
    await flushAsync()
    const socket = latestSocket()
    socket.open()
    socket.emit('ready')

    recoveryHandlers().onAppBackground()
    await vi.advanceTimersByTimeAsync(BACKGROUND_STALE_MS - 1_000)

    recoveryHandlers().onAppForeground()
    await flushAsync()

    expect(socket.closeCalls).toHaveLength(0)
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(1)

    subscription.close()
  })

  it('does not rebuild the socket on a duplicate foreground after a short background', async () => {
    const subscription = subscribe()
    await flushAsync()
    const socket = latestSocket()
    socket.open()
    socket.emit('ready')

    // Short background, then a normal foreground: the socket is kept.
    recoveryHandlers().onAppBackground()
    await vi.advanceTimersByTimeAsync(BACKGROUND_STALE_MS - 1_000)
    recoveryHandlers().onAppForeground()

    // A later duplicate foreground signal must not re-judge the socket
    // against the old (already consumed) background timestamp.
    await vi.advanceTimersByTimeAsync(BACKGROUND_STALE_MS)
    recoveryHandlers().onAppForeground()
    await flushAsync()

    expect(socket.closeCalls).toHaveLength(0)
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(1)

    subscription.close()
  })

  it('times out a hung auth refresh so the channel is not pinned in connecting', async () => {
    mocks.ensureFreshAuthTokens.mockImplementation(() => new Promise(() => {}))

    const subscription = subscribe()

    await flushAsync()
    expect(mocks.ensureFreshAuthTokens).toHaveBeenCalledTimes(1)
    expect(mocks.realtimeSessionCreate).not.toHaveBeenCalled()

    // The refresh never settles; the per-attempt timeout must let the state
    // machine move on to the next attempt (with backoff).
    await vi.advanceTimersByTimeAsync(AUTH_REFRESH_TIMEOUT_MS)
    await flushAsync()
    await vi.advanceTimersByTimeAsync(INITIAL_RECONNECT_DELAY_MS)
    await flushAsync()

    expect(mocks.ensureFreshAuthTokens).toHaveBeenCalledTimes(2)
    expect(mocks.realtimeSessionCreate).not.toHaveBeenCalled()

    subscription.close()
  })

  it('recovers from a hung auth refresh after a long background', async () => {
    mocks.ensureFreshAuthTokens
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValue({ accessToken: 'access-1' })

    const onSubscriptionStatus = vi.fn()
    const subscription = subscribe({ onSubscriptionStatus })

    await flushAsync()
    expect(mocks.ensureFreshAuthTokens).toHaveBeenCalledTimes(1)

    // Background while the refresh is still pending: the attempt times out
    // during the background and its retry is deferred.
    recoveryHandlers().onAppBackground()
    await vi.advanceTimersByTimeAsync(BACKGROUND_STALE_MS)

    // Foreground starts a fresh flow with a new refresh call.
    recoveryHandlers().onAppForeground()
    await flushAsync()

    expect(mocks.ensureFreshAuthTokens).toHaveBeenCalledTimes(2)
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(1)

    const socket = latestSocket()
    socket.open()
    socket.emit('ready')
    expect(onSubscriptionStatus).toHaveBeenLastCalledWith('SUBSCRIBED')

    subscription.close()
  })

  it('does not reconnect on foreground while the network is still offline', async () => {
    mocks.realtimeSessionCreate.mockRejectedValue(networkError())
    const subscription = subscribe()

    await flushAsync()
    recoveryHandlers().onNetworkOffline()
    recoveryHandlers().onAppBackground()

    await vi.advanceTimersByTimeAsync(MAX_RECONNECT_DELAY_MS * 5)

    // Foreground without network must not trigger an attempt.
    recoveryHandlers().onAppForeground()
    await flushAsync()
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(1)

    // Once the network returns, the attempt is immediate.
    mocks.realtimeSessionCreate.mockResolvedValue(SESSION)
    recoveryHandlers().onNetworkOnline()
    await flushAsync()
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(2)

    subscription.close()
  })

  it('coalesces simultaneous recovery events into a single connection flow', async () => {
    mocks.realtimeSessionCreate.mockRejectedValue(networkError())
    const subscription = subscribe()

    await flushAsync()
    await vi.advanceTimersByTimeAsync(500)
    await flushAsync()

    const attemptsBefore = mocks.realtimeSessionCreate.mock.calls.length

    // Network online and app foreground fire back to back (e.g. airplane mode
    // off while returning to the app): only one new attempt is started.
    recoveryHandlers().onNetworkOnline()
    recoveryHandlers().onAppForeground()
    recoveryHandlers().onNetworkOnline()
    await flushAsync()

    expect(mocks.realtimeSessionCreate.mock.calls.length).toBe(attemptsBefore + 1)

    subscription.close()
  })

  it('defers the initial connect when the subscription starts backgrounded', async () => {
    mocks.startRealtimeRecoverySignals.mockImplementation(
      (handlers: RecoveryHandlers) => {
        handlers.onAppBackground()
        return () => {}
      },
    )

    const subscription = subscribe()

    await flushAsync()
    // No futile auth/session request while backgrounded.
    expect(mocks.ensureFreshAuthTokens).not.toHaveBeenCalled()

    // Foreground recovery starts the flow.
    recoveryHandlers().onAppForeground()
    await flushAsync()
    expect(mocks.ensureFreshAuthTokens).toHaveBeenCalledTimes(1)

    subscription.close()
  })

  it('defers the initial connect when the subscription starts offline', async () => {
    mocks.startRealtimeRecoverySignals.mockImplementation(
      (handlers: RecoveryHandlers) => {
        handlers.onNetworkOffline()
        return () => {}
      },
    )

    const subscription = subscribe()

    await flushAsync()
    expect(mocks.ensureFreshAuthTokens).not.toHaveBeenCalled()
    expect(mocks.realtimeSessionCreate).not.toHaveBeenCalled()

    // Network recovery starts the flow.
    recoveryHandlers().onNetworkOnline()
    await flushAsync()
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(1)

    subscription.close()
  })
})
