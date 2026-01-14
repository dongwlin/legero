import { OrderItem } from "@/types";
import dayjs from "dayjs";

export interface DailyStats {
  totalAmount: number
  orderCount: number
}

export const calculateDailyStats = (orders: OrderItem[]): Map<string, DailyStats> => {
  const statsMap = new Map<string, DailyStats>()
  
  for (const item of orders) {
    const date = dayjs(item.createdAt)
    const dateKey = date.format('YYYY-MM-DD')

    const dailyStats = statsMap.get(dateKey) || {
      totalAmount: 0,
      orderCount: 0
    }

    dailyStats.totalAmount += item.price;
    dailyStats.orderCount += 1

    statsMap.set(dateKey, dailyStats)
  }

  return statsMap
}
