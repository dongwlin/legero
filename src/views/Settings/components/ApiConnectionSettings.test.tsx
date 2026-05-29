/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ApiConnectionSettings from './ApiConnectionSettings'

vi.mock('@heroui/react', () => ({
  Card: {
    Root: ({ children, ...props }: Record<string, unknown>) => <div {...props}>{children as React.ReactNode}</div>,
    Header: ({ children, ...props }: Record<string, unknown>) => (
      <div {...props}>{children as React.ReactNode}</div>
    ),
    Title: ({ children, ...props }: Record<string, unknown>) => (
      <div {...props}>{children as React.ReactNode}</div>
    ),
    Description: ({ children, ...props }: Record<string, unknown>) => (
      <div {...props}>{children as React.ReactNode}</div>
    ),
    Content: ({ children, ...props }: Record<string, unknown>) => (
      <div {...props}>{children as React.ReactNode}</div>
    ),
  },
}))

vi.mock('@/hooks/useApiBaseUrl', () => ({
  useApiBaseUrl: () => 'https://api.example.com',
}))

describe('ApiConnectionSettings', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows the configured server as read-only display without status or server picker actions', () => {
    render(<ApiConnectionSettings />)

    const input = screen.getByLabelText('服务器地址') as HTMLInputElement

    expect(screen.getByText('当前服务器')).not.toBeNull()
    expect(screen.queryByText('服务器')).toBeNull()
    expect(input.value).toBe('https://api.example.com')
    expect(input.readOnly).toBe(true)
    expect(screen.queryByLabelText('服务器可连接')).toBeNull()
    expect(screen.queryByText('选择服务器')).toBeNull()
    expect(screen.queryByText('收起服务器列表')).toBeNull()
  })
})