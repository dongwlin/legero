/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router'
import { useRealtimeDiagnostics } from '@/hooks/useRealtimeDiagnostics'

const mocks = vi.hoisted(() => ({
  getDiagnostics: vi.fn(() => null),
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
  access?.getDiagnostics()

  return <output>{access ? 'diagnostics available' : 'diagnostics unavailable'}</output>
}

describe('ProtectedRoute realtime diagnostics access', () => {
  beforeEach(() => {
    mocks.getDiagnostics.mockClear()
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
    render(
      <MemoryRouter initialEntries={['/settings/diagnostics']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route
              path='/settings/diagnostics'
              element={<DiagnosticsConsumer />}
            />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('diagnostics available')).not.toBeNull()
    expect(mocks.useOrderWorkspaceSync).toHaveBeenCalledTimes(1)
    expect(mocks.getDiagnostics).toHaveBeenCalledTimes(1)
  })
})
