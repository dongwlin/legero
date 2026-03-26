import { OrderRecord } from '@/types'
import dayjs from 'dayjs'

export interface DailyStats {
  totalPriceCents: number
  orderCount: number
}

export const calculateDailyStats = (
  orders: OrderRecord[],
): Map<string, DailyStats> => {
  const statsMap = new Map<string, DailyStats>()

  for (const item of orders) {
    const date = dayjs(item.createdAt)
    const dateKey = date.format('YYYY-MM-DD')

    const dailyStats = statsMap.get(dateKey) || {
      totalPriceCents: 0,
      orderCount: 0,
    }

    dailyStats.totalPriceCents += item.totalPriceCents
    dailyStats.orderCount += 1

    statsMap.set(dateKey, dailyStats)
  }

  return statsMap
}
