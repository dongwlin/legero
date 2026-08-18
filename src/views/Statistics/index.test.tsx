/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DailyStats } from '@/services/statistics'
import type { ReportResponse } from '@/services/apiTypes'
import { StatisticsView } from './index'

vi.mock('@/components/PasswordLockScreen', () => ({
  default: () => null,
}))

vi.mock('@/store/passwordAuth', () => ({
  usePasswordAuthStore: () => false,
}))

vi.mock('@/services/statistics', () => ({
  fetchDailyStats: vi.fn(),
}))

vi.mock('dayjs', () => ({
  default: () => ({
    format: () => '2026-08-18',
    startOf: () => ({ format: () => '2026-08-01' }),
  }),
}))

vi.mock('react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('./hooks/useStatisticsReports', () => ({
  useStatisticsReports: () => ({
    errorMessage: null,
    isLoading: false,
    onDateSelect: vi.fn(),
    onRefresh: vi.fn(),
    report: null,
    reset: vi.fn(),
    selectedDate: null,
  }),
}))

vi.mock('@/components/Header', () => ({
  default: () => <header>统计</header>,
}))

vi.mock('./components/StatisticsControls', () => ({
  default: () => <div>统计操作</div>,
}))

vi.mock('./components/DailyStatsCard', () => ({
  default: ({ onDateSelect }: { onDateSelect: (date: string) => void }) => (
    <button type='button' onClick={() => onDateSelect('2026-08-18')}>
      查看日报
    </button>
  ),
}))

vi.mock('./components/ReportDetailsCard', () => ({
  default: () => <div>日报内容</div>,
}))

describe('StatisticsView report navigation', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('focuses and reveals the report region after selecting a daily report', () => {
    const onDateSelect = vi.fn()
    const stats = new Map<string, DailyStats>()
    const report: ReportResponse | null = null

    render(
      <StatisticsView
        errorMessage={null}
        fromDate='2026-08-01'
        isLoading={false}
        onCalculate={vi.fn()}
        onFromDateChange={vi.fn()}
        onToDateChange={vi.fn()}
        onDateSelect={onDateSelect}
        onReportRefresh={vi.fn()}
        report={report}
        reportErrorMessage={null}
        isReportLoading={false}
        selectedDate={null}
        stats={stats}
        toDate='2026-08-18'
      />,
    )

    const reportRegion = screen.getByRole('region', { name: '日报详情' })
    const scrollIntoView = vi.fn()
    Object.defineProperty(reportRegion, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })
    const focus = vi.spyOn(reportRegion, 'focus')

    fireEvent.click(screen.getByRole('button', { name: '查看日报' }))

    expect(onDateSelect).toHaveBeenCalledOnce()
    expect(onDateSelect).toHaveBeenCalledWith('2026-08-18')
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' })
    expect(document.activeElement).toBe(reportRegion)
  })
})
