type CodeValue<T extends Record<string, number>> = T[keyof T]

export const STAPLE_TYPE = {
  riceSheet: 1,
  riceVermicelli: 2,
  yiNoodle: 3,
  rice: 4,
} as const

export type StapleTypeKey = keyof typeof STAPLE_TYPE
export type StapleTypeCode = CodeValue<typeof STAPLE_TYPE>

export const ALL_STAPLE_TYPE_CODES = [
  STAPLE_TYPE.riceSheet,
  STAPLE_TYPE.riceVermicelli,
  STAPLE_TYPE.yiNoodle,
  STAPLE_TYPE.rice,
] as const satisfies readonly StapleTypeCode[]

export const SIZE = {
  small: 1,
  medium: 2,
  large: 3,
  custom: 4,
} as const

export type SizeKey = keyof typeof SIZE
export type SizeCode = CodeValue<typeof SIZE>

export const ALL_SIZE_CODES = [
  SIZE.small,
  SIZE.medium,
  SIZE.large,
  SIZE.custom,
] as const satisfies readonly SizeCode[]

export const ADJUSTMENT = {
  normal: 1,
  less: 2,
  more: 3,
  none: 4,
} as const

export type AdjustmentKey = keyof typeof ADJUSTMENT
export type AdjustmentCode = CodeValue<typeof ADJUSTMENT>

export const ALL_ADJUSTMENT_CODES = [
  ADJUSTMENT.normal,
  ADJUSTMENT.less,
  ADJUSTMENT.more,
  ADJUSTMENT.none,
] as const satisfies readonly AdjustmentCode[]

export const DINING_METHOD = {
  dineIn: 1,
  takeout: 2,
} as const

export type DiningMethodKey = keyof typeof DINING_METHOD
export type DiningMethodCode = CodeValue<typeof DINING_METHOD>

export const ALL_DINING_METHOD_CODES = [
  DINING_METHOD.dineIn,
  DINING_METHOD.takeout,
] as const satisfies readonly DiningMethodCode[]

export const PACKAGING = {
  container: 1,
  bag: 2,
} as const

export type PackagingKey = keyof typeof PACKAGING
export type PackagingCode = CodeValue<typeof PACKAGING>

export const ALL_PACKAGING_CODES = [
  PACKAGING.container,
  PACKAGING.bag,
] as const satisfies readonly PackagingCode[]

export const PACKAGING_METHOD = {
  together: 1,
  separated: 2,
} as const

export type PackagingMethodKey = keyof typeof PACKAGING_METHOD
export type PackagingMethodCode = CodeValue<typeof PACKAGING_METHOD>

export const ALL_PACKAGING_METHOD_CODES = [
  PACKAGING_METHOD.together,
  PACKAGING_METHOD.separated,
] as const satisfies readonly PackagingMethodCode[]

export const STEP_STATUS = {
  unrequired: 1,
  notStarted: 2,
  completed: 3,
} as const

export type StepStatusKey = keyof typeof STEP_STATUS
export type StepStatusCode = CodeValue<typeof STEP_STATUS>

export const ALL_STEP_STATUS_CODES = [
  STEP_STATUS.unrequired,
  STEP_STATUS.notStarted,
  STEP_STATUS.completed,
] as const satisfies readonly StepStatusCode[]

export const MEAT = {
  leanPork: 1,
  liver: 2,
  bloodCurd: 3,
  largeIntestine: 4,
  smallIntestine: 5,
  kidney: 6,
} as const

export type MeatKey = keyof typeof MEAT
export type MeatCode = CodeValue<typeof MEAT>

export const ALL_MEAT_CODES = [
  MEAT.leanPork,
  MEAT.liver,
  MEAT.bloodCurd,
  MEAT.largeIntestine,
  MEAT.smallIntestine,
  MEAT.kidney,
] as const satisfies readonly MeatCode[]
