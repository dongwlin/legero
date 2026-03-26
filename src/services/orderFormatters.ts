import {
  ADJUSTMENT,
  DINING_METHOD,
  DINING_METHOD_LABELS,
  MEAT,
  MEAT_LABELS,
  PACKAGING,
  PACKAGING_METHOD,
  STAPLE_TYPE,
  STAPLE_TYPE_LABELS,
  type MeatCode,
  type OrderRecord,
} from '@/types'
import {
  deriveDisplayNoFromId,
  getVisibleMeatCodes,
  normalizeSelectedMeatCodes,
} from './orderDomainUtils'
import { formatPriceCents, getBasePriceCents } from './orderPricing'

const getAdjustmentLabel = (amountCode: OrderRecord['greensCode']): string => {
  switch (amountCode) {
    case ADJUSTMENT.less:
      return '少'
    case ADJUSTMENT.more:
      return '多'
    case ADJUSTMENT.none:
      return '不要'
    default:
      return '正常'
  }
}

const mergeExcludedIntestines = (meatCodes: readonly MeatCode[]): string[] => {
  const hasLargeIntestine = meatCodes.includes(MEAT.largeIntestine)
  const hasSmallIntestine = meatCodes.includes(MEAT.smallIntestine)

  if (!hasLargeIntestine || !hasSmallIntestine) {
    return meatCodes.map((code) => MEAT_LABELS[code])
  }

  const normalizedLabels: string[] = []
  let hasMergedIntestine = false

  for (const meatCode of meatCodes) {
    if (meatCode === MEAT.largeIntestine || meatCode === MEAT.smallIntestine) {
      if (!hasMergedIntestine) {
        normalizedLabels.push('肠')
        hasMergedIntestine = true
      }
      continue
    }

    normalizedLabels.push(MEAT_LABELS[meatCode])
  }

  return normalizedLabels
}

export const getStapleTypeLabel = (
  stapleTypeCode: OrderRecord['stapleTypeCode'],
): string | null =>
  stapleTypeCode === null ? null : STAPLE_TYPE_LABELS[stapleTypeCode]

export const getDiningMethodLabel = (
  diningMethodCode: OrderRecord['diningMethodCode'],
): string => DINING_METHOD_LABELS[diningMethodCode]

export const getDisplayNoText = (
  displayNo: string | null,
  id: string,
): string => {
  const rawDisplayNo = displayNo ?? deriveDisplayNoFromId(id) ?? id

  if (/^\d+$/.test(rawDisplayNo)) {
    return `#${Number(rawDisplayNo.slice(-4))}`
  }

  return `#${rawDisplayNo}`
}

export const getStapleToneClass = (
  stapleTypeCode: OrderRecord['stapleTypeCode'],
): string => {
  switch (stapleTypeCode) {
    case STAPLE_TYPE.riceSheet:
      return 'border-sky-500/35 bg-sky-500/12 text-sky-700 dark:text-sky-300'
    case STAPLE_TYPE.riceVermicelli:
      return 'border-emerald-500/35 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
    case STAPLE_TYPE.yiNoodle:
      return 'border-amber-500/35 bg-amber-500/12 text-amber-700 dark:text-amber-300'
    case STAPLE_TYPE.rice:
      return 'border-violet-500/35 bg-violet-500/12 text-violet-700 dark:text-violet-300'
    default:
      return 'border-border/70 bg-background text-foreground'
  }
}

export const formatMeatRequestText = (record: OrderRecord): string => {
  const visibleMeatCodes = getVisibleMeatCodes(record.sizeCode)
  const selectedMeatCodes = normalizeSelectedMeatCodes(
    record.selectedMeatCodes,
    record.sizeCode,
  )

  if (selectedMeatCodes.length === 0) {
    return '不要肉'
  }

  if (selectedMeatCodes.length === visibleMeatCodes.length) {
    return ''
  }

  const selectedMeatSet = new Set(selectedMeatCodes)
  const excludedMeatCodes = visibleMeatCodes.filter(
    (code) => !selectedMeatSet.has(code),
  )

  if (selectedMeatCodes.length <= excludedMeatCodes.length) {
    return `只要${selectedMeatCodes.map((code) => MEAT_LABELS[code]).join('、')}`
  }

  return `不要${mergeExcludedIntestines(excludedMeatCodes).join('、')}`
}

export const formatOtherRequestText = (record: OrderRecord): string => {
  const parts: string[] = []
  const stapleTypeLabel = getStapleTypeLabel(record.stapleTypeCode)

  if (record.stapleTypeCode === STAPLE_TYPE.yiNoodle && record.extraStapleUnits > 0) {
    parts.push(`加${record.extraStapleUnits}块面饼`)
  } else if (
    record.stapleTypeCode !== null &&
    record.stapleTypeCode !== STAPLE_TYPE.yiNoodle &&
    record.stapleAmountCode !== ADJUSTMENT.normal &&
    stapleTypeLabel
  ) {
    parts.push(`${getAdjustmentLabel(record.stapleAmountCode)}${stapleTypeLabel}`)
  }

  if (record.greensCode !== ADJUSTMENT.normal) {
    parts.push(`${getAdjustmentLabel(record.greensCode)}青菜`)
  }

  if (record.scallionCode !== ADJUSTMENT.normal) {
    parts.push(`${getAdjustmentLabel(record.scallionCode)}葱花`)
  }

  if (record.pepperCode !== ADJUSTMENT.normal) {
    parts.push(`${getAdjustmentLabel(record.pepperCode)}胡椒`)
  }

  if (record.diningMethodCode === DINING_METHOD.takeout) {
    if (record.packagingCode === PACKAGING.bag) {
      parts.push('用塑料袋装')
    }

    if (
      record.stapleTypeCode === STAPLE_TYPE.rice &&
      record.packagingMethodCode === PACKAGING_METHOD.together
    ) {
      parts.push('汤和主食装在一起')
    } else if (
      record.stapleTypeCode !== STAPLE_TYPE.rice &&
      record.packagingMethodCode === PACKAGING_METHOD.separated
    ) {
      parts.push('汤和主食分开装')
    }
  }

  return parts.join('，')
}

export const formatOrderSizePriceText = (record: OrderRecord): string =>
  formatPriceCents(getBasePriceCents(record))
