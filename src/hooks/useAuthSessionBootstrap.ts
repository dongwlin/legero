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
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string }

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }

  // DOMException (including browser fetch AbortError) is not guaranteed to
  // inherit from Error, but still carries the useful network failure message.
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message
  }

  return 'Failed to resolve workspace access.'
}

const isMissingWorkspaceError = (error: unknown): boolean =>
  error instanceof ApiError && error.code === 'workspace_not_found'

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AbortError'

const waitForRetry = (durationMs: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs)
  })

// Single-flight: concurrent workspace refresh requests share one in-flight API
// call, so automatic retries and manual re-checks never issue duplicates. The
// controller belongs to the flight rather than to a caller: cancelling the
// current bootstrap must invalidate the whole shared request for every caller.
type InFlightWorkspaceRefresh = {
  controller: AbortController
  promise: Promise<WorkspaceRefreshOutcome>
}

let inFlightRefresh: InFlightWorkspaceRefresh | null = null

const runWorkspaceRefresh = async (): Promise<WorkspaceRefreshOutcome> => {
  if (inFlightRefresh) {
    return inFlightRefresh.promise
  }

  const controller = new AbortController()
  const run: Promise<WorkspaceRefreshOutcome> = (async () => {
    try {
      const result = await authService.bootstrap(controller.signal)
      return { kind: 'authenticated', result }
    } catch (error) {
      // Only an abort raised by this workspace request is a user cancellation.
      // The auth client has its own refresh timeout/controller; that timeout
      // also surfaces as AbortError but should remain a retryable network
      // failure with its original message.
      if (controller.signal.aborted && isAbortError(error)) {
        return { kind: 'cancelled' }
      }

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

  const flight: InFlightWorkspaceRefresh = { controller, promise: run }
  inFlightRefresh = flight

  // Do not await this cleanup promise: `run` converts request failures into a
  // typed outcome, and keeping the identity check here ensures an old
  // aborted flight can never clear a newer flight's single-flight slot.
  void run.then(
    () => {
      if (inFlightRefresh === flight) {
        inFlightRefresh = null
      }
    },
    () => {
      if (inFlightRefresh === flight) {
        inFlightRefresh = null
      }
    },
  )

  return run
}

// Bumped whenever a manual re-check should supersede pending automatic
// retries. Runs that captured an older generation must not apply their
// outcome: a slow automatic attempt could otherwise clobber the session that
// a newer, successful manual re-check already restored.
let workspaceRefreshGeneration = 0

export const AUTHENTICATION_INITIALIZATION_CANCELLED_ERROR =
  '已取消认证初始化，请检查服务器配置，或填写手机号和密码登录。'

const invalidatePendingWorkspaceRefresh = () => {
  workspaceRefreshGeneration += 1

  const flight = inFlightRefresh
  // Release the slot before aborting. Some fetch implementations reject the
  // old promise synchronously, and the next refresh must never observe it.
  inFlightRefresh = null
  flight?.controller.abort()
}

export const cancelPendingWorkspaceRefresh = () => {
  invalidatePendingWorkspaceRefresh()
}

export const cancelAuthenticationInitialization = () => {
  invalidatePendingWorkspaceRefresh()
  useAuthStore
    .getState()
    .setWorkspaceError(AUTHENTICATION_INITIALIZATION_CANCELLED_ERROR)
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
      case 'cancelled':
        setWorkspaceError(AUTHENTICATION_INITIALIZATION_CANCELLED_ERROR)
        return 'error'
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
      // A changed apiBaseUrl means any in-flight workspace refresh belongs to
      // the previous server: bump the generation so a stale outcome cannot
      // restore user/workspace/order state from a server that is no longer
      // current (e.g. after probing, selecting, or deleting another server).
      invalidatePendingWorkspaceRefresh()
    }
  }, [
    apiBaseUrl,
    refreshWorkspaceAccess,
    resetSyncState,
    setAnonymous,
    setWorkspaceError,
  ])
}
