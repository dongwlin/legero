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
import ThemeSettings from './ThemeSettings'

type Theme = 'dark' | 'light' | 'system'

const mocks = vi.hoisted(() => ({
  setTheme: vi.fn(),
  theme: 'system' as Theme,
}))

vi.mock('@heroui/react', () => {
  const passthrough = ({
    children,
    ...props
  }: Record<string, unknown>) => (
    <div {...props}>{children as ReactNode}</div>
  )

  const RadioContent = ({
    children,
    isSelected,
    onSelect,
    ...props
  }: Record<string, unknown>) => (
    <button
      type='button'
      role='radio'
      data-slot='radio-content'
      aria-checked={Boolean(isSelected)}
      onClick={() => {
        if (typeof onSelect === 'function') {
          onSelect()
        }
      }}
      {...props}
    >
      {children as ReactNode}
    </button>
  )

  const RadioRoot = ({
    children,
    isSelected,
    onSelect,
    value,
    ...props
  }: Record<string, unknown>) => (
    <div
      data-slot='radio'
      data-selected={Boolean(isSelected)}
      data-value={value as string}
      {...props}
    >
      {Children.map(children as ReactNode, (child) =>
        isValidElement(child) && child.type === RadioContent
          ? cloneElement(child, { isSelected, onSelect } as Record<string, unknown>)
          : child,
      )}
    </div>
  )

  const RadioGroupRoot = ({
    children,
    onChange,
    value,
    ...props
  }: Record<string, unknown>) => (
    <div role='radiogroup' {...props}>
      {Children.map(children as ReactNode, (child) =>
        isValidElement(child) && child.type === RadioRoot
          ? cloneElement(child, {
              isSelected: (child.props as { value: Theme }).value === value,
              onSelect: () => {
                if (typeof onChange === 'function') {
                  onChange((child.props as { value: Theme }).value)
                }
              },
            } as Record<string, unknown>)
          : child,
      )}
    </div>
  )

  return {
    Card: {
      Root: passthrough,
      Header: passthrough,
      Title: passthrough,
      Description: passthrough,
      Content: passthrough,
    },
    Radio: {
      Root: RadioRoot,
      Content: RadioContent,
      Control: ({ children, ...props }: Record<string, unknown>) => (
        <span data-slot='radio-control' {...props}>
          {children as ReactNode}
        </span>
      ),
      Indicator: () => <span data-slot='radio-indicator' />,
    },
    RadioGroup: {
      Root: RadioGroupRoot,
    },
  }
})

vi.mock('@/store/theme', () => ({
  useThemeStore: () => {
    const [theme, setTheme] = useState<Theme>(mocks.theme)

    return {
      theme,
      setTheme: (nextTheme: Theme) => {
        mocks.setTheme(nextTheme)
        setTheme(nextTheme)
      },
    }
  },
}))

describe('ThemeSettings', () => {
  beforeEach(() => {
    mocks.theme = 'system'
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('changes theme when the visual radio control is clicked', () => {
    render(<ThemeSettings />)

    const darkLabel = screen.getByText('深色模式')
    const darkRadio = darkLabel.closest('[data-slot="radio"]')
    const content = darkRadio?.querySelector('[data-slot="radio-content"]')
    const control = darkRadio?.querySelector('[data-slot="radio-control"]')

    expect(darkRadio).not.toBeNull()
    expect(content).not.toBeNull()
    expect(control).not.toBeNull()
    expect(content?.contains(control ?? null)).toBe(true)
    expect(content?.getAttribute('aria-checked')).toBe('false')

    fireEvent.click(control!)

    expect(mocks.setTheme).toHaveBeenCalledWith('dark')
    expect(content?.getAttribute('aria-checked')).toBe('true')
  })
})
