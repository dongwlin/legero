import type { OrderRecord } from '@/types'
import { deriveDisplayNoFromId } from './orderDomainUtils'

const getOrderDisplayNoSortKey = (order: OrderRecord): string =>
  order.displayNo ?? deriveDisplayNoFromId(order.id) ?? order.id

export const compareOrderRecordsByTimeline = (
  left: OrderRecord,
  right: OrderRecord,
): number => {
  const createdAtDiff =
    new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()

  if (createdAtDiff !== 0) {
    return createdAtDiff
  }

  const leftDisplayNo = getOrderDisplayNoSortKey(left)
  const rightDisplayNo = getOrderDisplayNoSortKey(right)

  if (leftDisplayNo < rightDisplayNo) {
    return -1
  }

  if (leftDisplayNo > rightDisplayNo) {
    return 1
  }

  return left.id.localeCompare(right.id)
}

export const sortOrdersByTimeline = (orders: OrderRecord[]): OrderRecord[] =>
  [...orders].sort(compareOrderRecordsByTimeline)
