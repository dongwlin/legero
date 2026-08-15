/* @vitest-environment jsdom */

import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/services/apiClient'
import { useAuthStore } from '@/store/auth'
import { useAuthSessionBootstrap } from './useAuthSessionBootstrap'

const mocks = vi.hoisted(() => ({
  bootstrap: vi.fn(),
  hasStoredAuthTokens: vi.fn(),
}))

vi.mock('@/services/authService', () => ({
  authService: {
    bootstrap: mocks.bootstrap,
  },
}))

vi.mock('@/services/apiClient', () => ({
  API_CONFIGURATION_ERROR: 'api configuration error',
  ApiError: class ApiError extends Error {
    status: number
    code: string

    constructor(status: number, code: string, message: string) {
      super(message)
      this.name = 'ApiError'
      this.status = status
      this.code = code
    }
  },
  hasStoredAuthTokens: mocks.hasStoredAuthTokens,
}))

vi.mock('@/hooks/useApiBaseUrl', () => ({
  useApiBaseUrl: () => 'http://localhost:8080',
}))

const resetAuthStore = () => {
  useAuthStore.setState({
    status: 'loading',
    user: null,
    permissions: [],
    serverTime: null,
    workspaceStatus: 'idle',
    activeWorkspace: null,
    errorMessage: null,
  })
}

describe('useAuthSessionBootstrap', () => {
  beforeEach(() => {
    resetAuthStore()
    mocks.bootstrap.mockReset()
    mocks.hasStoredAuthTokens.mockReset().mockReturnValue(true)
  })

  afterEach(() => {
    cleanup()
  })

  it('keeps the session instead of falling back to anonymous after repeated transient failures', async () => {
    mocks.bootstrap.mockRejectedValue(new Error('Failed to fetch'))

    renderHook(() => useAuthSessionBootstrap())

    await waitFor(
      () => {
        expect(mocks.bootstrap).toHaveBeenCalledTimes(3)
      },
      { timeout: 5_000 },
    )

    // Stored tokens remain; the session is left in a retryable error state
    // instead of being downgraded to anonymous.
    expect(useAuthStore.getState().status).toBe('loading')
    expect(useAuthStore.getState().workspaceStatus).toBe('error')
    expect(useAuthStore.getState().errorMessage).toBe('Failed to fetch')
  })

  it('falls back to anonymous when the session is definitively rejected with 401', async () => {
    mocks.bootstrap.mockRejectedValue(
      new ApiError(401, 'refresh_token_expired', 'refresh token has expired'),
    )

    renderHook(() => useAuthSessionBootstrap())

    await waitFor(() => {
      expect(useAuthStore.getState().status).toBe('anonymous')
    })

    expect(mocks.bootstrap).toHaveBeenCalledTimes(1)
  })
})
