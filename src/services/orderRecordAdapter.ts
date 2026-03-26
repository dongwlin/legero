import { type OrderRecord, type OrderViewModel } from '@/types'
import {
  formatMeatRequestText,
  formatOrderSizePriceText,
  formatOtherRequestText,
  getDisplayNoText,
  getDiningMethodLabel,
  getStapleToneClass,
  getStapleTypeLabel,
} from './orderFormatters'
import { canServeOrder } from './orderStatus'

export const orderRecordToOrderViewModel = (
  record: OrderRecord,
): OrderViewModel => ({
  id: record.id,
  displayNoText: getDisplayNoText(record.displayNo, record.id),
  stapleTypeLabel: getStapleTypeLabel(record.stapleTypeCode),
  stapleToneClass: getStapleToneClass(record.stapleTypeCode),
  sizePriceText: formatOrderSizePriceText(record),
  diningMethodLabel: getDiningMethodLabel(record.diningMethodCode),
  meatRequestText: formatMeatRequestText(record),
  otherRequestText: formatOtherRequestText(record),
  noteText: record.note,
  canServe: canServeOrder(record),
})
