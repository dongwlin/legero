/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DailyStatsCard from './DailyStatsCard'

vi.mock('react-router', () => ({
  Link: ({
    children,
    to,
    ...props
  }: Record<string, unknown>) => (
    <a href={String(to)} {...props}>
      {children as React.ReactNode}
    </a>
  ),
}))

vi.mock('@heroui/react', () => {
  const passthrough = ({ children, ...props }: Record<string, unknown>) => (
    <div {...props}>{children as React.ReactNode}</div>
  )

  return {
    Button: {
      Root: ({ children, onPress, ...props }: Record<string, unknown>) => (
        <button
          type='button'
          onClick={() => {
            if (typeof onPress === 'function') {
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
      Root: passthrough,
      Header: passthrough,
      Title: passthrough,
      Description: passthrough,
      Content: passthrough,
    },
    EmptyState: { Root: passthrough },
    Table: {
      Root: passthrough,
      ScrollContainer: passthrough,
      Content: passthrough,
      Header: passthrough,
      Column: passthrough,
      Body: passthrough,
      Row: passthrough,
      Cell: passthrough,
    },
  }
})

describe('DailyStatsCard', () => {
  afterEach(() => {
    cleanup()
  })

  it('keeps zero-order range rows linked without preloading reports', () => {
    render(
      <DailyStatsCard
        stats={
          new Map([
            ['2026-08-18', { orderCount: 0, totalPriceCents: 0 }],
            ['2026-08-17', { orderCount: 2, totalPriceCents: 2400 }],
          ])
        }
      />,
    )

    const zeroOrderLink = screen.getByRole('link', {
      name: '查看日报 2026-08-18',
    })
    expect(zeroOrderLink.getAttribute('href')).toBe(
      '/statistics/report/2026-08-18',
    )
    expect(
      screen.getByRole('link', { name: '查看日报 2026-08-17' }).getAttribute(
        'href',
      ),
    ).toBe('/statistics/report/2026-08-17')
    expect(screen.getByText('2026-08-17')).not.toBeNull()
  })
})
