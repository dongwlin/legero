/* @vitest-environment jsdom */

import {
  Children,
  cloneElement,
  isValidElement,
  useState,
  type ReactNode,
} from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AuthSettings from './AuthSettings'

const mocks = vi.hoisted(() => ({
  passwordEnabled: false,
  resetSyncState: vi.fn(),
  setAnonymous: vi.fn(),
  signOut: vi.fn(),
  togglePasswordProtection: vi.fn(),
}))

vi.mock('@heroui/react', () => {
  const passthrough = ({
    children,
    ...props
  }: Record<string, unknown>) => (
    <div {...props}>{children as ReactNode}</div>
  )

  const SwitchContent = ({
    children,
    isSelected,
    onToggle,
    ...props
  }: Record<string, unknown>) => (
    <button
      type='button'
      role='switch'
      data-slot='switch-content'
      aria-checked={Boolean(isSelected)}
      onClick={() => {
        if (typeof onToggle === 'function') {
          onToggle()
        }
      }}
      {...props}
    >
      {children as ReactNode}
    </button>
  )

  const SwitchRoot = ({
    children,
    isSelected,
    onChange,
    ...props
  }: Record<string, unknown>) => (
    <div data-slot='switch' {...props}>
      {Children.map(children as ReactNode, (child) =>
        isValidElement(child) && child.type === SwitchContent
          ? cloneElement(child, {
              isSelected,
              onToggle: () => {
                if (typeof onChange === 'function') {
                  onChange(!isSelected)
                }
              },
              'aria-label': props['aria-label'],
            } as Record<string, unknown>)
          : child,
      )}
    </div>
  )

  return {
    Button: {
      Root: ({
        children,
        isDisabled,
        onPress,
        ...props
      }: Record<string, unknown>) => (
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
          {children as ReactNode}
        </button>
      ),
    },
    Card: {
      Root: passthrough,
      Header: passthrough,
      Title: passthrough,
      Description: passthrough,
      Content: passthrough,
    },
    Switch: {
      Root: SwitchRoot,
      Content: SwitchContent,
      Control: ({ children, ...props }: Record<string, unknown>) => (
        <span data-slot='switch-control' {...props}>
          {children as ReactNode}
        </span>
      ),
      Thumb: passthrough,
    },
  }
})

vi.mock('@/components/PasswordLockScreen', () => ({
  default: () => <div role='dialog'>密码验证</div>,
}))

vi.mock('@/services/authService', () => ({
  authService: {
    signOut: mocks.signOut,
  },
}))

vi.mock('@/store/auth', () => ({
  useAuthStore: (
    selector: (state: {
      activeWorkspace: { name: string; role: string }
      setAnonymous: typeof mocks.setAnonymous
      user: { phone: string }
    }) => unknown,
  ) =>
    selector({
      activeWorkspace: { name: '测试工作区', role: 'owner' },
      setAnonymous: mocks.setAnonymous,
      user: { phone: '13800000000' },
    }),
}))

vi.mock('@/store/order', () => ({
  useOrderStore: (
    selector: (state: { resetSyncState: typeof mocks.resetSyncState }) => unknown,
  ) => selector({ resetSyncState: mocks.resetSyncState }),
}))

vi.mock('@/store/passwordAuth', () => ({
  usePasswordAuthStore: (
    selector: (state: {
      enabled: boolean
      toggleEnabled: () => void
    }) => unknown,
  ) => {
    const [, forceRender] = useState(0)

    return selector({
      enabled: mocks.passwordEnabled,
      toggleEnabled: () => {
        mocks.togglePasswordProtection()
        mocks.passwordEnabled = !mocks.passwordEnabled
        forceRender((current) => current + 1)
      },
    })
  },
}))

describe('AuthSettings', () => {
  beforeEach(() => {
    mocks.passwordEnabled = false
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('toggles password protection when the visual switch control is clicked', () => {
    render(<AuthSettings />)

    const switchContent = screen.getByRole('switch', {
      name: '切换统计页面密码保护',
    })
    const control = switchContent.querySelector('[data-slot="switch-control"]')

    expect(control).not.toBeNull()
    expect(switchContent.contains(control)).toBe(true)
    expect(switchContent.getAttribute('aria-checked')).toBe('false')

    fireEvent.click(control!)

    expect(switchContent.getAttribute('aria-checked')).toBe('true')
    expect(mocks.togglePasswordProtection).toHaveBeenCalledTimes(1)
  })
})
