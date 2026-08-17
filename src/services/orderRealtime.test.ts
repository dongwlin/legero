/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUTH_REFRESH_TIMEOUT_MS,
  ApiError,
  clearStoredAuthTokens,
  persistAuthTokens,
} from './apiClient'
import { setStoredApiBaseUrl } from './apiConfig'
import {
  BACKGROUND_STALE_MS,
  INITIAL_RECONNECT_DELAY_MS,
  MAX_RECONNECT_DELAY_MS,
  READY_TIMEOUT_MS,
  SESSION_TIMEOUT_MS,
  SERVER_ACTIVITY_TIMEOUT_MS,
  STABLE_CONNECTION_MS,
  getServerActivityTimeoutMs,
  getReconnectDelayMs,
  orderRealtime,
} from './orderRealtime'

const mocks = vi.hoisted(() => ({
  realtimeSessionCreate: vi.fn(),
  startRealtimeRecoverySignals: vi.fn(),
}))

vi.mock('./realtimeSession', () => ({
  realtimeSession: { create: mocks.realtimeSessionCreate },
}))

vi.mock('./realtimeRecovery', () => ({
  startRealtimeRecoverySignals: mocks.startRealtimeRecoverySignals,
}))

// Auth fixtures. The real apiClient is used for auth (single-flight refresh,
// timeout/abort), so tokens live in localStorage and the refresh fetch is
// stubbed; realtimeSession and the recovery signals stay mocked.
const TOKENS = {
  accessToken: 'access-1',
  tokenType: 'Bearer',
  accessTokenExpiresAt: '2099-01-01T00:00:00.000Z',
  refreshToken: 'refresh-1',
  refreshTokenExpiresAt: '2099-01-01T00:00:00.000Z',
}

const EXPIRED_TOKENS = {
  ...TOKENS,
  accessTokenExpiresAt: '2000-01-01T00:00:00.000Z',
}

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const mockFetch = vi.fn()

const HEARTBEAT_READY = {
  capabilities: ['heartbeat'],
  heartbeatIntervalMs: 20_000,
}

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
    const payload =
      eventType === 'ready' && data === undefined ? HEARTBEAT_READY : data

    this.onmessage?.(
      new MessageEvent('message', {
        data: JSON.stringify({ type: eventType, data: payload }),
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
  for (let i = 0; i < 50; i += 1) {
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
    vi.stubGlobal('fetch', mockFetch)
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    localStorage.clear()
    setStoredApiBaseUrl('http://localhost:8080')
    // Fresh tokens by default: ordinary tests never hit the refresh fetch.
    persistAuthTokens(TOKENS)
    mockFetch.mockReset()
    mocks.realtimeSessionCreate.mockReset().mockResolvedValue(SESSION)
    mocks.startRealtimeRecoverySignals
      .mockReset()
      .mockReturnValue({ ready: Promise.resolve(), stop: () => {} })
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

    // Fresh tokens need no refresh fetch before the session request.
    expect(mockFetch).not.toHaveBeenCalled()
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

  it('keeps an online socket healthy when application heartbeats arrive', async () => {
    const subscription = subscribe()

    await flushAsync()
    const socket = latestSocket()
    socket.open()
    socket.emit('ready')

    await vi.advanceTimersByTimeAsync(SERVER_ACTIVITY_TIMEOUT_MS - 1)
    socket.emit('heartbeat', {
      serverTime: '2099-01-01T00:00:44.999Z',
    })

    // The heartbeat moved the watchdog deadline; the original deadline must
    // not close the socket.
    await vi.advanceTimersByTimeAsync(SERVER_ACTIVITY_TIMEOUT_MS - 1)
    expect(socket.closeCalls).toHaveLength(0)
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(1)

    subscription.close()
  })

  it('counts business envelopes as server activity', async () => {
    const onRemove = vi.fn()
    const subscription = subscribe({ onRemove })

    await flushAsync()
    const socket = latestSocket()
    socket.open()
    socket.emit('ready')

    await vi.advanceTimersByTimeAsync(SERVER_ACTIVITY_TIMEOUT_MS - 1)
    socket.emit('order.deleted', { id: 'o1' })

    await vi.advanceTimersByTimeAsync(SERVER_ACTIVITY_TIMEOUT_MS - 1)
    expect(onRemove).toHaveBeenCalledWith('o1')
    expect(socket.closeCalls).toHaveLength(0)
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(1)

    subscription.close()
  })

  it('hard-reconnects exactly once after server activity becomes stale', async () => {
    const subscription = subscribe()

    await flushAsync()
    const socket = latestSocket()
    socket.open()
    socket.emit('ready')

    await vi.advanceTimersByTimeAsync(SERVER_ACTIVITY_TIMEOUT_MS)
    await flushAsync()

    expect(socket.closeCalls).toEqual([
      { code: 1000, reason: 'server_activity_timeout' },
    ])
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(2)

    // The stale callback invalidates its generation before connecting, so it
    // cannot schedule a second concurrent session flow.
    await vi.advanceTimersByTimeAsync(1)
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(2)

    subscription.close()
  })

  it('keeps the remaining foreground activity budget across a short background', async () => {
    const subscription = subscribe()

    await flushAsync()
    const socket = latestSocket()
    socket.open()
    socket.emit('ready')

    const foregroundElapsed = 20_000
    await vi.advanceTimersByTimeAsync(foregroundElapsed)

    recoveryHandlers().onAppBackground()
    await vi.advanceTimersByTimeAsync(BACKGROUND_STALE_MS - 1_000)

    // No heartbeat is dispatched while backgrounded. The hidden duration must
    // not consume the activity watchdog's foreground budget.
    recoveryHandlers().onAppForeground()
    await flushAsync()
    expect(socket.closeCalls).toHaveLength(0)
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(1)

    const remainingForegroundBudget =
      SERVER_ACTIVITY_TIMEOUT_MS - foregroundElapsed
    await vi.advanceTimersByTimeAsync(remainingForegroundBudget - 1)
    expect(socket.closeCalls).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(1)
    await flushAsync()
    expect(socket.closeCalls).toEqual([
      { code: 1000, reason: 'server_activity_timeout' },
    ])
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(2)

    subscription.close()
  })

  it('does not start the watchdog for a legacy ready payload', async () => {
    const subscription = subscribe()

    await flushAsync()
    const socket = latestSocket()
    socket.open()
    socket.emit('ready', { serverTime: '2099-01-01T00:00:00.000Z' })

    await vi.advanceTimersByTimeAsync(SERVER_ACTIVITY_TIMEOUT_MS * 2)
    expect(socket.closeCalls).toHaveLength(0)
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(1)

    subscription.close()
  })

  it('uses the negotiated heartbeat interval for the watchdog timeout', async () => {
    const subscription = subscribe()

    await flushAsync()
    const socket = latestSocket()
    socket.open()
    socket.emit('ready', {
      capabilities: ['heartbeat'],
      heartbeatIntervalMs: 10_000,
    })

    const timeout = getServerActivityTimeoutMs(10_000)
    await vi.advanceTimersByTimeAsync(timeout - 1)
    expect(socket.closeCalls).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(1)
    await flushAsync()
    expect(socket.closeCalls).toEqual([
      { code: 1000, reason: 'server_activity_timeout' },
    ])
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(2)

    subscription.close()
  })

  it.each([
    {
      name: 'without heartbeat capability',
      data: { capabilities: [], heartbeatIntervalMs: 20_000 },
    },
    {
      name: 'with a non-positive interval',
      data: { capabilities: ['heartbeat'], heartbeatIntervalMs: 0 },
    },
    {
      name: 'with a non-numeric interval',
      data: { capabilities: ['heartbeat'], heartbeatIntervalMs: '20000' },
    },
    {
      name: 'with a null/invalid interval value',
      data: { capabilities: ['heartbeat'], heartbeatIntervalMs: null },
    },
    {
      name: 'with an interval whose timeout exceeds timer limits',
      data: { capabilities: ['heartbeat'], heartbeatIntervalMs: 2_147_483_648 },
    },
  ])('does not start the watchdog $name', async ({ data }) => {
    const subscription = subscribe()

    await flushAsync()
    const socket = latestSocket()
    socket.open()
    socket.emit('ready', data)

    await vi.advanceTimersByTimeAsync(SERVER_ACTIVITY_TIMEOUT_MS * 2)
    expect(socket.closeCalls).toHaveLength(0)
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(1)

    subscription.close()
  })

  it('uses a monotonic clock for activity timeout despite wall-clock changes', async () => {
    const subscription = subscribe()

    await flushAsync()
    const socket = latestSocket()
    socket.open()
    socket.emit('ready')

    vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'))
    await vi.advanceTimersByTimeAsync(SERVER_ACTIVITY_TIMEOUT_MS - 1)
    expect(socket.closeCalls).toHaveLength(0)

    // Moving wall time backwards must not postpone the monotonic watchdog.
    vi.setSystemTime(new Date('2000-01-01T00:00:00.000Z'))
    await vi.advanceTimersByTimeAsync(1)
    await flushAsync()
    expect(socket.closeCalls).toEqual([
      { code: 1000, reason: 'server_activity_timeout' },
    ])

    subscription.close()
  })

  it('ignores a wall-clock jump during a short background', async () => {
    const subscription = subscribe()

    await flushAsync()
    const socket = latestSocket()
    socket.open()
    socket.emit('ready')

    const foregroundElapsed = 20_000
    await vi.advanceTimersByTimeAsync(foregroundElapsed)

    recoveryHandlers().onAppBackground()

    // Date.now() can jump while the app is suspended. The monotonic clock has
    // advanced only by the short-background duration below, so this must not
    // turn a retained socket into a long-background recovery or stale timeout.
    const wallClockAtBackground = Date.now()
    vi.setSystemTime(new Date(wallClockAtBackground + 60 * 60 * 1_000))
    await vi.advanceTimersByTimeAsync(BACKGROUND_STALE_MS - 1_000)

    recoveryHandlers().onAppForeground()
    await flushAsync()
    expect(socket.closeCalls).toHaveLength(0)
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(1)

    const remainingForegroundBudget =
      SERVER_ACTIVITY_TIMEOUT_MS - foregroundElapsed
    await vi.advanceTimersByTimeAsync(remainingForegroundBudget - 1)
    expect(socket.closeCalls).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(1)
    await flushAsync()
    expect(socket.closeCalls).toEqual([
      { code: 1000, reason: 'server_activity_timeout' },
    ])
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(2)

    subscription.close()
  })

  it('pauses activity health checks in the background and recovers on foreground', async () => {
    const subscription = subscribe()

    await flushAsync()
    const socket = latestSocket()
    socket.open()
    socket.emit('ready')

    recoveryHandlers().onAppBackground()
    await vi.advanceTimersByTimeAsync(SERVER_ACTIVITY_TIMEOUT_MS)

    // Background time must not fire the online watchdog.
    expect(socket.closeCalls).toHaveLength(0)
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(1)

    recoveryHandlers().onAppForeground()
    await flushAsync()

    expect(socket.closeCalls).toEqual([
      { code: 1000, reason: 'foreground_recovery' },
    ])
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(2)

    subscription.close()
  })

  it('does not misjudge a background socket that received activity before resume', async () => {
    const subscription = subscribe()

    await flushAsync()
    const socket = latestSocket()
    socket.open()
    socket.emit('ready')

    recoveryHandlers().onAppBackground()
    await vi.advanceTimersByTimeAsync(BACKGROUND_STALE_MS - 1_000)
    socket.emit('heartbeat')
    recoveryHandlers().onAppForeground()
    await flushAsync()

    expect(socket.closeCalls).toHaveLength(0)
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(1)

    // Once resumed, the watchdog is active again and eventually reconnects
    // if that refreshed activity is followed by silence.
    await vi.advanceTimersByTimeAsync(SERVER_ACTIVITY_TIMEOUT_MS)
    await flushAsync()
    expect(socket.closeCalls).toEqual([
      { code: 1000, reason: 'server_activity_timeout' },
    ])
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(2)

    subscription.close()
  })

  it('pauses activity health checks while offline', async () => {
    const subscription = subscribe()

    await flushAsync()
    const socket = latestSocket()
    socket.open()
    socket.emit('ready')

    recoveryHandlers().onNetworkOffline()
    await vi.advanceTimersByTimeAsync(SERVER_ACTIVITY_TIMEOUT_MS * 2)

    expect(socket.closeCalls).toEqual([{ code: 1000, reason: 'network_offline' }])
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(1)

    subscription.close()
  })

  it('clears the activity watchdog when explicitly closed', async () => {
    const subscription = subscribe()

    await flushAsync()
    const socket = latestSocket()
    socket.open()
    socket.emit('ready')

    subscription.close()
    await vi.advanceTimersByTimeAsync(SERVER_ACTIVITY_TIMEOUT_MS * 2)

    expect(socket.closeCalls).toEqual([{ code: 1000, reason: 'client_closed' }])
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('passes the server-provided before_today cutoff through the clear event', async () => {
    const onClear = vi.fn()

    const subscription = subscribe({ onClear })

    await flushAsync()

    const socket = latestSocket()
    socket.open()
    socket.emit('ready', { serverTime: '2099-01-01T00:00:00.000Z' })

    // The payload carries the authoritative business-day key the server used
    // to execute the clear; the client must forward it verbatim.
    socket.emit('order.cleared', {
      clearedCount: 2,
      mode: 'before_today',
      clearDateKey: '2026-08-17',
    })
    expect(onClear).toHaveBeenCalledWith({
      clearedCount: 2,
      mode: 'before_today',
      clearDateKey: '2026-08-17',
    })

    subscription.close()
  })

  it('omits a malformed clear date key from the forwarded clear event', async () => {
    const onClear = vi.fn()

    const subscription = subscribe({ onClear })

    await flushAsync()

    const socket = latestSocket()
    socket.open()
    socket.emit('ready', { serverTime: '2099-01-01T00:00:00.000Z' })

    // Anything that does not look like YYYY-MM-DD is not a trusted server
    // cutoff and must not reach the barrier logic.
    socket.emit('order.cleared', {
      clearedCount: 2,
      mode: 'before_today',
      clearDateKey: '17-08-2026',
    })
    expect(onClear).toHaveBeenCalledWith({ clearedCount: 2, mode: 'before_today' })

    expect(onClear).not.toHaveBeenCalledWith(
      expect.objectContaining({ clearDateKey: expect.any(String) }),
    )

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
      new ApiError(401, 'unauthorized', 'Not authenticated.'),
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
      new ApiError(403, 'forbidden', 'Workspace access denied.'),
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
    clearStoredAuthTokens()

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
    persistAuthTokens(EXPIRED_TOKENS)

    const refreshState: {
      resolve: ((response: Response) => void) | null
    } = { resolve: null }
    mockFetch.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          refreshState.resolve = resolve
        }),
    )

    const onSubscriptionStatus = vi.fn()
    const subscription = subscribe({ onSubscriptionStatus })

    await flushAsync()
    expect(refreshState.resolve).not.toBeNull()

    subscription.close()
    expect(onSubscriptionStatus).toHaveBeenCalledWith('CLOSED')

    // The refresh resolves after close: the attempt must be abandoned before
    // any session request is started.
    refreshState.resolve?.(jsonResponse(200, { ...TOKENS, accessToken: 'access-2' }))

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
    mocks.startRealtimeRecoverySignals.mockReturnValue({
      ready: Promise.resolve(),
      stop: stopRecoverySignals,
    })

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
    // Keep the socket's server-activity watchdog healthy while this test
    // advances another background-stale window to exercise a duplicate
    // foreground signal.
    socket.emit('heartbeat')

    // A later duplicate foreground signal must not re-judge the socket
    // against the old (already consumed) background timestamp.
    await vi.advanceTimersByTimeAsync(BACKGROUND_STALE_MS)
    recoveryHandlers().onAppForeground()
    await flushAsync()

    expect(socket.closeCalls).toHaveLength(0)
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(1)

    subscription.close()
  })

  it('aborts a hung refresh fetch and retries with a genuinely fresh one', async () => {
    persistAuthTokens(EXPIRED_TOKENS)

    // A fetch that hangs until its signal aborts it (like a real fetch on a
    // dead network stack).
    mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'))
        })
      })
    })

    const subscription = subscribe()

    await flushAsync()
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mocks.realtimeSessionCreate).not.toHaveBeenCalled()

    // The refresh never settles on its own; the apiClient-level abort must
    // release the single-flight slot so the next attempt starts a fresh
    // refresh instead of inheriting the hung promise.
    await vi.advanceTimersByTimeAsync(AUTH_REFRESH_TIMEOUT_MS)
    await flushAsync()
    await vi.advanceTimersByTimeAsync(INITIAL_RECONNECT_DELAY_MS)
    await flushAsync()

    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mocks.realtimeSessionCreate).not.toHaveBeenCalled()

    subscription.close()

    // The retry's refresh is still hanging; let its abort fire so the
    // module-level single-flight slot is released and does not leak a hung
    // promise into later tests.
    await vi.advanceTimersByTimeAsync(AUTH_REFRESH_TIMEOUT_MS)
  })

  it('recovers from a hung auth refresh after a long background', async () => {
    persistAuthTokens(EXPIRED_TOKENS)

    // First refresh hangs (until its signal aborts it); the foreground flow's
    // refresh succeeds.
    mockFetch
      .mockImplementationOnce((_url: string, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        })
      })
      .mockResolvedValueOnce(
        jsonResponse(200, { ...TOKENS, accessToken: 'access-2' }),
      )

    const onSubscriptionStatus = vi.fn()
    const subscription = subscribe({ onSubscriptionStatus })

    await flushAsync()
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // Background while the refresh is still pending: the apiClient-level
    // abort fires during the background, releases the single-flight slot and
    // defers the retry.
    recoveryHandlers().onAppBackground()
    await vi.advanceTimersByTimeAsync(BACKGROUND_STALE_MS)

    // Foreground starts a fresh flow with a genuinely fresh refresh call.
    recoveryHandlers().onAppForeground()
    await flushAsync()

    expect(mockFetch).toHaveBeenCalledTimes(2)
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
    // Expired tokens: any connect attempt would immediately hit the refresh
    // fetch, so the fetch spy reliably signals a started connect.
    persistAuthTokens(EXPIRED_TOKENS)
    mockFetch.mockResolvedValue(jsonResponse(200, { ...TOKENS, accessToken: 'access-2' }))

    mocks.startRealtimeRecoverySignals.mockImplementation(
      (handlers: RecoveryHandlers) => {
        handlers.onAppBackground()
        return { ready: Promise.resolve(), stop: () => {} }
      },
    )

    const subscription = subscribe()

    await flushAsync()
    // No futile auth/session request while backgrounded.
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mocks.realtimeSessionCreate).not.toHaveBeenCalled()

    // Foreground recovery starts the flow.
    recoveryHandlers().onAppForeground()
    await flushAsync()
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(1)

    subscription.close()
  })

  it('defers the initial connect when the subscription starts offline', async () => {
    persistAuthTokens(EXPIRED_TOKENS)
    mockFetch.mockResolvedValue(jsonResponse(200, { ...TOKENS, accessToken: 'access-2' }))

    mocks.startRealtimeRecoverySignals.mockImplementation(
      (handlers: RecoveryHandlers) => {
        handlers.onNetworkOffline()
        return { ready: Promise.resolve(), stop: () => {} }
      },
    )

    const subscription = subscribe()

    await flushAsync()
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mocks.realtimeSessionCreate).not.toHaveBeenCalled()

    // Network recovery starts the flow.
    recoveryHandlers().onNetworkOnline()
    await flushAsync()
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(1)

    subscription.close()
  })

  it('waits for the native initial state snapshot before the first connect', async () => {
    persistAuthTokens(EXPIRED_TOKENS)
    mockFetch.mockResolvedValue(jsonResponse(200, { ...TOKENS, accessToken: 'access-2' }))

    const readyState: { markReady: (() => void) | null } = { markReady: null }
    const ready = new Promise<void>((resolve) => {
      readyState.markReady = resolve
    })

    mocks.startRealtimeRecoverySignals.mockImplementation(
      (handlers: RecoveryHandlers) => {
        // Native plugin calls resolve asynchronously: the initial offline
        // state is only known after subscribe() has returned. This is the
        // race the recovery ready promise must close.
        void Promise.resolve().then(() => handlers.onNetworkOffline())
        return { ready, stop: () => {} }
      },
    )

    const subscription = subscribe()

    await flushAsync()
    // The initial snapshot is still pending: no auth/session request may be
    // started while the gate is unknown.
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mocks.realtimeSessionCreate).not.toHaveBeenCalled()

    readyState.markReady?.()
    await flushAsync()
    // The snapshot reported offline: the first connect is gated, not started.
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mocks.realtimeSessionCreate).not.toHaveBeenCalled()

    // Network recovery starts the flow.
    recoveryHandlers().onNetworkOnline()
    await flushAsync()
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(1)

    subscription.close()
  })

  it('waits for the native app-state snapshot before the first connect', async () => {
    persistAuthTokens(EXPIRED_TOKENS)
    mockFetch.mockResolvedValue(jsonResponse(200, { ...TOKENS, accessToken: 'access-2' }))

    const readyState: { markReady: (() => void) | null } = { markReady: null }
    const ready = new Promise<void>((resolve) => {
      readyState.markReady = resolve
    })

    mocks.startRealtimeRecoverySignals.mockImplementation(
      (handlers: RecoveryHandlers) => {
        // The initial app state (e.g. already backgrounded) is reported
        // asynchronously on native, after subscribe() has returned.
        void Promise.resolve().then(() => handlers.onAppBackground())
        return { ready, stop: () => {} }
      },
    )

    const subscription = subscribe()

    await flushAsync()
    expect(mockFetch).not.toHaveBeenCalled()

    readyState.markReady?.()
    await flushAsync()
    // Backgrounded from the start: still no futile auth/session request.
    expect(mockFetch).not.toHaveBeenCalled()
    expect(mocks.realtimeSessionCreate).not.toHaveBeenCalled()

    // Foreground recovery starts the flow.
    recoveryHandlers().onAppForeground()
    await flushAsync()
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mocks.realtimeSessionCreate).toHaveBeenCalledTimes(1)

    subscription.close()
  })
})
