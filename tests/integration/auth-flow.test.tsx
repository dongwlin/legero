/* @vitest-environment jsdom */

import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearStoredApiBaseUrl, setStoredApiBaseUrl } from '@/services/apiConfig'
import {
  clearStoredAuthTokens,
  getStoredAuthTokens,
  persistAuthTokens,
} from '@/services/apiClient'
import { useAuthStore } from '@/store/auth'
import { useOrderStore } from '@/store/order'
import { renderWithApp } from '../render'
import {
  createBootstrapResponse,
  createLoginResponse,
  TEST_API_BASE_URL,
  TEST_TOKENS,
  TEST_USER,
  TEST_WORKSPACE,
} from '../mocks/handlers'
import { latestTestWebSocket, resetTestWebSockets, TestWebSocket } from '../mocks/websocket'
import { TestResizeObserver } from '../mocks/resizeObserver'
import { server } from '../mocks/server'

const resetStores = () => {
  useAuthStore.setState({
    status: 'loading',
    user: null,
    permissions: [],
    serverTime: null,
    workspaceStatus: 'idle',
    activeWorkspace: null,
    errorMessage: null,
  })
  useOrderStore.setState({
    ordersById: {},
    orderDisplayIds: [],
    filter: 'all',
    updateTargetID: '',
    isQuickCalcMode: false,
    quickCalcSelectedOrderIds: [],
    lastHydratedAt: null,
    status: 'idle',
    errorMessage: null,
    orderSyncSeq: 0,
  })
}

const installRealtimeHandlers = () => {
  server.use(
    http.post(`${TEST_API_BASE_URL}/api/realtime/session`, () =>
      HttpResponse.json({
        ticket: 'ticket-1',
        expiresAt: '2099-01-01T00:00:00.000Z',
      }),
    ),
    http.get(`${TEST_API_BASE_URL}/api/orders`, () =>
      HttpResponse.json({ items: [], nextCursor: null }),
    ),
  )
}

const releaseOnDemand = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return { promise, resolve, reject }
}

describe('认证与受保护路由页面集成', () => {
  beforeEach(() => {
    localStorage.clear()
    clearStoredApiBaseUrl()
    clearStoredAuthTokens()
    setStoredApiBaseUrl(TEST_API_BASE_URL)
    resetStores()
    resetTestWebSockets()
    vi.stubGlobal('WebSocket', TestWebSocket)
    vi.stubGlobal('ResizeObserver', TestResizeObserver)
  })

  afterEach(() => {
    for (const socket of TestWebSocket.instances) {
      socket.close()
    }
    resetTestWebSockets()
    vi.unstubAllGlobals()
  })

  it('提交有效凭据后通过真实 API 链路进入首页', async () => {
    let loginPayload: Record<string, unknown> | undefined

    server.use(
      http.post(`${TEST_API_BASE_URL}/api/auth/login`, async ({ request }) => {
        loginPayload = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(createLoginResponse())
      }),
    )
    installRealtimeHandlers()

    const user = userEvent.setup()
    const { router } = renderWithApp({ initialEntries: ['/auth'] })

    await user.type(screen.getByLabelText('手机号'), TEST_USER.phone)
    await user.type(screen.getByLabelText('密码'), 'test-password-123')
    await user.click(screen.getByRole('button', { name: '登录' }))

    expect(await screen.findByText('Legero')).toBeVisible()
    expect(router.state.location.pathname).toBe('/')
    expect(loginPayload).toEqual({
      phone: TEST_USER.phone,
      password: 'test-password-123',
    })
    expect(useAuthStore.getState().activeWorkspace).toEqual({
      id: TEST_WORKSPACE.id,
      name: TEST_WORKSPACE.name,
      role: TEST_USER.role,
    })
    expect(getStoredAuthTokens()?.accessToken).toBe(TEST_TOKENS.accessToken)
  })

  it('恢复已保存会话时先显示加载状态，再展示受保护首页', async () => {
    const bootstrapGate = releaseOnDemand<void>()

    server.use(
      http.get(`${TEST_API_BASE_URL}/api/bootstrap`, async () => {
        await bootstrapGate.promise
        return HttpResponse.json(createBootstrapResponse())
      }),
    )
    installRealtimeHandlers()
    persistAuthTokens(TEST_TOKENS)

    const { router } = renderWithApp({ initialEntries: ['/'] })

    expect(screen.getByText('正在恢复登录状态')).toBeVisible()
    expect(screen.queryByText('Legero')).toBeNull()

    bootstrapGate.resolve()

    expect(await screen.findByText('Legero')).toBeVisible()
    expect(router.state.location.pathname).toBe('/')
    expect(useAuthStore.getState().status).toBe('authenticated')
    expect(useAuthStore.getState().workspaceStatus).toBe('ready')
  })

  it('恢复会话收到失效凭据后清除令牌并回到登录页', async () => {
    server.use(
      http.get(`${TEST_API_BASE_URL}/api/bootstrap`, () =>
        HttpResponse.json(
          { error: { code: 'token_expired', message: '会话已过期。' } },
          { status: 401 },
        ),
      ),
      http.post(`${TEST_API_BASE_URL}/api/auth/refresh`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'refresh_token_expired',
              message: '刷新令牌已过期。',
            },
          },
          { status: 401 },
        ),
      ),
    )
    persistAuthTokens(TEST_TOKENS)

    const { router } = renderWithApp({ initialEntries: ['/'] })

    expect(await screen.findByText('账号认证')).toBeVisible()
    expect(router.state.location.pathname).toBe('/auth')
    expect(getStoredAuthTokens()).toBeNull()
    expect(useAuthStore.getState().status).toBe('anonymous')
  })

  it('恢复会话发现账号未加入工作区时显示可恢复提示而非永久加载', async () => {
    server.use(
      http.get(`${TEST_API_BASE_URL}/api/bootstrap`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'workspace_not_found',
              message: 'workspace not found',
            },
          },
          { status: 404 },
        ),
      ),
    )
    persistAuthTokens(TEST_TOKENS)

    const { router } = renderWithApp({ initialEntries: ['/'] })

    expect(await screen.findByText('当前账号尚未加入工作区')).toBeVisible()
    expect(screen.getByRole('button', { name: '重新检查权限' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '退出登录' })).toBeEnabled()
    expect(screen.queryByText('正在恢复登录状态')).toBeNull()
    expect(router.state.location.pathname).toBe('/auth')
  })

  it('在设置页退出登录后清除会话并离开受保护路由', async () => {
    useAuthStore.setState({
      status: 'authenticated',
      user: TEST_USER,
      permissions: ['orders:read', 'orders:write'],
      serverTime: '2026-09-03T02:00:00.000Z',
      workspaceStatus: 'ready',
      activeWorkspace: { ...TEST_WORKSPACE, role: TEST_USER.role },
      errorMessage: null,
    })
    useOrderStore.getState().setOrders([])
    installRealtimeHandlers()
    persistAuthTokens(TEST_TOKENS)

    const user = userEvent.setup()
    const { router } = renderWithApp({
      bootstrap: false,
      initialEntries: ['/settings'],
    })

    expect(await screen.findByText('账号与工作区')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '退出登录' }))

    expect(await screen.findByText('账号认证')).toBeVisible()
    expect(router.state.location.pathname).toBe('/auth')
    expect(getStoredAuthTokens()).toBeNull()
    expect(useAuthStore.getState().status).toBe('anonymous')
  })

  it('受保护订单路由在实时同步失败时不会暴露业务页面', async () => {
    server.use(
      http.post(`${TEST_API_BASE_URL}/api/realtime/session`, () =>
        HttpResponse.json({
          ticket: 'ticket-1',
          expiresAt: '2099-01-01T00:00:00.000Z',
        }),
      ),
      http.get(`${TEST_API_BASE_URL}/api/orders`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'forbidden',
              message: '当前工作区无权访问订单。',
            },
          },
          { status: 403 },
        ),
      ),
    )
    useAuthStore.setState({
      status: 'authenticated',
      user: TEST_USER,
      permissions: [],
      serverTime: '2026-09-03T02:00:00.000Z',
      workspaceStatus: 'ready',
      activeWorkspace: { ...TEST_WORKSPACE, role: TEST_USER.role },
      errorMessage: null,
    })
    persistAuthTokens(TEST_TOKENS)

    const { router } = renderWithApp({
      bootstrap: false,
      initialEntries: ['/order'],
    })

    expect(screen.getByText('正在同步订单')).toBeVisible()
    await waitFor(() => expect(TestWebSocket.instances).toHaveLength(1))
    latestTestWebSocket().open()
    latestTestWebSocket().emit('ready')

    expect(await screen.findByText('订单同步失败')).toBeVisible()
    expect(screen.getByText('当前工作区无权访问订单。')).toBeVisible()
    expect(screen.queryByRole('button', { name: '创建订单' })).toBeNull()
    expect(router.state.location.pathname).toBe('/order')
  })
})
