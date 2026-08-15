/* @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/services/apiClient'
import { useAuthStore } from '@/store/auth'
import {
  cancelPendingWorkspaceRefresh,
  useAuthSessionBootstrap,
  useRefreshWorkspaceAccess,
} from './useAuthSessionBootstrap'

const bootstrapResult = {
  user: { id: 'u1', phone: '13800000001', role: 'owner' as const },
  workspace: { id: 'w1', name: '测试门店' },
  permissions: [],
  activeOrders: [],
  serverTime: '2025-01-01T00:00:00+08:00',
}

const mocks = vi.hoisted(() => ({
  apiBaseUrl: 'http://server-a.test',
  bootstrap: vi.fn(),
  hasStoredAuthTokens: vi.fn(),
}))

vi.mock('@/services/authService', () => ({
  authService: {
    bootstrap: mocks.bootstrap,
  },
}))

vi.mock('@/services/apiClient', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/services/apiClient')>()
  return {
    ...mod,
    hasStoredAuthTokens: mocks.hasStoredAuthTokens,
  }
})

vi.mock('@/hooks/useApiBaseUrl', () => ({
  useApiBaseUrl: () => mocks.apiBaseUrl,
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
    mocks.apiBaseUrl = 'http://server-a.test'
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

  it('falls back to anonymous on 401 unauthorized', async () => {
    mocks.bootstrap.mockRejectedValue(
      new ApiError(401, 'unauthorized', 'invalid token'),
    )

    renderHook(() => useAuthSessionBootstrap())

    await waitFor(() => {
      expect(useAuthStore.getState().status).toBe('anonymous')
    })

    expect(mocks.bootstrap).toHaveBeenCalledTimes(1)
  })

  it('does not fall back to anonymous on a non-credential 401', async () => {
    mocks.bootstrap.mockRejectedValue(
      new ApiError(401, 'access_denied', 'denied by gateway'),
    )

    renderHook(() => useAuthSessionBootstrap())

    await waitFor(
      () => {
        expect(mocks.bootstrap).toHaveBeenCalledTimes(3)
      },
      { timeout: 5_000 },
    )

    // The token stays in place and the session stays retryable: a
    // non-credential 401 must not downgrade the user to anonymous.
    expect(useAuthStore.getState().status).toBe('loading')
    expect(useAuthStore.getState().workspaceStatus).toBe('error')
    expect(useAuthStore.getState().errorMessage).toBe('denied by gateway')
  })

  it('lets a manual re-check supersede the pending automatic retries', async () => {
    // First automatic attempt fails transiently.
    mocks.bootstrap.mockRejectedValueOnce(new Error('Failed to fetch'))
    // Manual re-check succeeds.
    mocks.bootstrap.mockResolvedValueOnce(bootstrapResult)
    // Any further (superseded) automatic attempt would fail.
    mocks.bootstrap.mockRejectedValue(new Error('Failed to fetch'))

    renderHook(() => useAuthSessionBootstrap())

    await waitFor(() => {
      expect(useAuthStore.getState().workspaceStatus).toBe('error')
    })

    const { result: refreshResult } = renderHook(() => useRefreshWorkspaceAccess())

    await act(async () => {
      cancelPendingWorkspaceRefresh()
      await expect(refreshResult.current()).resolves.toBe('authenticated')
    })

    expect(useAuthStore.getState().status).toBe('authenticated')
    expect(useAuthStore.getState().workspaceStatus).toBe('ready')

    // Let the automatic loop's pending retry window elapse: the superseded
    // automatic attempt must not run and must not clobber the session that
    // the manual re-check already restored.
    await new Promise((resolve) => setTimeout(resolve, 1_200))

    expect(useAuthStore.getState().status).toBe('authenticated')
    expect(useAuthStore.getState().workspaceStatus).toBe('ready')
    expect(mocks.bootstrap).toHaveBeenCalledTimes(2)
  })

  it('reuses an in-flight automatic attempt for a manual re-check and discards stale outcomes', async () => {
    let resolveAuto: ((result: typeof bootstrapResult) => void) | undefined
    mocks.bootstrap.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAuto = resolve
        }),
    )
    // The shared in-flight request succeeds.
    mocks.bootstrap.mockResolvedValueOnce(bootstrapResult)

    renderHook(() => useAuthSessionBootstrap())

    await waitFor(() => {
      expect(mocks.bootstrap).toHaveBeenCalledTimes(1)
    })

    const { result: refreshResult } = renderHook(() => useRefreshWorkspaceAccess())

    await act(async () => {
      cancelPendingWorkspaceRefresh()
      const manualPromise = refreshResult.current()
      resolveAuto?.(bootstrapResult)
      await expect(manualPromise).resolves.toBe('authenticated')
    })

    // The manual caller (newest generation) applies the result; the stale
    // automatic caller must not apply its own copy.
    expect(useAuthStore.getState().status).toBe('authenticated')
    expect(useAuthStore.getState().workspaceStatus).toBe('ready')

    // The automatic loop stops on the superseded generation: no further
    // attempts run and the restored session stays intact.
    await new Promise((resolve) => setTimeout(resolve, 1_200))
    expect(mocks.bootstrap).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().status).toBe('authenticated')
    expect(useAuthStore.getState().workspaceStatus).toBe('ready')
  })

  it('discards an in-flight bootstrap outcome when the api base URL changes', async () => {
    let resolveAuto: ((result: typeof bootstrapResult) => void) | undefined
    mocks.bootstrap.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAuto = resolve
        }),
    )

    const { rerender } = renderHook(() => useAuthSessionBootstrap())

    await waitFor(() => {
      expect(mocks.bootstrap).toHaveBeenCalledTimes(1)
    })

    // Switch to another server: ApiBaseUrlForm.resetSession clears the
    // session, and the old server's in-flight bootstrap must become stale.
    mocks.hasStoredAuthTokens.mockReturnValue(false)
    mocks.apiBaseUrl = 'http://server-b.test'

    await act(async () => {
      rerender()
    })

    expect(useAuthStore.getState().status).toBe('anonymous')

    // The old server's request finally succeeds — it must not restore its
    // authenticated context under the now-current server.
    await act(async () => {
      resolveAuto?.(bootstrapResult)
      await Promise.resolve()
    })

    expect(useAuthStore.getState().status).toBe('anonymous')
    expect(useAuthStore.getState().activeWorkspace).toBeNull()
    expect(mocks.bootstrap).toHaveBeenCalledTimes(1)
  })
})
