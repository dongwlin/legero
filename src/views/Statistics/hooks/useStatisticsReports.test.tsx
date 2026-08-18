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

const deferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('useStatisticsReports', () => {
  beforeEach(() => {
    mockedFetchReport.mockReset()
  })

  it('loads the route date on mount and exposes loading before the response', async () => {
    mockedFetchReport.mockResolvedValueOnce(reportFor('2026-08-18'))

    const { result } = renderHook(() =>
      useStatisticsReports('2026-08-18', true),
    )

    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.report).toEqual(reportFor('2026-08-18')))

    expect(mockedFetchReport).toHaveBeenCalledTimes(1)
    expect(mockedFetchReport).toHaveBeenCalledWith('day', '2026-08-18')
  })

  it('reads only the newly routed date and never returns the previous report', async () => {
    mockedFetchReport
      .mockResolvedValueOnce(reportFor('2026-08-18'))
      .mockResolvedValueOnce(reportFor('2026-08-17'))

    const { result, rerender } = renderHook(
      ({ date }: { date: string }) => useStatisticsReports(date, true),
      { initialProps: { date: '2026-08-18' } },
    )
    await waitFor(() => expect(result.current.report?.startDate).toBe('2026-08-18'))

    rerender({ date: '2026-08-17' })
    expect(result.current.report).toBeNull()
    expect(result.current.errorMessage).toBeNull()
    expect(result.current.isLoading).toBe(true)

    await waitFor(() => expect(result.current.report?.startDate).toBe('2026-08-17'))
    expect(mockedFetchReport).toHaveBeenNthCalledWith(1, 'day', '2026-08-18')
    expect(mockedFetchReport).toHaveBeenNthCalledWith(2, 'day', '2026-08-17')
  })

  it('does not request while disabled and starts when access is enabled', async () => {
    mockedFetchReport.mockResolvedValueOnce(reportFor('2026-08-18'))

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useStatisticsReports('2026-08-18', enabled),
      { initialProps: { enabled: false } },
    )

    expect(result.current.isLoading).toBe(false)
    expect(mockedFetchReport).not.toHaveBeenCalled()

    rerender({ enabled: true })
    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.report).not.toBeNull())
    expect(mockedFetchReport).toHaveBeenCalledWith('day', '2026-08-18')
  })

  it('refreshes the current route date explicitly', async () => {
    mockedFetchReport
      .mockResolvedValueOnce(reportFor('2026-08-18'))
      .mockResolvedValueOnce(reportFor('2026-08-18'))

    const { result } = renderHook(() =>
      useStatisticsReports('2026-08-18', true),
    )
    await waitFor(() => expect(result.current.report).not.toBeNull())

    result.current.onRefresh()
    await waitFor(() => expect(mockedFetchReport).toHaveBeenCalledTimes(2))

    expect(mockedFetchReport).toHaveBeenLastCalledWith('day', '2026-08-18')
  })

  it('scopes errors to the current route date and allows recovery', async () => {
    mockedFetchReport
      .mockRejectedValueOnce(new Error('日报服务不可用'))
      .mockResolvedValueOnce(reportFor('2026-08-18'))

    const { result } = renderHook(() =>
      useStatisticsReports('2026-08-18', true),
    )
    await waitFor(() => expect(result.current.errorMessage).toBe('日报服务不可用'))

    result.current.onRefresh()
    await waitFor(() => expect(result.current.report).toEqual(reportFor('2026-08-18')))
    expect(result.current.errorMessage).toBeNull()
  })

  it('does not leave a stale loading state when returning to a pending date', async () => {
    const requestA = deferred<ReportResponse>()
    const requestB = deferred<ReportResponse>()
    mockedFetchReport.mockImplementation((_period, date) =>
      date === '2026-08-18' ? requestA.promise : requestB.promise,
    )

    const { result, rerender } = renderHook(
      ({ date }: { date: string }) => useStatisticsReports(date, true),
      { initialProps: { date: '2026-08-18' } },
    )
    await waitFor(() => expect(mockedFetchReport).toHaveBeenCalledTimes(1))

    rerender({ date: '2026-08-17' })
    await waitFor(() => expect(mockedFetchReport).toHaveBeenCalledTimes(2))
    rerender({ date: '2026-08-18' })
    expect(result.current.isLoading).toBe(true)

    requestA.resolve(reportFor('2026-08-18'))
    await waitFor(() => expect(result.current.report?.startDate).toBe('2026-08-18'))
    expect(result.current.isLoading).toBe(false)

    requestB.resolve(reportFor('2026-08-17'))
    await waitFor(() => expect(mockedFetchReport).toHaveBeenCalledTimes(2))
    expect(result.current.report?.startDate).toBe('2026-08-18')
    expect(result.current.isLoading).toBe(false)
  })
})
