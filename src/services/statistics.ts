import { apiRequest } from './apiClient'
import type { DailyStatsResponse } from './apiTypes'

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
