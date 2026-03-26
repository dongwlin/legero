import {
  ADJUSTMENT,
  ALL_DINING_METHOD_CODES,
  ALL_MEAT_CODES,
  ALL_PACKAGING_CODES,
  ALL_PACKAGING_METHOD_CODES,
  ALL_SIZE_CODES,
  ALL_STAPLE_TYPE_CODES,
  ALL_STEP_STATUS_CODES,
  DINING_METHOD,
  MEAT,
  PACKAGING,
  PACKAGING_METHOD,
  SIZE,
  STAPLE_TYPE,
  STEP_STATUS,
  type AdjustmentCode,
  type DiningMethodCode,
  type MeatCode,
  type PackagingCode,
  type PackagingMethodCode,
  type SizeCode,
  type StapleTypeCode,
  type StepStatusCode,
} from './codes'

export type Option<T extends number> = Readonly<{
  value: T
  label: string
}>

const createOptions = <T extends number>(
  codes: readonly T[],
  labels: Readonly<Record<T, string>>,
): readonly Option<T>[] =>
  codes.map((value) => ({
    value,
    label: labels[value],
  }))

export const STAPLE_TYPE_LABELS = {
  [STAPLE_TYPE.riceSheet]: '河粉',
  [STAPLE_TYPE.riceVermicelli]: '米粉',
  [STAPLE_TYPE.yiNoodle]: '伊面',
  [STAPLE_TYPE.rice]: '饭',
} as const satisfies Readonly<Record<StapleTypeCode, string>>

export const STAPLE_TYPE_OPTIONS = createOptions(
  ALL_STAPLE_TYPE_CODES,
  STAPLE_TYPE_LABELS,
)

export const SIZE_LABELS = {
  [SIZE.small]: '小',
  [SIZE.medium]: '中',
  [SIZE.large]: '大',
  [SIZE.custom]: '自定义',
} as const satisfies Readonly<Record<SizeCode, string>>

export const SIZE_OPTIONS = createOptions(ALL_SIZE_CODES, SIZE_LABELS)

export const ADJUSTMENT_LABELS = {
  [ADJUSTMENT.normal]: '正常',
  [ADJUSTMENT.less]: '少',
  [ADJUSTMENT.more]: '多',
  [ADJUSTMENT.none]: '不要',
} as const satisfies Readonly<Record<AdjustmentCode, string>>

export const ADJUSTMENT_DISPLAY_ORDER = [
  ADJUSTMENT.more,
  ADJUSTMENT.normal,
  ADJUSTMENT.less,
  ADJUSTMENT.none,
] as const satisfies readonly AdjustmentCode[]

export const ADJUSTMENT_OPTIONS = createOptions(
  ADJUSTMENT_DISPLAY_ORDER,
  ADJUSTMENT_LABELS,
)

export const DINING_METHOD_LABELS = {
  [DINING_METHOD.dineIn]: '堂食',
  [DINING_METHOD.takeout]: '外带',
} as const satisfies Readonly<Record<DiningMethodCode, string>>

export const DINING_METHOD_OPTIONS = createOptions(
  ALL_DINING_METHOD_CODES,
  DINING_METHOD_LABELS,
)

export const PACKAGING_LABELS = {
  [PACKAGING.container]: '塑料盒',
  [PACKAGING.bag]: '塑料袋',
} as const satisfies Readonly<Record<PackagingCode, string>>

export const PACKAGING_OPTIONS = createOptions(
  ALL_PACKAGING_CODES,
  PACKAGING_LABELS,
)

export const PACKAGING_METHOD_LABELS = {
  [PACKAGING_METHOD.together]: '装在一起',
  [PACKAGING_METHOD.separated]: '汤和主食分开',
} as const satisfies Readonly<Record<PackagingMethodCode, string>>

export const PACKAGING_METHOD_OPTIONS = createOptions(
  ALL_PACKAGING_METHOD_CODES,
  PACKAGING_METHOD_LABELS,
)

export const STEP_STATUS_LABELS = {
  [STEP_STATUS.unrequired]: '无需处理',
  [STEP_STATUS.notStarted]: '未开始',
  [STEP_STATUS.completed]: '已完成',
} as const satisfies Readonly<Record<StepStatusCode, string>>

export const STEP_STATUS_OPTIONS = createOptions(
  ALL_STEP_STATUS_CODES,
  STEP_STATUS_LABELS,
)

export const MEAT_LABELS = {
  [MEAT.leanPork]: '瘦肉',
  [MEAT.liver]: '猪肝',
  [MEAT.bloodCurd]: '猪血',
  [MEAT.largeIntestine]: '大肠',
  [MEAT.smallIntestine]: '小肠',
  [MEAT.kidney]: '猪腰',
} as const satisfies Readonly<Record<MeatCode, string>>

export const MEAT_OPTIONS = createOptions(ALL_MEAT_CODES, MEAT_LABELS)
