import { MEAT, SIZE, type MeatCode, type SizeCode } from '@/types'
import dayjs, { type ConfigType } from 'dayjs'

// Normalize order-day calculations to the restaurant's business timezone.
const ORDER_TIME_ZONE = 'Asia/Shanghai'

type OrderDateInput = {
  createdAt: string
}

export type OrderDayRange = {
  startAt: number
  endAt: number
}

export const ALL_MEAT_CODES_IN_ORDER = [
  MEAT.leanPork,
  MEAT.liver,
  MEAT.bloodCurd,
  MEAT.largeIntestine,
  MEAT.smallIntestine,
  MEAT.kidney,
] as const satisfies readonly MeatCode[]

export const getVisibleMeatCodes = (sizeCode: SizeCode): readonly MeatCode[] =>
  sizeCode === SIZE.small
    ? ALL_MEAT_CODES_IN_ORDER.filter((code) => code !== MEAT.kidney)
    : ALL_MEAT_CODES_IN_ORDER

export const normalizeSelectedMeatCodes = (
  codes: readonly MeatCode[],
  sizeCode: SizeCode,
): MeatCode[] => {
  const allowedCodes = new Set(getVisibleMeatCodes(sizeCode))
  const selectedCodes = new Set(codes.filter((code) => allowedCodes.has(code)))

  return getVisibleMeatCodes(sizeCode).filter((code) => selectedCodes.has(code))
}

export const getOrderDateKey = (value: ConfigType): string =>
  dayjs(value).tz(ORDER_TIME_ZONE).format('YYYY-MM-DD')

export const getOrderDayRange = (referenceTime?: ConfigType): OrderDayRange => {
  const day = dayjs(referenceTime).tz(ORDER_TIME_ZONE)

  // Resolve both boundaries in the business timezone rather than assuming
  // every local day is 24 hours (Shanghai historically observed DST).
  return {
    startAt: day.startOf('day').valueOf(),
    endAt: day.endOf('day').valueOf() + 1,
  }
}

export const isOrderInDayRange = (
  order: OrderDateInput,
  { startAt, endAt }: OrderDayRange,
): boolean => {
  const createdAt = dayjs(order.createdAt).valueOf()
  return createdAt >= startAt && createdAt < endAt
}

export const isOrderCreatedToday = (
  order: OrderDateInput,
  referenceTime?: ConfigType,
): boolean => isOrderInDayRange(order, getOrderDayRange(referenceTime))

export const deriveDisplayNoFromId = (id: string): string | null => {
  if (!id) {
    return null
  }

  if (/^\d{12}$/.test(id)) {
    return id.slice(-4)
  }

  return null
}
