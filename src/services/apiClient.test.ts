/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
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

    await expect(refreshAuthTokens()).rejects.toMatchObject({ status: 401 })

    expect(getStoredAuthTokens()).toBeNull()
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
