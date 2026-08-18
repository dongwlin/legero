/* @vitest-environment jsdom */

import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchReport } from '@/services/statistics'
import { useStatisticsReports } from './useStatisticsReports'

vi.mock('@/services/statistics', () => ({
  fetchReport: vi.fn(),
}))

const mockedFetchReport = vi.mocked(fetchReport)

const reportFor = (date: string) => ({
  period: 'day' as const,
  startDate: date,
  endDate: date,
  metrics: {},
})

describe('useStatisticsReports', () => {
  beforeEach(() => {
    mockedFetchReport.mockReset()
  })

  it('loads a report only after a date is selected and caches it', async () => {
    mockedFetchReport.mockResolvedValueOnce(reportFor('2026-08-18'))

    const { result } = renderHook(() => useStatisticsReports())

    expect(mockedFetchReport).not.toHaveBeenCalled()

    result.current.onDateSelect('2026-08-18')
    await waitFor(() => expect(result.current.report).toEqual(reportFor('2026-08-18')))

    expect(mockedFetchReport).toHaveBeenCalledTimes(1)
    expect(mockedFetchReport).toHaveBeenCalledWith('day', '2026-08-18')

    result.current.onDateSelect('2026-08-18')
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(mockedFetchReport).toHaveBeenCalledTimes(1)
  })

  it('requests only the newly selected date when switching dates', async () => {
    mockedFetchReport
      .mockResolvedValueOnce(reportFor('2026-08-18'))
      .mockResolvedValueOnce(reportFor('2026-08-17'))

    const { result } = renderHook(() => useStatisticsReports())
    result.current.onDateSelect('2026-08-18')
    await waitFor(() => expect(result.current.report?.startDate).toBe('2026-08-18'))

    result.current.onDateSelect('2026-08-17')
    await waitFor(() => expect(result.current.report?.startDate).toBe('2026-08-17'))

    expect(mockedFetchReport).toHaveBeenNthCalledWith(1, 'day', '2026-08-18')
    expect(mockedFetchReport).toHaveBeenNthCalledWith(2, 'day', '2026-08-17')
  })

  it('refreshes the selected date explicitly', async () => {
    mockedFetchReport
      .mockResolvedValueOnce(reportFor('2026-08-18'))
      .mockResolvedValueOnce(reportFor('2026-08-18'))

    const { result } = renderHook(() => useStatisticsReports())
    result.current.onDateSelect('2026-08-18')
    await waitFor(() => expect(result.current.report).not.toBeNull())

    result.current.onRefresh()
    await waitFor(() => expect(mockedFetchReport).toHaveBeenCalledTimes(2))

    expect(mockedFetchReport).toHaveBeenLastCalledWith('day', '2026-08-18')
  })

  it('keeps errors scoped to the selected date and exposes recovery', async () => {
    mockedFetchReport
      .mockRejectedValueOnce(new Error('日报服务不可用'))
      .mockResolvedValueOnce(reportFor('2026-08-18'))

    const { result } = renderHook(() => useStatisticsReports())
    result.current.onDateSelect('2026-08-18')
    await waitFor(() => expect(result.current.errorMessage).toBe('日报服务不可用'))

    result.current.onRefresh()
    await waitFor(() => expect(result.current.report).toEqual(reportFor('2026-08-18')))
    expect(result.current.errorMessage).toBeNull()
  })
})
