import { useCallback, useEffect } from 'react'
import {
  API_CONFIGURATION_ERROR,
  ApiError,
  hasStoredAuthTokens,
  isInvalidSessionError,
} from '@/services/apiClient'
import type { BootstrapResponse } from '@/services/apiTypes'
import { useApiBaseUrl } from '@/hooks/useApiBaseUrl'
import { authService } from '@/services/authService'
import { orderDtoToOrderRecord } from '@/services/orderRecordMapper'
import { rememberPhone } from '@/services/rememberedPhone'
import { useAuthStore } from '@/store/auth'
import { useOrderStore } from '@/store/order'

const SESSION_BOOTSTRAP_MAX_ATTEMPTS = 3
const SESSION_BOOTSTRAP_RETRY_DELAY_MS = 1_000

type WorkspaceAccessResolution =
  | 'authenticated'
  | 'anonymous'
  | 'no_access'
  | 'error'

type WorkspaceRefreshOutcome =
  | { kind: 'authenticated'; result: BootstrapResponse }
  | { kind: 'unauthorized' }
  | { kind: 'no_access' }
  | { kind: 'error'; message: string }

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Failed to resolve workspace access.'

const isMissingWorkspaceError = (error: unknown): boolean =>
  error instanceof ApiError && error.code === 'workspace_not_found'

const waitForRetry = (durationMs: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs)
  })

// Single-flight: concurrent workspace refresh requests share one in-flight API
// call, so automatic retries and manual re-checks never issue duplicates.
let inFlightRefresh: Promise<WorkspaceRefreshOutcome> | null = null

const runWorkspaceRefresh = async (): Promise<WorkspaceRefreshOutcome> => {
  if (inFlightRefresh) {
    return inFlightRefresh
  }

  const run: Promise<WorkspaceRefreshOutcome> = (async () => {
    try {
      const result = await authService.bootstrap()
      return { kind: 'authenticated', result }
    } catch (error) {
      // Only credential-invalid 401s (same rule as apiClient's token
      // clearing) mean the session is definitively dead; any other 401 is a
      // transient error that must not downgrade the user to anonymous.
      if (isInvalidSessionError(error)) {
        return { kind: 'unauthorized' }
      }

      if (isMissingWorkspaceError(error)) {
        return { kind: 'no_access' }
      }

      return { kind: 'error', message: getErrorMessage(error) }
    }
  })()

  inFlightRefresh = run

  try {
    return await run
  } finally {
    if (inFlightRefresh === run) {
      inFlightRefresh = null
    }
  }
}

// Bumped whenever a manual re-check should supersede pending automatic
// retries. Runs that captured an older generation must not apply their
// outcome: a slow automatic attempt could otherwise clobber the session that
// a newer, successful manual re-check already restored.
let workspaceRefreshGeneration = 0

export const cancelPendingWorkspaceRefresh = () => {
  workspaceRefreshGeneration += 1
}

export const useRefreshWorkspaceAccess = () => {
  const setWorkspaceLoading = useAuthStore((state) => state.setWorkspaceLoading)
  const setAuthenticatedContext = useAuthStore(
    (state) => state.setAuthenticatedContext,
  )
  const setNoWorkspaceAccess = useAuthStore((state) => state.setNoWorkspaceAccess)
  const setWorkspaceError = useAuthStore((state) => state.setWorkspaceError)
  const setAnonymous = useAuthStore((state) => state.setAnonymous)
  const resetSyncState = useOrderStore((state) => state.resetSyncState)
  const setOrders = useOrderStore((state) => state.setOrders)

  return useCallback(async (): Promise<WorkspaceAccessResolution> => {
    const generation = workspaceRefreshGeneration
    setWorkspaceLoading()
    resetSyncState()

    const outcome = await runWorkspaceRefresh()

    // A newer run (e.g. a manual re-check) superseded this one: applying the
    // stale outcome would clobber the already-restored session.
    if (generation !== workspaceRefreshGeneration) {
      return 'error'
    }

    switch (outcome.kind) {
      case 'authenticated':
        rememberPhone(outcome.result.user.phone)
        setAuthenticatedContext(outcome.result)
        setOrders(outcome.result.activeOrders.map(orderDtoToOrderRecord))
        return 'authenticated'
      case 'unauthorized':
        setAnonymous()
        return 'anonymous'
      case 'no_access':
        setNoWorkspaceAccess('当前账号尚未加入任何工作区。')
        return 'no_access'
      case 'error':
        setWorkspaceError(outcome.message)
        return 'error'
    }
  }, [
    setAnonymous,
    setAuthenticatedContext,
    setNoWorkspaceAccess,
    setOrders,
    setWorkspaceError,
    resetSyncState,
    setWorkspaceLoading,
  ])
}

export const useAuthSessionBootstrap = () => {
  const apiBaseUrl = useApiBaseUrl()
  const setAnonymous = useAuthStore((state) => state.setAnonymous)
  const setWorkspaceError = useAuthStore((state) => state.setWorkspaceError)
  const refreshWorkspaceAccess = useRefreshWorkspaceAccess()
  const resetSyncState = useOrderStore((state) => state.resetSyncState)

  useEffect(() => {
    let cancelled = false

    const bootstrapSession = async () => {
      if (!apiBaseUrl) {
        setAnonymous()
        setWorkspaceError(API_CONFIGURATION_ERROR)
        return
      }

      if (!hasStoredAuthTokens()) {
        setAnonymous()
        resetSyncState()
        return
      }

      // A manual re-check bumps the generation; once that happens the
      // automatic loop must stop scheduling further attempts.
      const runGeneration = workspaceRefreshGeneration

      for (let attempt = 1; attempt <= SESSION_BOOTSTRAP_MAX_ATTEMPTS; attempt += 1) {
        if (cancelled || workspaceRefreshGeneration !== runGeneration) {
          return
        }

        const result = await refreshWorkspaceAccess()

        if (cancelled || workspaceRefreshGeneration !== runGeneration) {
          return
        }

        if (result !== 'error') {
          return
        }

        if (attempt === SESSION_BOOTSTRAP_MAX_ATTEMPTS) {
          // Transient failures must not log the user out: stored tokens are
          // still valid, and the workspace error state exposes a retry path
          // once connectivity returns. Only a definitive auth failure
          // (result 'anonymous') clears the session.
          return
        }

        await waitForRetry(SESSION_BOOTSTRAP_RETRY_DELAY_MS)

        if (cancelled || workspaceRefreshGeneration !== runGeneration) {
          return
        }
      }
    }

    void bootstrapSession()

    return () => {
      cancelled = true
    }
  }, [
    apiBaseUrl,
    refreshWorkspaceAccess,
    resetSyncState,
    setAnonymous,
    setWorkspaceError,
  ])
}
