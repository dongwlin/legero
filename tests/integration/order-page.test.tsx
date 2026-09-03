/* @vitest-environment jsdom */

import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearStoredApiBaseUrl, setStoredApiBaseUrl } from '@/services/apiConfig'
import { clearStoredAuthTokens, persistAuthTokens } from '@/services/apiClient'
import { useAuthStore } from '@/store/auth'
import { useOrderStore } from '@/store/order'
import { STEP_STATUS } from '@/types/codes'
import { renderWithApp } from '../render'
import {
  createOrderDto,
  TEST_API_BASE_URL,
  TEST_TOKENS,
  TEST_USER,
  TEST_WORKSPACE,
} from '../mocks/handlers'
import { latestTestWebSocket, resetTestWebSockets, TestWebSocket } from '../mocks/websocket'
import { TestResizeObserver } from '../mocks/resizeObserver'
import { server } from '../mocks/server'

const TEST_NOW_ISO = '2026-09-03T07:00:00.000Z'

const resetStores = () => {
  useAuthStore.setState({
    status: 'authenticated',
    user: TEST_USER,
    permissions: ['orders:read', 'orders:write'],
    serverTime: '2026-09-03T02:00:00.000Z',
    workspaceStatus: 'ready',
    activeWorkspace: { ...TEST_WORKSPACE, role: TEST_USER.role },
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

const installRealtimeSessionHandler = () => {
  server.use(
    http.post(`${TEST_API_BASE_URL}/api/realtime/session`, () =>
      HttpResponse.json({
        ticket: 'ticket-1',
        expiresAt: '2099-01-01T00:00:00.000Z',
      }),
    ),
  )
}

const connectRealtime = async (previousSocketCount = 0) => {
  await waitFor(() =>
    expect(TestWebSocket.instances.length).toBeGreaterThan(previousSocketCount),
  )
  const socket = latestTestWebSocket()
  socket.open()
  socket.emit('ready')
  return socket
}

const createTodayOrder = (overrides: Parameters<typeof createOrderDto>[0] = {}) => {
  return createOrderDto({
    createdAt: TEST_NOW_ISO,
    updatedAt: TEST_NOW_ISO,
    ...overrides,
  })
}

const openCreateOrderForm = async () => {
  const user = userEvent.setup()

  await user.click(screen.getByRole('button', { name: '创建订单' }))
  expect(await screen.findByRole('heading', { name: '创建订单' })).toBeVisible()

  return user
}

describe('订单页面关键状态与主流程集成', () => {
  beforeEach(() => {
    localStorage.clear()
    clearStoredApiBaseUrl()
    clearStoredAuthTokens()
    setStoredApiBaseUrl(TEST_API_BASE_URL)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(TEST_NOW_ISO))
    resetStores()
    persistAuthTokens(TEST_TOKENS)
    resetTestWebSockets()
    vi.stubGlobal('WebSocket', TestWebSocket)
    vi.stubGlobal('ResizeObserver', TestResizeObserver)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      () =>
        ({
          width: TestResizeObserver.width,
          height: TestResizeObserver.height,
          top: 0,
          right: TestResizeObserver.width,
          bottom: TestResizeObserver.height,
          left: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    )
  })

  afterEach(() => {
    for (const socket of TestWebSocket.instances) {
      socket.close()
    }
    resetTestWebSockets()
    vi.unstubAllGlobals()
  })

  it('订单首次同步时显示加载状态，空快照完成后显示空状态', async () => {
    let releaseList!: () => void
    const controlledList = new Promise<void>((resolve) => {
      releaseList = resolve
    })

    server.use(
      http.get(`${TEST_API_BASE_URL}/api/orders`, async () => {
        await controlledList
        return HttpResponse.json({ items: [], nextCursor: null })
      }),
    )
    installRealtimeSessionHandler()

    renderWithApp({ bootstrap: false, initialEntries: ['/order'] })

    expect(screen.getByText('正在同步订单')).toBeVisible()
    await connectRealtime()
    expect(screen.queryByText('暂无相关订单')).toBeNull()

    releaseList()

    expect(await screen.findByText('暂无相关订单')).toBeVisible()
  })

  it('订单快照请求失败时展示错误并可重试恢复', async () => {
    const order = createTodayOrder({ displayNo: '0007' })
    let listRequestCount = 0

    server.use(
      http.get(`${TEST_API_BASE_URL}/api/orders`, () => {
        listRequestCount += 1

        if (listRequestCount === 1) {
          return HttpResponse.json(
            {
              error: {
                code: 'orders_unavailable',
                message: '订单服务暂时不可用。',
              },
            },
            { status: 500 },
          )
        }

        return HttpResponse.json({ items: [order], nextCursor: null })
      }),
    )
    installRealtimeSessionHandler()

    const user = userEvent.setup()
    renderWithApp({ bootstrap: false, initialEntries: ['/order'] })

    await connectRealtime()

    expect(await screen.findByText('订单同步失败')).toBeVisible()
    expect(screen.getByText('订单服务暂时不可用。')).toBeVisible()

    const socketCountBeforeRetry = TestWebSocket.instances.length
    await user.click(screen.getByRole('button', { name: '重试' }))
    await connectRealtime(socketCountBeforeRetry)

    expect(await screen.findByText('#7')).toBeVisible()
    expect(listRequestCount).toBe(2)
    expect(screen.queryByText('订单同步失败')).toBeNull()
  })

  it('成功创建订单后关闭表单并把服务端订单加入列表', async () => {
    const createdOrder = createTodayOrder({
      id: '202609030009',
      displayNo: '0009',
      version: 1,
    })
    let createPayload: Record<string, unknown> | undefined

    server.use(
      http.get(`${TEST_API_BASE_URL}/api/orders`, () =>
        HttpResponse.json({ items: [], nextCursor: null }),
      ),
      http.post(`${TEST_API_BASE_URL}/api/orders`, async ({ request }) => {
        createPayload = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ items: [createdOrder] })
      }),
    )
    installRealtimeSessionHandler()

    renderWithApp({ bootstrap: false, initialEntries: ['/order'] })
    await connectRealtime()
    expect(await screen.findByText('暂无相关订单')).toBeVisible()

    const user = await openCreateOrderForm()
    await user.click(screen.getByRole('button', { name: '创建' }))

    expect(await screen.findByText('#9')).toBeVisible()
    expect(screen.queryByRole('heading', { name: '创建订单' })).toBeNull()
    expect(createPayload).toMatchObject({ quantity: 1 })
    expect(useOrderStore.getState().ordersById[createdOrder.id]?.displayNo).toBe(
      createdOrder.displayNo,
    )
  })

  it('服务端返回表单校验错误时保留表单并显示错误信息', async () => {
    let createRequestCount = 0

    server.use(
      http.get(`${TEST_API_BASE_URL}/api/orders`, () =>
        HttpResponse.json({ items: [], nextCursor: null }),
      ),
      http.post(`${TEST_API_BASE_URL}/api/orders`, () => {
        createRequestCount += 1
        return HttpResponse.json(
          {
            error: {
              code: 'validation_failed',
              message: 'sizeCode is invalid',
            },
          },
          { status: 400 },
        )
      }),
    )
    installRealtimeSessionHandler()

    renderWithApp({ bootstrap: false, initialEntries: ['/order'] })
    await connectRealtime()
    expect(await screen.findByText('暂无相关订单')).toBeVisible()

    const user = await openCreateOrderForm()
    await user.click(screen.getByRole('button', { name: '创建' }))

    expect(await screen.findByText('sizeCode is invalid')).toBeVisible()
    expect(screen.getByRole('heading', { name: '创建订单' })).toBeVisible()
    expect(screen.getByRole('button', { name: '创建' })).toBeEnabled()
    expect(createRequestCount).toBe(1)
    expect(useOrderStore.getState().orderDisplayIds).toHaveLength(0)
  })

  it('订单步骤 mutation 失败后恢复原状态并显示错误', async () => {
    let releaseFailure!: () => void
    const pendingMutation = new Promise<void>((resolve) => { releaseFailure = resolve })
    const order = createTodayOrder({
      id: '202609030011',
      displayNo: '0011',
      stapleStepStatusCode: STEP_STATUS.notStarted,
    })

    server.use(
      http.get(`${TEST_API_BASE_URL}/api/orders`, () =>
        HttpResponse.json({ items: [order], nextCursor: null }),
      ),
      http.post(
        `${TEST_API_BASE_URL}/api/orders/${order.id}/actions/toggle-step`,
        async () => {
          await pendingMutation
          return HttpResponse.json(
            {
              error: {
                code: 'toggle_failed',
                message: '主食暂时无法更新。',
              },
            },
            { status: 500 },
          )
        },
      ),
    )
    installRealtimeSessionHandler()

    const user = userEvent.setup()
    renderWithApp({ bootstrap: false, initialEntries: ['/order'] })
    await connectRealtime()

    expect(await screen.findByText('#11')).toBeVisible()
    const stapleButton = screen.getByRole('button', { name: '主食' })
    expect(stapleButton).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: '出餐' })).toBeDisabled()

    await user.click(stapleButton)
    try {
      expect(stapleButton).toHaveAttribute('aria-pressed', 'true')
    } finally {
      releaseFailure()
    }

    expect(await screen.findByText('主食暂时无法更新。')).toBeVisible()
    expect(useOrderStore.getState().ordersById[order.id]?.stapleStepStatusCode).toBe(
      STEP_STATUS.notStarted,
    )
    expect(stapleButton).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: '出餐' })).toBeDisabled()
  })
})
