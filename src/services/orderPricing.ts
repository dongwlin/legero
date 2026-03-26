import {
  DINING_METHOD,
  PACKAGING,
  SIZE,
  STAPLE_TYPE,
  type DiningMethodCode,
  type PackagingCode,
  type SizeCode,
  type StapleTypeCode,
} from '@/types'

type OrderPricingInput = {
  stapleTypeCode: StapleTypeCode | null
  sizeCode: SizeCode
  customSizePriceCents: number | null
  extraStapleUnits: number
  diningMethodCode: DiningMethodCode
  packagingCode: PackagingCode | null
}

const DEFAULT_BASE_PRICE_CENTS_BY_SIZE: Record<SizeCode, number> = {
  [SIZE.small]: 1000,
  [SIZE.medium]: 1200,
  [SIZE.large]: 1500,
  [SIZE.custom]: 0,
}

const YI_NOODLE_BASE_PRICE_CENTS_BY_SIZE: Record<SizeCode, number> = {
  [SIZE.small]: 1100,
  [SIZE.medium]: 1300,
  [SIZE.large]: 1600,
  [SIZE.custom]: 0,
}

export const EXTRA_STAPLE_UNIT_PRICE_CENTS = 300
export const PLASTIC_CONTAINER_PRICE_CENTS = 50

const getRiceBasePriceCents = (sizeCode: SizeCode): number => {
  switch (sizeCode) {
    case SIZE.large:
      return 2000
    case SIZE.medium:
    case SIZE.small:
      return 1500
    default:
      return 0
  }
}

export const getBasePriceCents = (input: OrderPricingInput): number => {
  if (input.sizeCode === SIZE.custom) {
    return Math.max(0, input.customSizePriceCents ?? 0)
  }

  if (input.stapleTypeCode === STAPLE_TYPE.rice) {
    return getRiceBasePriceCents(input.sizeCode)
  }

  const basePriceMap =
    input.stapleTypeCode === STAPLE_TYPE.yiNoodle
      ? YI_NOODLE_BASE_PRICE_CENTS_BY_SIZE
      : DEFAULT_BASE_PRICE_CENTS_BY_SIZE

  return basePriceMap[input.sizeCode]
}

export const calculateOrderTotalPriceCents = (
  input: OrderPricingInput,
): number => {
  let totalPriceCents = getBasePriceCents(input)

  if (input.stapleTypeCode === STAPLE_TYPE.yiNoodle) {
    totalPriceCents +=
      Math.max(0, Math.trunc(input.extraStapleUnits)) *
      EXTRA_STAPLE_UNIT_PRICE_CENTS
  }

  if (
    input.diningMethodCode === DINING_METHOD.takeout &&
    input.packagingCode === PACKAGING.container
  ) {
    totalPriceCents += PLASTIC_CONTAINER_PRICE_CENTS
  }

  return totalPriceCents
}

type FormatPriceOptions = {
  includeCurrencySymbol?: boolean
  fixedFractionDigits?: number
}

export const formatPriceCents = (
  cents: number,
  options: FormatPriceOptions = {},
): string => {
  const { includeCurrencySymbol = true, fixedFractionDigits } = options
  const amount = cents / 100
  const formattedAmount =
    fixedFractionDigits != null
      ? amount.toFixed(fixedFractionDigits)
      : Number.isInteger(amount)
        ? String(amount)
        : amount.toFixed(2).replace(/\.?0+$/, '')

  return includeCurrencySymbol ? `¥${formattedAmount}` : formattedAmount
}
