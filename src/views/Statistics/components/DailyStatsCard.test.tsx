/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DailyStatsCard from './DailyStatsCard'

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

  it('keeps zero-order range rows selectable without preloading reports', () => {
    const onDateSelect = vi.fn()

    render(
      <DailyStatsCard
        isReportLoading={false}
        onDateSelect={onDateSelect}
        selectedDate={null}
        stats={
          new Map([
            ['2026-08-18', { orderCount: 0, totalPriceCents: 0 }],
            ['2026-08-17', { orderCount: 2, totalPriceCents: 2400 }],
          ])
        }
      />,
    )

    expect(screen.getAllByText('查看日报')).toHaveLength(2)
    fireEvent.click(
      screen.getByRole('button', { name: '查看日报 2026-08-18' }),
    )
    expect(onDateSelect).toHaveBeenCalledWith('2026-08-18')
    expect(screen.getByText('2026-08-17')).not.toBeNull()
  })
})
