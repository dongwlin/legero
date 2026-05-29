/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Auth from './index'

const mocks = vi.hoisted(() => ({
  findSavedServer: vi.fn(),
  getRememberedPhone: vi.fn(),
  refreshWorkspaceAccess: vi.fn(),
  rememberPhone: vi.fn(),
  resetSyncState: vi.fn(),
  setAnonymous: vi.fn(),
  setAuthenticatedContext: vi.fn(),
  setOrders: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  toastDanger: vi.fn(),
  upsertSavedServer: vi.fn(),
}))

vi.mock('@heroui/react', () => ({
  Button: {
    Root: ({ children, isDisabled, onPress, ...props }: Record<string, unknown>) => (
      <button
        type='button'
        disabled={Boolean(isDisabled)}
        onClick={() => {
          if (!isDisabled && typeof onPress === 'function') {
            onPress()
          }
        }}
        {...props}
      >
        {children as React.ReactNode}
      </button>
    ),
  },
  Card: {
    Root: ({ children, ...props }: Record<string, unknown>) => <div {...props}>{children as React.ReactNode}</div>,
    Content: ({ children, ...props }: Record<string, unknown>) => (
      <div {...props}>{children as React.ReactNode}</div>
    ),
  },
  Spinner: () => <div>loading</div>,
  toast: {
    danger: mocks.toastDanger,
  },
}))

vi.mock('@/components/ApiBaseUrlForm', () => ({
  __esModule: true,
  default: () => <div>api-base-url-form</div>,
}))

vi.mock('@/hooks/useApiBaseUrl', () => ({
  useApiBaseUrl: () => null,
}))

vi.mock('@/hooks/useAuthSessionBootstrap', () => ({
  useRefreshWorkspaceAccess: () => mocks.refreshWorkspaceAccess,
}))

vi.mock('@/services/authService', () => ({
  authService: {
    signInWithPassword: mocks.signInWithPassword,
    signOut: mocks.signOut,
  },
}))

vi.mock('@/services/apiClient', () => ({
  API_CONFIGURATION_ERROR: 'api configuration error',
}))

vi.mock('@/services/rememberedPhone', () => ({
  getRememberedPhone: mocks.getRememberedPhone,
  rememberPhone: mocks.rememberPhone,
}))

vi.mock('@/services/orderRecordMapper', () => ({
  orderDtoToOrderRecord: vi.fn(),
}))

vi.mock('@/services/savedServers', () => ({
  findSavedServer: mocks.findSavedServer,
  upsertSavedServer: mocks.upsertSavedServer,
}))

vi.mock('@/store/auth', () => ({
  useAuthStore: (
    selector: (
      state: {
        errorMessage: string | null
        setAnonymous: typeof mocks.setAnonymous
        setAuthenticatedContext: typeof mocks.setAuthenticatedContext
        status: 'authenticated'
        user: { id: string; phone: string }
        workspaceStatus: 'no_access'
      },
    ) => unknown,
  ) =>
    selector({
      errorMessage: null,
      setAnonymous: mocks.setAnonymous,
      setAuthenticatedContext: mocks.setAuthenticatedContext,
      status: 'authenticated',
      user: {
        id: 'user-1',
        phone: '13800001234',
      },
      workspaceStatus: 'no_access',
    }),
}))

vi.mock('@/store/order', () => ({
  useOrderStore: (
    selector: (
      state: {
        resetSyncState: typeof mocks.resetSyncState
        setOrders: typeof mocks.setOrders
      },
    ) => unknown,
  ) =>
    selector({
      resetSyncState: mocks.resetSyncState,
      setOrders: mocks.setOrders,
    }),
}))

describe('Auth', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.findSavedServer.mockReturnValue(null)
    mocks.getRememberedPhone.mockReturnValue('')
  })

  afterEach(() => {
    cleanup()
  })

  it('shows sign-out failures as toast without rendering inline error text', async () => {
    mocks.signOut.mockRejectedValueOnce(new Error('退出失败'))

    render(<Auth />)

    fireEvent.click(screen.getByText('退出登录'))

    await waitFor(() => {
      expect(mocks.toastDanger).toHaveBeenCalledWith('退出失败')
    })

    expect(screen.queryByText('退出失败')).toBeNull()
  })
})