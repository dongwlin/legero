/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ApiBaseUrlForm from './ApiBaseUrlForm'

const mocks = vi.hoisted(() => ({
  clearStoredApiBaseUrl: vi.fn(),
  clearStoredAuthTokens: vi.fn(),
  probeServerHealth: vi.fn(),
  removeSavedServer: vi.fn(),
  resetSyncState: vi.fn(),
  setAnonymous: vi.fn(),
  setStoredApiBaseUrl: vi.fn(),
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
  toast: {
    danger: mocks.toastDanger,
  },
}))

vi.mock('@/components/Icon', () => ({
  CarbonTrashCan: ({ className }: { className?: string }) => <svg className={className} />,
}))

vi.mock('@/hooks/useApiBaseUrl', () => ({
  useApiBaseUrl: () => null,
}))

vi.mock('@/hooks/useSavedServers', () => ({
  useSavedServers: () => [],
}))

vi.mock('@/services/apiConfig', () => ({
  clearStoredApiBaseUrl: mocks.clearStoredApiBaseUrl,
  setStoredApiBaseUrl: mocks.setStoredApiBaseUrl,
}))

vi.mock('@/services/apiClient', () => ({
  clearStoredAuthTokens: mocks.clearStoredAuthTokens,
}))

vi.mock('@/services/savedServers', () => ({
  findSavedServer: () => null,
  removeSavedServer: mocks.removeSavedServer,
  upsertSavedServer: mocks.upsertSavedServer,
}))

vi.mock('@/services/serverHealth', () => ({
  probeServerHealth: mocks.probeServerHealth,
}))

vi.mock('@/store/auth', () => ({
  useAuthStore: (selector: (state: { setAnonymous: typeof mocks.setAnonymous }) => unknown) =>
    selector({
      setAnonymous: mocks.setAnonymous,
    }),
}))

vi.mock('@/store/order', () => ({
  useOrderStore: (
    selector: (state: { resetSyncState: typeof mocks.resetSyncState }) => unknown,
  ) =>
    selector({
      resetSyncState: mocks.resetSyncState,
    }),
}))

describe('ApiBaseUrlForm', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
  })

  afterEach(() => {
    cleanup()
  })

  it('shows probe failures as toast without rendering inline error text', async () => {
    mocks.probeServerHealth.mockRejectedValueOnce(new Error('连接失败'))

    render(<ApiBaseUrlForm />)

    const input = screen.getByPlaceholderText('https://example.com')

    fireEvent.change(input, {
      target: { value: 'https://bad.example' },
    })
    fireEvent.blur(input)

    await waitFor(() => {
      expect(mocks.toastDanger).toHaveBeenCalledWith('连接失败')
    })

    expect(screen.queryByText('连接失败')).toBeNull()
  })
})