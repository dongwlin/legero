/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUTH_REFRESH_TIMEOUT_MS,
  apiRequest,
  clearStoredAuthTokens,
  getStoredAuthTokens,
  persistAuthTokens,
  refreshAuthTokens,
} from './apiClient'
import { setStoredApiBaseUrl } from './apiConfig'

const BASE_URL = 'http://localhost:8080'

const TOKENS = {
  accessToken: 'access-1',
  tokenType: 'Bearer',
  accessTokenExpiresAt: '2099-01-01T00:00:00.000Z',
  refreshToken: 'refresh-1',
  refreshTokenExpiresAt: '2099-01-01T00:00:00.000Z',
}

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const mockFetch = vi.fn()

describe('refreshAuthTokens error classification', () => {
  beforeEach(() => {
    localStorage.clear()
    setStoredApiBaseUrl(BASE_URL)
    persistAuthTokens(TOKENS)
    mockFetch.mockReset()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    clearStoredAuthTokens()
  })

  it('keeps stored tokens when the refresh request fails with a network error', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(refreshAuthTokens()).rejects.toThrow('Failed to fetch')

    expect(getStoredAuthTokens()).toEqual(TOKENS)
  })

  it('keeps stored tokens when the refresh endpoint returns a 5xx', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(500, { error: { code: 'internal_error', message: 'boom' } }),
    )

    await expect(refreshAuthTokens()).rejects.toMatchObject({ status: 500 })

    expect(getStoredAuthTokens()).toEqual(TOKENS)
  })

  it('clears stored tokens when the refresh endpoint rejects the refresh token with 401', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(401, {
        error: { code: 'refresh_token_expired', message: 'refresh token has expired' },
      }),
    )

    await expect(refreshAuthTokens()).rejects.toMatchObject({
      status: 401,
      code: 'refresh_token_expired',
    })

    expect(getStoredAuthTokens()).toBeNull()
  })

  it('clears stored tokens when the refresh endpoint rejects a malformed refresh token with 401 unauthorized', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(401, { error: { code: 'unauthorized', message: 'invalid token' } }),
    )

    await expect(refreshAuthTokens()).rejects.toMatchObject({
      status: 401,
      code: 'unauthorized',
    })

    expect(getStoredAuthTokens()).toBeNull()
  })

  it('keeps stored tokens when the refresh endpoint returns an unrelated 401', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(401, { error: { code: 'access_denied', message: 'denied by gateway' } }),
    )

    await expect(refreshAuthTokens()).rejects.toMatchObject({
      status: 401,
      code: 'access_denied',
    })

    expect(getStoredAuthTokens()).toEqual(TOKENS)
  })

  it('persists the rotated token pair on success', async () => {
    const next = { ...TOKENS, accessToken: 'access-2', refreshToken: 'refresh-2' }
    mockFetch.mockResolvedValueOnce(jsonResponse(200, next))

    await expect(refreshAuthTokens()).resolves.toEqual(next)

    expect(getStoredAuthTokens()).toEqual(next)
  })

  it('single-flights concurrent refresh calls', async () => {
    const next = { ...TOKENS, accessToken: 'access-2' }
    mockFetch.mockResolvedValueOnce(jsonResponse(200, next))

    const [first, second] = await Promise.all([
      refreshAuthTokens(),
      refreshAuthTokens(),
    ])

    expect(first).toEqual(next)
    expect(second).toEqual(next)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})

describe('apiRequest token_expired refresh flow', () => {
  beforeEach(() => {
    localStorage.clear()
    setStoredApiBaseUrl(BASE_URL)
    persistAuthTokens(TOKENS)
    mockFetch.mockReset()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    clearStoredAuthTokens()
  })

  it('does not clear stored tokens when the retry refresh fails transiently', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse(401, {
          error: { code: 'token_expired', message: 'access token has expired' },
        }),
      )
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(
      apiRequest({ path: '/api/bootstrap', auth: true }),
    ).rejects.toThrow('Failed to fetch')

    expect(getStoredAuthTokens()).toEqual(TOKENS)
  })

  it('clears stored tokens when the retry refresh definitively rejects the refresh token', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse(401, {
          error: { code: 'token_expired', message: 'access token has expired' },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(401, {
          error: { code: 'refresh_token_expired', message: 'refresh token has expired' },
        }),
      )

    await expect(
      apiRequest({ path: '/api/bootstrap', auth: true }),
    ).rejects.toMatchObject({ status: 401 })

    expect(getStoredAuthTokens()).toBeNull()
  })

  it('clears stored tokens when the retry refresh rejects a malformed refresh token with 401 unauthorized', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse(401, {
          error: { code: 'token_expired', message: 'access token has expired' },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(401, { error: { code: 'unauthorized', message: 'invalid token' } }),
      )

    await expect(
      apiRequest({ path: '/api/bootstrap', auth: true }),
    ).rejects.toMatchObject({ status: 401, code: 'unauthorized' })

    expect(getStoredAuthTokens()).toBeNull()
  })

  it('keeps stored tokens when an in-flight refresh returns an unrelated 401', async () => {
    localStorage.clear()
    persistAuthTokens({
      ...TOKENS,
      accessTokenExpiresAt: '2000-01-01T00:00:00.000Z',
    })
    mockFetch.mockResolvedValueOnce(
      jsonResponse(401, { error: { code: 'access_denied', message: 'denied by gateway' } }),
    )

    await expect(
      apiRequest({ path: '/api/bootstrap', auth: true }),
    ).rejects.toMatchObject({ status: 401, code: 'access_denied' })

    expect(getStoredAuthTokens()).not.toBeNull()
  })

  it('keeps stored tokens when a protected request returns a non-credential 401', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(401, {
        error: { code: 'realtime_session_invalid', message: 'realtime session is invalid' },
      }),
    )

    await expect(
      apiRequest({ path: '/api/realtime/session', auth: true, method: 'POST' }),
    ).rejects.toMatchObject({ status: 401, code: 'realtime_session_invalid' })

    expect(getStoredAuthTokens()).toEqual(TOKENS)
  })

  it('retries the original request with the fresh access token after a successful refresh', async () => {
    const next = { ...TOKENS, accessToken: 'access-2' }
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse(401, {
          error: { code: 'token_expired', message: 'access token has expired' },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, next))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          user: { id: 'u1', phone: '13800000001', role: 'owner' },
          workspace: { id: 'w1', name: '测试门店' },
          permissions: [],
          activeOrders: [],
          serverTime: '2025-01-01T00:00:00+08:00',
        }),
      )

    const result = await apiRequest<{ user: { id: string } }>({
      path: '/api/bootstrap',
      auth: true,
    })

    expect(result.user.id).toBe('u1')
    expect(getStoredAuthTokens()).toEqual(next)
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })
})

describe('refreshAuthTokens timeout', () => {
  beforeEach(() => {
    localStorage.clear()
    setStoredApiBaseUrl(BASE_URL)
    persistAuthTokens(TOKENS)
    mockFetch.mockReset()
    vi.stubGlobal('fetch', mockFetch)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    clearStoredAuthTokens()
  })

  const hangingFetch = (signal?: AbortSignal | null) =>
    new Promise<Response>((_resolve, reject) => {
      signal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'))
      })
    })

  it('aborts a hung refresh fetch after the timeout and keeps the stored tokens', async () => {
    mockFetch.mockImplementation((_url: string, init?: RequestInit) =>
      hangingFetch(init?.signal),
    )

    const refresh = refreshAuthTokens()
    // Attach the rejection matcher up front: the abort fires while the fake
    // timers advance, and a late handler would surface as an unhandled
    // rejection.
    const refreshResult = expect(refresh).rejects.toMatchObject({
      name: 'AbortError',
    })

    await vi.advanceTimersByTimeAsync(AUTH_REFRESH_TIMEOUT_MS - 1)
    expect(mockFetch).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(1)
    await refreshResult

    // An abort is transient: the stored tokens must survive so the session
    // can be restored once connectivity returns.
    expect(getStoredAuthTokens()).toEqual(TOKENS)
  })

  it('releases the single-flight slot on abort so the next call starts a fresh refresh', async () => {
    mockFetch.mockImplementation((_url: string, init?: RequestInit) =>
      hangingFetch(init?.signal),
    )

    const first = refreshAuthTokens()
    const firstResult = expect(first).rejects.toMatchObject({
      name: 'AbortError',
    })
    await vi.advanceTimersByTimeAsync(AUTH_REFRESH_TIMEOUT_MS)
    await firstResult

    // Without the slot being cleared, this second call would return the same
    // hung promise and never see the server again.
    mockFetch.mockResolvedValueOnce(
      jsonResponse(200, { ...TOKENS, accessToken: 'access-2' }),
    )

    const second = await refreshAuthTokens()
    expect(second.accessToken).toBe('access-2')
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('does not abort a refresh that settled before the timeout', async () => {
    let signal: AbortSignal | null | undefined
    mockFetch.mockImplementation((_url: string, init?: RequestInit) => {
      signal = init?.signal
      return Promise.resolve(
        jsonResponse(200, { ...TOKENS, accessToken: 'access-2' }),
      )
    })

    await expect(refreshAuthTokens()).resolves.toMatchObject({
      accessToken: 'access-2',
    })
    expect(signal?.aborted).toBe(false)

    await vi.advanceTimersByTimeAsync(AUTH_REFRESH_TIMEOUT_MS * 2)
    expect(signal?.aborted).toBe(false)
  })
})

