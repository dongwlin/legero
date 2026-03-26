import {
  ADJUSTMENT,
  MEAT,
  SIZE,
  type AdjustmentCode,
  type MeatCode,
  type Option,
  type PackagingMethodCode,
  type SizeCode,
  type StapleTypeCode,
} from '@/types'
import {
  ADJUSTMENT_LABELS,
  ADJUSTMENT_OPTIONS as CANONICAL_ADJUSTMENT_OPTIONS,
  DINING_METHOD_OPTIONS,
  MEAT_OPTIONS,
  PACKAGING_METHOD_OPTIONS,
  PACKAGING_OPTIONS,
  SIZE_OPTIONS,
  STAPLE_TYPE_OPTIONS as CANONICAL_STAPLE_TYPE_OPTIONS,
} from '@/types/options'

export const STAPLE_TYPE_OPTIONS: readonly Option<StapleTypeCode>[] =
  CANONICAL_STAPLE_TYPE_OPTIONS

export const SIZE_BUTTON_OPTIONS: readonly Option<SizeCode>[] = SIZE_OPTIONS

export const ADJUSTMENT_OPTIONS: readonly Option<AdjustmentCode>[] =
  CANONICAL_ADJUSTMENT_OPTIONS

export const DINING_METHOD_SELECT_OPTIONS = DINING_METHOD_OPTIONS

export const PACKAGING_SELECT_OPTIONS = PACKAGING_OPTIONS

export const PACKAGING_METHOD_SELECT_OPTIONS: readonly Option<PackagingMethodCode>[] =
  PACKAGING_METHOD_OPTIONS

export const MEAT_CHECKBOX_OPTIONS: readonly Option<MeatCode>[] = MEAT_OPTIONS

export const STAPLE_AMOUNT_LEVELS = [
  ADJUSTMENT.less,
  ADJUSTMENT.normal,
  ADJUSTMENT.more,
] as const satisfies readonly AdjustmentCode[]

export const PORK_KIDNEY_CODE = MEAT.kidney

export const isSmallSizeCode = (sizeCode: SizeCode): boolean =>
  sizeCode === SIZE.small

export const getStapleAmountLabel = (amountCode: AdjustmentCode): string =>
  amountCode === ADJUSTMENT.normal ? '标' : ADJUSTMENT_LABELS[amountCode]
