/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReportResponse } from '@/services/apiTypes'
import ReportDetailsCard from './ReportDetailsCard'

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
  Card: {
    Root: ({ children, ...props }: Record<string, unknown>) => (
      <div {...props}>{children as React.ReactNode}</div>
    ),
    Header: ({ children, ...props }: Record<string, unknown>) => (
      <div {...props}>{children as React.ReactNode}</div>
    ),
    Title: ({ children, ...props }: Record<string, unknown>) => (
      <h2 {...props}>{children as React.ReactNode}</h2>
    ),
    Description: ({ children, ...props }: Record<string, unknown>) => (
      <p {...props}>{children as React.ReactNode}</p>
    ),
    Content: ({ children, ...props }: Record<string, unknown>) => (
      <div {...props}>{children as React.ReactNode}</div>
    ),
  },
  EmptyState: {
    Root: ({ children, ...props }: Record<string, unknown>) => (
      <div {...props}>{children as React.ReactNode}</div>
    ),
  },
}))

const ratio = (count: number, denominator: number, value: number) => ({
  count,
  denominator,
  ratio: value,
})

const report: ReportResponse = {
  period: 'day',
  startDate: '2026-08-18',
  endDate: '2026-08-18',
  metrics: {
    revenueCents: 2468,
    completedOrderCount: 2,
    averageOrderValueCents: 1234,
    averagePreparationSeconds: 512,
    peak30MinuteBuckets: [
      { start: '12:00', end: '12:30', orderCount: 2 },
    ],
    stapleSales: [
      { stapleTypeCode: 1, orderCount: 1 },
      { stapleTypeCode: 2, orderCount: 1 },
      { stapleTypeCode: 3, orderCount: 0 },
      { stapleTypeCode: 4, orderCount: 0 },
    ],
    noStapleOrderCount: 0,
    unknownStapleOrderCount: 0,
    standardSize: {
      standardCount: 2,
      customSizeOrderCount: 0,
      small: ratio(1, 2, 0.5),
      medium: ratio(1, 2, 0.5),
      large: ratio(0, 2, 0),
    },
    totalFriedEggCount: 1,
    takeout: ratio(1, 2, 0.5),
    customizations: {
      leanMeatOnly: ratio(1, 2, 0.5),
      noIntestine: ratio(1, 2, 0.5),
      union: ratio(1, 2, 0.5),
    },
  },
}

const emptyReport: ReportResponse = {
  ...report,
  metrics: {
    revenueCents: 0,
    completedOrderCount: 0,
    averageOrderValueCents: 0,
    averagePreparationSeconds: 0,
    peak30MinuteBuckets: [],
    stapleSales: [1, 2, 3, 4].map((stapleTypeCode) => ({
      stapleTypeCode,
      orderCount: 0,
    })),
    noStapleOrderCount: 0,
    unknownStapleOrderCount: 0,
    standardSize: {
      standardCount: 0,
      customSizeOrderCount: 0,
      small: ratio(0, 0, 0),
      medium: ratio(0, 0, 0),
      large: ratio(0, 0, 0),
    },
    totalFriedEggCount: 0,
    takeout: ratio(0, 0, 0),
    customizations: {
      leanMeatOnly: ratio(0, 0, 0),
      noIntestine: ratio(0, 0, 0),
      union: ratio(0, 0, 0),
    },
  },
}

describe('ReportDetailsCard', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders complete report groups and supports explicit refresh', () => {
    const onRefresh = vi.fn()

    render(
      <ReportDetailsCard
        errorMessage={null}
        isLoading={false}
        onRefresh={onRefresh}
        report={report}
        selectedDate='2026-08-18'
      />,
    )

    expect(screen.getByText('核心经营')).not.toBeNull()
    expect(screen.getByText('订单构成')).not.toBeNull()
    expect(screen.getByText('客制化')).not.toBeNull()
    expect(screen.getByText('营业额')).not.toBeNull()
    expect(screen.getByText('¥24.68')).not.toBeNull()
    expect(screen.getByText('8分32秒')).not.toBeNull()
    expect(screen.getByText(/12:00–12:30/)).not.toBeNull()
    expect(screen.getByText(/河粉 1 单/)).not.toBeNull()
    expect(screen.getAllByText('50%（1/2）').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('shows an explicit zero-order state without NaN', () => {
    render(
      <ReportDetailsCard
        errorMessage={null}
        isLoading={false}
        onRefresh={vi.fn()}
        report={emptyReport}
        selectedDate='2026-08-18'
      />,
    )

    expect(screen.getByText(/当日暂无完成订单/)).not.toBeNull()
    expect(screen.getByText('暂无高峰时段')).not.toBeNull()
    expect(screen.queryByText(/NaN/)).toBeNull()
    expect(screen.getAllByText('0%（0/0）').length).toBeGreaterThan(0)
  })
})
