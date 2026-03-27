import { useCallback, useEffect } from 'react'
import {
  API_CONFIGURATION_ERROR,
  ApiError,
  hasStoredAuthTokens,
} from '@/services/apiClient'
import { useApiBaseUrl } from '@/hooks/useApiBaseUrl'
import { authService } from '@/services/authService'
import { orderDtoToOrderRecord } from '@/services/orderRecordMapper'
import { useAuthStore } from '@/store/auth'
import { useOrderStore } from '@/store/order'

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Failed to resolve workspace access.'

const isUnauthorizedError = (error: unknown): boolean =>
  error instanceof ApiError && error.status === 401

const isMissingWorkspaceError = (error: unknown): boolean =>
  error instanceof ApiError && error.code === 'workspace_not_found'

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

  return useCallback(async () => {
    setWorkspaceLoading()
    resetSyncState()

    try {
      const result = await authService.bootstrap()
      setAuthenticatedContext(result)
      setOrders(result.activeOrders.map(orderDtoToOrderRecord))
    } catch (error) {
      if (isUnauthorizedError(error)) {
        setAnonymous()
        return
      }

      if (isMissingWorkspaceError(error)) {
        setNoWorkspaceAccess('当前账号尚未加入任何工作区。')
        return
      }

      setWorkspaceError(getErrorMessage(error))
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

    void refreshWorkspaceAccess()
  }, [
    apiBaseUrl,
    refreshWorkspaceAccess,
    resetSyncState,
    setAnonymous,
    setWorkspaceError,
  ])
}
