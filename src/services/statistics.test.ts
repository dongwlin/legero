import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from './apiClient'
import { fetchDailyStats, fetchReport } from './statistics'
import type { ReportResponse } from './apiTypes'

vi.mock('./apiClient', () => ({
  apiRequest: vi.fn(),
}))

const mockedApiRequest = vi.mocked(apiRequest)

const emptyRatio = () => ({ count: 0, denominator: 0, ratio: 0 })

const emptyReport = (date: string): ReportResponse => ({
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

describe('statistics service', () => {
  beforeEach(() => {
    mockedApiRequest.mockReset()
  })

  it('keeps the range query lightweight and returns the daily map', async () => {
    mockedApiRequest.mockResolvedValueOnce({
      items: [
        { date: '2026-08-18', orderCount: 2, totalPriceCents: 2400 },
        { date: '2026-08-17', orderCount: 0, totalPriceCents: 0 },
      ],
    })

    await expect(fetchDailyStats('2026-08-17', '2026-08-18')).resolves.toEqual(
      new Map([
        ['2026-08-18', { orderCount: 2, totalPriceCents: 2400 }],
        ['2026-08-17', { orderCount: 0, totalPriceCents: 0 }],
      ]),
    )

    expect(mockedApiRequest).toHaveBeenCalledTimes(1)
    expect(mockedApiRequest).toHaveBeenCalledWith({
      path: '/api/stats/daily?from=2026-08-17&to=2026-08-18',
      auth: true,
    })
  })

  it('requests one explicit report period without deriving it from a range', async () => {
    const report = emptyReport('2026-08-18')
    mockedApiRequest.mockResolvedValueOnce(report)

    await expect(fetchReport('day', '2026-08-18')).resolves.toEqual(report)

    expect(mockedApiRequest).toHaveBeenCalledTimes(1)
    expect(mockedApiRequest).toHaveBeenCalledWith({
      path: '/api/stats/report?period=day&date=2026-08-18',
      auth: true,
    })
  })
})
