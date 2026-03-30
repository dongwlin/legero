import { useCallback, useEffect } from 'react'
import {
  API_CONFIGURATION_ERROR,
  ApiError,
  hasStoredAuthTokens,
} from '@/services/apiClient'
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

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Failed to resolve workspace access.'

const isUnauthorizedError = (error: unknown): boolean =>
  error instanceof ApiError && error.status === 401

const isMissingWorkspaceError = (error: unknown): boolean =>
  error instanceof ApiError && error.code === 'workspace_not_found'

const waitForRetry = (durationMs: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs)
  })

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
    setWorkspaceLoading()
    resetSyncState()

    try {
      const result = await authService.bootstrap()
      rememberPhone(result.user.phone)
      setAuthenticatedContext(result)
      setOrders(result.activeOrders.map(orderDtoToOrderRecord))
      return 'authenticated'
    } catch (error) {
      if (isUnauthorizedError(error)) {
        setAnonymous()
        return 'anonymous'
      }

      if (isMissingWorkspaceError(error)) {
        setNoWorkspaceAccess('当前账号尚未加入任何工作区。')
        return 'no_access'
      }

      setWorkspaceError(getErrorMessage(error))
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

      for (let attempt = 1; attempt <= SESSION_BOOTSTRAP_MAX_ATTEMPTS; attempt += 1) {
        const result = await refreshWorkspaceAccess()

        if (cancelled) {
          return
        }

        if (result !== 'error') {
          return
        }

        if (attempt === SESSION_BOOTSTRAP_MAX_ATTEMPTS) {
          setAnonymous()
          resetSyncState()
          return
        }

        await waitForRetry(SESSION_BOOTSTRAP_RETRY_DELAY_MS)

        if (cancelled) {
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
