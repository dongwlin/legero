import {
  ADJUSTMENT,
  DINING_METHOD,
  MEAT,
  PACKAGING,
  PACKAGING_METHOD,
  SIZE,
  STAPLE_TYPE,
  type AdjustmentCode,
  type DiningMethodCode,
  type MeatCode,
  type PackagingCode,
  type PackagingMethodCode,
  type SizeCode,
  type StapleTypeCode,
} from './codes'

export type OrderFormValue = {
  stapleTypeCode: StapleTypeCode | null
  sizeCode: SizeCode
  customSizePriceCents: number | null
  stapleAmountCode: AdjustmentCode
  extraStapleUnits: number
  friedEggCount: number
  tofuSkewerCount: number
  selectedMeatCodes: MeatCode[]
  greensCode: AdjustmentCode
  scallionCode: AdjustmentCode
  pepperCode: AdjustmentCode
  diningMethodCode: DiningMethodCode
  packagingCode: PackagingCode | null
  packagingMethodCode: PackagingMethodCode | null
  note: string
}

export const DEFAULT_STAPLE_TYPE_CODE = STAPLE_TYPE.riceSheet
export const DEFAULT_TAKEOUT_PACKAGING_CODE = PACKAGING.container
export const DEFAULT_TAKEOUT_PACKAGING_METHOD_CODE = PACKAGING_METHOD.together

export const DEFAULT_ORDER_FORM_VALUE: Readonly<OrderFormValue> = {
  stapleTypeCode: DEFAULT_STAPLE_TYPE_CODE,
  sizeCode: SIZE.small,
  customSizePriceCents: null,
  stapleAmountCode: ADJUSTMENT.normal,
  extraStapleUnits: 0,
  friedEggCount: 0,
  tofuSkewerCount: 0,
  selectedMeatCodes: [
    MEAT.leanPork,
    MEAT.liver,
    MEAT.bloodCurd,
    MEAT.largeIntestine,
    MEAT.smallIntestine,
  ],
  greensCode: ADJUSTMENT.normal,
  scallionCode: ADJUSTMENT.normal,
  pepperCode: ADJUSTMENT.normal,
  diningMethodCode: DINING_METHOD.dineIn,
  packagingCode: null,
  packagingMethodCode: null,
  note: '',
}
