/* @vitest-environment jsdom */

import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '../../tests/mocks/server'
import {
  apiRequest,
  clearStoredAuthTokens,
  getStoredAuthTokens,
  persistAuthTokens,
} from '@/services/apiClient'
import { clearStoredApiBaseUrl, setStoredApiBaseUrl } from '@/services/apiConfig'

const BASE_URL = 'http://api-client.test'
const TOKENS = {
  accessToken: 'access-original',
  tokenType: 'Bearer',
  accessTokenExpiresAt: '2099-01-01T00:00:00.000Z',
  refreshToken: 'refresh-original',
  refreshTokenExpiresAt: '2099-02-01T00:00:00.000Z',
}
const ROTATED_TOKENS = {
  ...TOKENS,
  accessToken: 'access-rotated',
  refreshToken: 'refresh-rotated',
}

const expiredResponse = () => HttpResponse.json(
  { error: { code: 'token_expired', message: 'Access token expired' } },
  { status: 401 },
)

beforeEach(() => {
  setStoredApiBaseUrl(BASE_URL)
  persistAuthTokens(TOKENS)
})

afterEach(() => {
  clearStoredAuthTokens()
  clearStoredApiBaseUrl()
})

describe('API client HTTP authentication contract', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s is replayed once with the same payload and a rotated token', async (method) => {
    const requests: { method: string; body: unknown; authorization: string | null; key: string | null }[] = []
    const refreshRequests: unknown[] = []
    const body = { expectedVersion: 7, note: '不要葱', totalPriceCents: 1350 }
    server.use(
      http.all(`${BASE_URL}/api/orders/order-1`, async ({ request }) => {
        requests.push({
          method: request.method,
          body: await request.json(),
          authorization: request.headers.get('Authorization'),
          key: request.headers.get('Idempotency-Key'),
        })
        return requests.length === 1
          ? expiredResponse()
          : HttpResponse.json({ item: { id: 'order-1', version: 8 } })
      }),
      http.post(`${BASE_URL}/api/auth/refresh`, async ({ request }) => {
        refreshRequests.push(await request.json())
        return HttpResponse.json(ROTATED_TOKENS)
      }),
    )

    await expect(apiRequest({
      path: '/api/orders/order-1', method, body, auth: true,
      headers: { 'Idempotency-Key': 'order-change-1' },
    })).resolves.toEqual({ item: { id: 'order-1', version: 8 } })

    expect(requests).toEqual([
      { method, body, authorization: 'Bearer access-original', key: 'order-change-1' },
      { method, body, authorization: 'Bearer access-rotated', key: 'order-change-1' },
    ])
    expect(refreshRequests).toEqual([{ refreshToken: 'refresh-original' }])
    expect(getStoredAuthTokens()).toEqual(ROTATED_TOKENS)
  })

  it('concurrent expired requests share one refresh and both receive their own response', async () => {
    let releaseRefresh!: () => void
    const refreshReady = new Promise<void>((resolve) => { releaseRefresh = resolve })
    const authorizations: (string | null)[] = []
    let refreshCount = 0
    server.use(
      http.get(`${BASE_URL}/api/orders/:id`, ({ request, params }) => {
        const authorization = request.headers.get('Authorization')
        authorizations.push(authorization)
        return authorization === 'Bearer access-original'
          ? expiredResponse()
          : HttpResponse.json({ id: params.id })
      }),
      http.post(`${BASE_URL}/api/auth/refresh`, async () => {
        refreshCount += 1
        await refreshReady
        return HttpResponse.json(ROTATED_TOKENS)
      }),
    )

    const results = Promise.all([
      apiRequest({ path: '/api/orders/first', auth: true }),
      apiRequest({ path: '/api/orders/second', auth: true }),
    ])
    try {
      await vi.waitFor(() => {
        expect(authorizations).toEqual(['Bearer access-original', 'Bearer access-original'])
        expect(refreshCount).toBe(1)
      })
    } finally {
      releaseRefresh()
    }

    await expect(results).resolves.toEqual([{ id: 'first' }, { id: 'second' }])
    expect(refreshCount).toBe(1)
    expect(authorizations.slice(2)).toEqual(['Bearer access-rotated', 'Bearer access-rotated'])
  })

  it.each(['token_expired', 'unauthorized'])('ends the session when the replay returns %s without another refresh', async (code) => {
    let requestCount = 0
    let refreshCount = 0
    server.use(
      http.get(`${BASE_URL}/api/bootstrap`, () => {
        requestCount += 1
        return requestCount === 1
          ? expiredResponse()
          : HttpResponse.json({ error: { code, message: 'Session rejected' } }, { status: 401 })
      }),
      http.post(`${BASE_URL}/api/auth/refresh`, () => {
        refreshCount += 1
        return HttpResponse.json(ROTATED_TOKENS)
      }),
    )

    await expect(apiRequest({ path: '/api/bootstrap', auth: true }))
      .rejects.toMatchObject({ status: 401, code })

    expect(requestCount).toBe(2)
    expect(refreshCount).toBe(1)
    expect(getStoredAuthTokens()).toBeNull()
  })

  it.each([
    { name: 'an unknown server failure', response: () => HttpResponse.json({ error: { code: 'internal_error', message: 'Try later' } }, { status: 503 }) },
    { name: 'a network failure', response: () => HttpResponse.error() },
    { name: 'a permission denial', response: () => HttpResponse.json({ error: { code: 'forbidden', message: 'No permission' } }, { status: 403 }) },
  ])('does not repeat a write after $name and preserves the session', async ({ response }) => {
    let requestCount = 0
    let refreshCount = 0
    server.use(
      http.post(`${BASE_URL}/api/orders`, () => {
        requestCount += 1
        return response()
      }),
      http.post(`${BASE_URL}/api/auth/refresh`, () => {
        refreshCount += 1
        return HttpResponse.json(ROTATED_TOKENS)
      }),
    )

    await expect(apiRequest({ path: '/api/orders', method: 'POST', body: { note: '新订单' }, auth: true }))
      .rejects.toBeInstanceOf(Error)

    expect(requestCount).toBe(1)
    expect(refreshCount).toBe(0)
    expect(getStoredAuthTokens()).toEqual(TOKENS)
  })

  it('does not send stored credentials on a public request', async () => {
    let authorization: string | null | undefined
    server.use(http.get(`${BASE_URL}/healthz`, ({ request }) => {
      authorization = request.headers.get('Authorization')
      return HttpResponse.json({ status: 'ok' })
    }))

    await expect(apiRequest({ path: '/healthz' })).resolves.toEqual({ status: 'ok' })
    expect(authorization).toBeNull()
  })

  it('does not replay a cancelled request after its shared refresh completes', async () => {
    const controller = new AbortController()
    let refreshStarted!: () => void
    let releaseRefresh!: () => void
    const started = new Promise<void>((resolve) => { refreshStarted = resolve })
    const ready = new Promise<void>((resolve) => { releaseRefresh = resolve })
    let requestCount = 0
    server.use(
      http.get(`${BASE_URL}/api/bootstrap`, () => {
        requestCount += 1
        return expiredResponse()
      }),
      http.post(`${BASE_URL}/api/auth/refresh`, async () => {
        refreshStarted()
        await ready
        return HttpResponse.json(ROTATED_TOKENS)
      }),
    )

    const result = apiRequest({ path: '/api/bootstrap', auth: true, signal: controller.signal })
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' })
    await started
    controller.abort()
    releaseRefresh()
    await rejected

    expect(requestCount).toBe(1)
    expect(getStoredAuthTokens()).toEqual(ROTATED_TOKENS)
  })
})
