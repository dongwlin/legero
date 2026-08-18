/* @vitest-environment jsdom */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { createMemoryRouter, RouterProvider, useNavigate } from 'react-router'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchDailyStats, fetchReport } from '@/services/statistics'
import { usePasswordAuthStore } from '@/store/passwordAuth'
import StatisticsLayout from './Layout'
import Statistic from './index'
import DailyReport from './Report'

vi.mock('@/services/statistics', () => ({
  fetchDailyStats: vi.fn(),
  fetchReport: vi.fn(),
}))

vi.mock('@/components/PasswordLockScreen', () => ({
  default: ({
    onCancel,
    onUnlock,
  }: {
    onCancel: () => void
    onUnlock: () => void
  }) => (
    <div role='dialog'>
      <button type='button' onClick={onUnlock}>
        解锁统计
      </button>
      <button type='button' onClick={onCancel}>
        取消统计
      </button>
    </div>
  ),
}))

vi.mock('@/components/Header', () => ({
  default: function MockHeader({
    backLabel,
    backPath,
    title,
  }: {
    backLabel?: string
    backPath?: string
    title: string
  }) {
    const navigate = useNavigate()

    return (
      <button
        type='button'
        aria-label={backLabel}
        onClick={() => {
          if (backPath) {
            navigate(backPath)
          }
        }}
      >
        {title}
      </button>
    )
  },
}))

vi.mock('./components/ReportDetailsCard', () => ({
  default: ({ selectedDate }: { selectedDate: string | null }) => (
    <div data-testid='report-details'>{selectedDate} 日报已加载</div>
  ),
}))

vi.mock('@heroui/react', () => {
  const passthrough = ({
    children,
    ...props
  }: Record<string, unknown>) => <div {...props}>{children as ReactNode}</div>

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

const mockedFetchDailyStats = vi.mocked(fetchDailyStats)
const mockedFetchReport = vi.mocked(fetchReport)

const createRouter = (initialEntry = '/statistics') =>
  createMemoryRouter(
    [
      {
        path: '/statistics',
        element: <StatisticsLayout />,
        children: [
          { index: true, element: <Statistic /> },
          { path: 'report/:date', element: <DailyReport /> },
        ],
      },
    ],
    { initialEntries: [initialEntry] },
  )

describe('Statistics route family', () => {
  beforeEach(() => {
    mockedFetchDailyStats.mockReset()
    mockedFetchReport.mockReset()
    mockedFetchDailyStats.mockResolvedValue(
      new Map([['2026-08-02', { orderCount: 2, totalPriceCents: 2400 }]]),
    )
    mockedFetchReport.mockResolvedValue({} as never)
    usePasswordAuthStore.setState({
      enabled: true,
      isAuthenticated: false,
    })
  })

  afterEach(() => {
    cleanup()
    usePasswordAuthStore.setState({
      enabled: true,
      isAuthenticated: false,
    })
  })

  it('keeps the range, daily result, and unlocked session across report navigation', async () => {
    const router = createRouter()
    render(<RouterProvider router={router} />)

    fireEvent.click(await screen.findByRole('button', { name: '解锁统计' }))
    await waitFor(() => expect(mockedFetchDailyStats).toHaveBeenCalledTimes(1))

    fireEvent.change(screen.getByLabelText('开始日期'), {
      target: { value: '2026-08-01' },
    })
    fireEvent.change(screen.getByLabelText('结束日期'), {
      target: { value: '2026-08-03' },
    })
    fireEvent.click(screen.getAllByRole('button', { name: '统计' }).at(-1)!)

    await waitFor(() => expect(mockedFetchDailyStats).toHaveBeenCalledTimes(2))
    expect(mockedFetchDailyStats).toHaveBeenLastCalledWith(
      '2026-08-01',
      '2026-08-03',
    )

    const reportLink = await screen.findByRole('link', {
      name: '查看日报 2026-08-02',
    })
    fireEvent.click(reportLink)

    await waitFor(() =>
      expect(screen.getByTestId('report-details')).not.toBeNull(),
    )
    expect(mockedFetchReport).toHaveBeenCalledWith('day', '2026-08-02')
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '返回统计' }))

    await waitFor(() =>
      expect((screen.getByLabelText('开始日期') as HTMLInputElement).value).toBe(
        '2026-08-01',
      ),
    )
    expect((screen.getByLabelText('结束日期') as HTMLInputElement).value).toBe(
      '2026-08-03',
    )
    expect(screen.getByText('2026-08-02')).not.toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mockedFetchDailyStats).toHaveBeenCalledTimes(2)
  })

  it('returns a locked direct report visit to the statistics index', async () => {
    const router = createRouter('/statistics/report/2026-08-02')
    render(<RouterProvider router={router} />)

    fireEvent.click(await screen.findByRole('button', { name: '取消统计' }))

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/statistics'),
    )
    expect(screen.getByRole('dialog')).not.toBeNull()
    expect(mockedFetchDailyStats).not.toHaveBeenCalled()
    expect(mockedFetchReport).not.toHaveBeenCalled()
  })

  it('loads only the report after unlocking a direct report visit', async () => {
    const router = createRouter('/statistics/report/2026-08-02')
    render(<RouterProvider router={router} />)

    fireEvent.click(await screen.findByRole('button', { name: '解锁统计' }))

    await waitFor(() =>
      expect(screen.getByTestId('report-details')).not.toBeNull(),
    )
    expect(mockedFetchReport).toHaveBeenCalledOnce()
    expect(mockedFetchReport).toHaveBeenCalledWith('day', '2026-08-02')
    expect(mockedFetchDailyStats).not.toHaveBeenCalled()
  })
})
