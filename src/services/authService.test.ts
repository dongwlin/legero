/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authService } from './authService'

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
}))

vi.mock('./apiClient', async (importOriginal) => {
  const module = await importOriginal<typeof import('./apiClient')>()

  return {
    ...module,
    apiRequest: mocks.apiRequest,
  }
})

describe('authService.bootstrap', () => {
  beforeEach(() => {
    mocks.apiRequest.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('passes the cancellation signal through to the protected bootstrap request', async () => {
    const response = {
      user: { id: 'u1', phone: '13800000001', role: 'owner' as const },
      workspace: { id: 'w1', name: '测试门店' },
      permissions: [],
      activeOrders: [],
      serverTime: '2025-01-01T00:00:00+08:00',
    }
    const controller = new AbortController()
    mocks.apiRequest.mockResolvedValueOnce(response)

    await expect(authService.bootstrap(controller.signal)).resolves.toEqual(
      response,
    )

    expect(mocks.apiRequest).toHaveBeenCalledWith({
      path: '/api/bootstrap',
      auth: true,
      signal: controller.signal,
    })
  })
})
