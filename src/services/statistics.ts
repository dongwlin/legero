import { apiRequest } from './apiClient'
import type {
  DailyStatsResponse,
  ReportPeriod,
  ReportResponse,
} from './apiTypes'

export interface DailyStats {
  totalPriceCents: number
  orderCount: number
}

export const fetchDailyStats = async (
  from: string,
  to: string,
): Promise<Map<string, DailyStats>> => {
  const params = new URLSearchParams({
    from,
    to,
  })

  const response = await apiRequest<DailyStatsResponse>({
    path: `/api/stats/daily?${params.toString()}`,
    auth: true,
  })

  return new Map(
    response.items.map((item) => [
      item.date,
      {
        orderCount: item.orderCount,
        totalPriceCents: item.totalPriceCents,
      },
    ]),
  )
}

/**
 * Fetch one complete report for an explicit business period.
 *
 * Keep this separate from `fetchDailyStats`: the range endpoint is a cheap
 * trend query and must never fan out into one report request per date.
 */
export const fetchReport = async (
  period: ReportPeriod,
  date: string,
): Promise<ReportResponse> => {
  const params = new URLSearchParams({
    period,
    date,
  })

  return apiRequest<ReportResponse>({
    path: `/api/stats/report?${params.toString()}`,
    auth: true,
  })
}
