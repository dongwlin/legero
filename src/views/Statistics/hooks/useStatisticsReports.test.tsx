/* @vitest-environment jsdom */

import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchReport } from '@/services/statistics'
import type { ReportResponse } from '@/services/apiTypes'
import { useStatisticsReports } from './useStatisticsReports'

vi.mock('@/services/statistics', () => ({
  fetchReport: vi.fn(),
}))

const mockedFetchReport = vi.mocked(fetchReport)

const emptyRatio = () => ({ count: 0, denominator: 0, ratio: 0 })

const reportFor = (date: string): ReportResponse => ({
  period: 'day',
  startDate: date,
  endDate: date,
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
      small: emptyRatio(),
      medium: emptyRatio(),
      large: emptyRatio(),
    },
    totalFriedEggCount: 0,
    takeout: emptyRatio(),
    customizations: {
      leanMeatOnly: emptyRatio(),
      noIntestine: emptyRatio(),
      union: emptyRatio(),
    },
  },
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
