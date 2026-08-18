/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'
import { useRealtimeDiagnostics } from '@/hooks/useRealtimeDiagnostics'
import type { RealtimeDiagnosticsSnapshot } from '@/services/realtimeDiagnostics'

const mocks = vi.hoisted(() => ({
  getDiagnostics: vi.fn<() => RealtimeDiagnosticsSnapshot | null>(() => null),
  useOrderWorkspaceSync: vi.fn(),
}))

vi.mock('@/hooks/useOrderWorkspaceSync', () => ({
  useOrderWorkspaceSync: mocks.useOrderWorkspaceSync,
}))

vi.mock('@/store/auth', () => ({
  useAuthStore: (
    selector: (state: {
      status: 'authenticated'
      workspaceStatus: 'ready'
    }) => unknown,
  ) =>
    selector({
      status: 'authenticated',
      workspaceStatus: 'ready',
    }),
}))

import ProtectedRoute from './ProtectedRoute'

const DiagnosticsConsumer = () => {
  const access = useRealtimeDiagnostics()
  const snapshot = access?.getDiagnostics()

  return (
    <>
      <output>{access ? 'diagnostics available' : 'diagnostics unavailable'}</output>
      {snapshot ? (
        <output data-testid='diagnostics-snapshot-state'>{snapshot.state}</output>
      ) : null}
    </>
  )
}

const createSnapshot = (
  state: RealtimeDiagnosticsSnapshot['state'],
): RealtimeDiagnosticsSnapshot => ({
  state,
  failureStage: state === 'failed' ? 'ready' : null,
  connectionAttemptCount: 1,
  reconnectCount: 0,
  lastReconnectReason: null,
  lastConnectDurationMs: null,
  lastClose: null,
  lastCloseCode: null,
  lastCloseReason: null,
  lastRecoveryDurationMs: null,
  recoveryCount: 0,
  heartbeatCount: 0,
  serverActivityCount: 0,
  lastServerActivityAt: null,
  currentServerActivityGapMs: null,
  lastServerActivityGapMs: null,
  serverActivityGapMs: null,
  staleCount: 0,
  networkOnline: null,
  networkType: null,
  appBackgrounded: null,
  snapshotReconciliation: {
    count: 0,
    failureCount: 0,
    cancelledCount: 0,
    lastDurationMs: null,
    lastFailureAt: null,
  },
  stateChanges: [],
})

const renderProtectedRoute = (
  path: string,
  element: ReactNode,
  routePath = path,
) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path={routePath} element={element} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )

describe('ProtectedRoute realtime diagnostics access', () => {
  beforeEach(() => {
    mocks.getDiagnostics.mockReset().mockReturnValue(null)
    mocks.useOrderWorkspaceSync.mockReset().mockReturnValue({
      status: 'ready',
      errorMessage: null,
      retrySync: vi.fn(),
      getDiagnostics: mocks.getDiagnostics,
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('shares the getter from its single workspace sync hook with nested pages', () => {
    renderProtectedRoute('/settings/diagnostics', <DiagnosticsConsumer />)

    expect(screen.getByText('diagnostics available')).not.toBeNull()
    expect(mocks.useOrderWorkspaceSync).toHaveBeenCalledTimes(1)
    expect(mocks.getDiagnostics).toHaveBeenCalledTimes(1)
  })

  it.each(['idle', 'loading'] as const)(
    'keeps diagnostics accessible while order sync is %s',
    (status) => {
      mocks.getDiagnostics.mockReturnValue(createSnapshot('connecting'))
      mocks.useOrderWorkspaceSync.mockReturnValue({
        status,
        errorMessage: null,
        retrySync: vi.fn(),
        getDiagnostics: mocks.getDiagnostics,
      })

      renderProtectedRoute('/settings/diagnostics', <DiagnosticsConsumer />)

      expect(screen.getByText('diagnostics available')).not.toBeNull()
      expect(screen.getByTestId('diagnostics-snapshot-state').textContent).toBe(
        'connecting',
      )
      expect(screen.queryByText('正在同步订单')).toBeNull()
      expect(mocks.getDiagnostics).toHaveBeenCalledTimes(1)
    },
  )

  it('keeps diagnostics accessible and exposes a terminal snapshot after sync error', () => {
    mocks.getDiagnostics.mockReturnValue(createSnapshot('failed'))
    mocks.useOrderWorkspaceSync.mockReturnValue({
      status: 'error',
      errorMessage: 'Realtime subscription failed.',
      retrySync: vi.fn(),
      getDiagnostics: mocks.getDiagnostics,
    })

    renderProtectedRoute('/settings/diagnostics', <DiagnosticsConsumer />)

    expect(screen.getByText('diagnostics available')).not.toBeNull()
    expect(screen.getByTestId('diagnostics-snapshot-state').textContent).toBe(
      'failed',
    )
    expect(screen.queryByText('订单同步失败')).toBeNull()
    expect(mocks.getDiagnostics).toHaveBeenCalledTimes(1)
  })

  it('keeps diagnostics accessible when the URL has a trailing slash', () => {
    mocks.getDiagnostics.mockReturnValue(createSnapshot('connecting'))
    mocks.useOrderWorkspaceSync.mockReturnValue({
      status: 'loading',
      errorMessage: null,
      retrySync: vi.fn(),
      getDiagnostics: mocks.getDiagnostics,
    })

    renderProtectedRoute(
      '/settings/diagnostics/',
      <DiagnosticsConsumer />,
      '/settings/diagnostics',
    )

    expect(screen.getByText('diagnostics available')).not.toBeNull()
    expect(screen.getByTestId('diagnostics-snapshot-state').textContent).toBe(
      'connecting',
    )
    expect(screen.queryByText('正在同步订单')).toBeNull()
  })

  it('keeps the loading gate for ordinary business routes', () => {
    mocks.useOrderWorkspaceSync.mockReturnValue({
      status: 'loading',
      errorMessage: null,
      retrySync: vi.fn(),
      getDiagnostics: mocks.getDiagnostics,
    })

    renderProtectedRoute('/order', <output>business route</output>)

    expect(screen.getByText('正在同步订单')).not.toBeNull()
    const diagnosticsLink = screen.getByRole('link', { name: '查看连接诊断' })
    expect(diagnosticsLink.getAttribute('href')).toBe('/settings/diagnostics')
    expect(screen.queryByText('business route')).toBeNull()
  })

  it('keeps the error gate for ordinary business routes', () => {
    mocks.useOrderWorkspaceSync.mockReturnValue({
      status: 'error',
      errorMessage: 'Realtime subscription failed.',
      retrySync: vi.fn(),
      getDiagnostics: mocks.getDiagnostics,
    })

    renderProtectedRoute('/order', <output>business route</output>)

    expect(screen.getByText('订单同步失败')).not.toBeNull()
    expect(screen.getByText('Realtime subscription failed.')).not.toBeNull()
    const diagnosticsLink = screen.getByRole('link', { name: '查看连接诊断' })
    expect(diagnosticsLink.getAttribute('href')).toBe('/settings/diagnostics')
    const retryButton = screen.getByRole('button', { name: '重试' })
    expect(retryButton).not.toBeNull()
    expect(retryButton.parentElement?.firstElementChild).toBe(retryButton)
    expect(retryButton.parentElement?.lastElementChild).toBe(diagnosticsLink)
    expect(retryButton.className).toContain('w-full')
    expect(diagnosticsLink.className).toContain('w-full')
    expect(screen.queryByText('business route')).toBeNull()
  })
})
