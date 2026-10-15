import type { ConfigType } from 'dayjs'
import { getOrderDayRange, isOrderInDayRange } from '@/services/orderDomainUtils'
import type { Filter, OrderRecord } from '@/types'

export const selectTodayOrderIds = (
  ordersById: Record<string, OrderRecord>,
  orderDisplayIds: string[],
  filter: Filter,
  referenceTime?: ConfigType,
): string[] => {
  const dayRange = getOrderDayRange(referenceTime)
  const todayIds = orderDisplayIds.filter((id) =>
    isOrderInDayRange(ordersById[id], dayRange),
  )

  switch (filter) {
    case 'uncompleted':
      return todayIds.filter((id) => ordersById[id].completedAt === null)
    case 'completed':
      return todayIds
        .filter((id) => ordersById[id].completedAt !== null)
        .sort(
          (a, b) =>
            new Date(ordersById[b].completedAt ?? 0).getTime() -
            new Date(ordersById[a].completedAt ?? 0).getTime(),
        )
    default:
      return todayIds
  }
}

export const countTodayOrders = (
  ordersById: Record<string, OrderRecord>,
  orderDisplayIds: string[],
  referenceTime?: ConfigType,
): { todayCompletedCount: number; uncompletedCount: number } => {
  const dayRange = getOrderDayRange(referenceTime)
  let todayCompletedCount = 0
  let uncompletedCount = 0

  for (const id of orderDisplayIds) {
    const record = ordersById[id]

    if (!isOrderInDayRange(record, dayRange)) {
      continue
    }

    if (record.completedAt === null) {
      uncompletedCount++
    } else {
      todayCompletedCount++
    }
  }

  return { todayCompletedCount, uncompletedCount }
}
