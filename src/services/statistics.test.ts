import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from './apiClient'
import { fetchDailyStats, fetchReport } from './statistics'

vi.mock('./apiClient', () => ({
  apiRequest: vi.fn(),
}))

const mockedApiRequest = vi.mocked(apiRequest)

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
    const report = {
      period: 'day' as const,
      startDate: '2026-08-18',
      endDate: '2026-08-18',
      metrics: {},
    }
    mockedApiRequest.mockResolvedValueOnce(report)

    await expect(fetchReport('day', '2026-08-18')).resolves.toEqual(report)

    expect(mockedApiRequest).toHaveBeenCalledTimes(1)
    expect(mockedApiRequest).toHaveBeenCalledWith({
      path: '/api/stats/report?period=day&date=2026-08-18',
      auth: true,
    })
  })
})
