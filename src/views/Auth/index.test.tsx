/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Auth from './index'

const mocks = vi.hoisted(() => ({
  apiBaseUrl: null as string | null,
  authStatus: 'authenticated' as 'loading' | 'authenticated' | 'anonymous',
  cancelAuthenticationInitialization: vi.fn(),
  cancelPendingWorkspaceRefresh: vi.fn(),
  findSavedServer: vi.fn(),
  getRememberedPhone: vi.fn(),
  errorMessage: null as string | null,
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
  workspaceStatus: 'no_access' as
    | 'idle'
    | 'loading'
    | 'ready'
    | 'no_access'
    | 'error',
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
  default: ({
    onHealthStatusChange,
    onResolvedServerChange,
  }: {
    onHealthStatusChange?: (status: 'reachable') => void
    onResolvedServerChange?: (change: {
      reason: 'selected'
      replacedCurrentServer: boolean
      server: { baseUrl: string; phone: string }
    }) => void
  }) => (
    <div>
      api-base-url-form
      <button
        type='button'
        onClick={() => {
          onHealthStatusChange?.('reachable')
          onResolvedServerChange?.({
            reason: 'selected',
            replacedCurrentServer: true,
            server: {
              baseUrl: 'https://selected.example',
              phone: '13900000002',
            },
          })
        }}
      >
        选择测试服务器
      </button>
    </div>
  ),
}))

vi.mock('@/hooks/useApiBaseUrl', () => ({
  useApiBaseUrl: () => mocks.apiBaseUrl,
}))

vi.mock('@/hooks/useAuthSessionBootstrap', () => ({
  cancelAuthenticationInitialization: mocks.cancelAuthenticationInitialization,
  cancelPendingWorkspaceRefresh: mocks.cancelPendingWorkspaceRefresh,
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
        status: 'loading' | 'authenticated' | 'anonymous'
        user: { id: string; phone: string }
        workspaceStatus:
          | 'idle'
          | 'loading'
          | 'ready'
          | 'no_access'
          | 'error'
      },
    ) => unknown,
  ) =>
    selector({
      errorMessage: mocks.errorMessage,
      setAnonymous: mocks.setAnonymous,
      setAuthenticatedContext: mocks.setAuthenticatedContext,
      status: mocks.authStatus,
      user: {
        id: 'user-1',
        phone: '13800001234',
      },
      workspaceStatus: mocks.workspaceStatus,
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
    Object.values(mocks).forEach((mock) => {
      if (typeof mock === 'function') {
        mock.mockReset()
      }
    })
    mocks.apiBaseUrl = null
    mocks.authStatus = 'authenticated'
    mocks.errorMessage = null
    mocks.workspaceStatus = 'no_access'
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

  it('cancels the session recovery loading state', () => {
    mocks.authStatus = 'loading'
    mocks.workspaceStatus = 'loading'

    render(<Auth />)

    fireEvent.click(screen.getByRole('button', { name: '取消' }))

    expect(mocks.cancelAuthenticationInitialization).toHaveBeenCalledTimes(1)
  })

  it('allows password login from the authentication initialization recovery page', async () => {
    mocks.apiBaseUrl = 'https://server.example'
    mocks.authStatus = 'loading'
    mocks.workspaceStatus = 'error'
    mocks.errorMessage = '连接失败'
    mocks.signInWithPassword.mockResolvedValueOnce({
      user: { id: 'user-1', phone: '13800000001', role: 'owner' },
      workspace: { id: 'workspace-1', name: '测试门店' },
      permissions: [],
      activeOrders: [],
      serverTime: '2025-01-01T00:00:00+08:00',
      accessToken: 'access-token',
      tokenType: 'Bearer',
      accessTokenExpiresAt: '2099-01-01T00:00:00.000Z',
      refreshToken: 'refresh-token',
      refreshTokenExpiresAt: '2099-01-01T00:00:00.000Z',
    })

    render(<Auth />)

    fireEvent.change(screen.getByLabelText('手机号'), {
      target: { value: '13800000001' },
    })
    fireEvent.change(screen.getByLabelText('密码'), {
      target: { value: 'password' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: '使用手机号和密码登录' }),
    )

    await waitFor(() => {
      expect(mocks.signInWithPassword).toHaveBeenCalledWith(
        '13800000001',
        'password',
      )
    })
    expect(mocks.cancelPendingWorkspaceRefresh).toHaveBeenCalledTimes(1)
    expect(mocks.setAuthenticatedContext).toHaveBeenCalledTimes(1)
    expect(mocks.setOrders).toHaveBeenCalledTimes(1)
  })

  it('updates credentials and health state when a server is selected on the recovery page', async () => {
    mocks.apiBaseUrl = 'https://old.example'
    mocks.authStatus = 'loading'
    mocks.workspaceStatus = 'error'
    mocks.errorMessage = '连接失败'
    mocks.signInWithPassword.mockResolvedValueOnce({
      user: { id: 'user-1', phone: '13900000002', role: 'owner' },
      workspace: { id: 'workspace-1', name: '测试门店' },
      permissions: [],
      activeOrders: [],
      serverTime: '2025-01-01T00:00:00+08:00',
      accessToken: 'access-token',
      tokenType: 'Bearer',
      accessTokenExpiresAt: '2099-01-01T00:00:00.000Z',
      refreshToken: 'refresh-token',
      refreshTokenExpiresAt: '2099-01-01T00:00:00.000Z',
    })

    render(<Auth />)

    fireEvent.click(screen.getByRole('button', { name: '选择测试服务器' }))

    expect((screen.getByLabelText('手机号') as HTMLInputElement).value).toBe(
      '13900000002',
    )
    expect((screen.getByLabelText('密码') as HTMLInputElement).value).toBe('')

    fireEvent.change(screen.getByLabelText('密码'), {
      target: { value: 'password' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: '使用手机号和密码登录' }),
    )

    await waitFor(() => {
      expect(mocks.signInWithPassword).toHaveBeenCalledWith(
        '13900000002',
        'password',
      )
    })
  })
})
