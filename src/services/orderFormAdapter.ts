import {
  DEFAULT_ORDER_FORM_VALUE,
  type OrderFormValue,
  type OrderRecord,
} from '@/types'

const cloneDefaultOrderFormValue = (): OrderFormValue => ({
  ...DEFAULT_ORDER_FORM_VALUE,
  selectedMeatCodes: [...DEFAULT_ORDER_FORM_VALUE.selectedMeatCodes],
})

export const createDefaultOrderFormValue = (): OrderFormValue =>
  cloneDefaultOrderFormValue()

export const orderRecordToOrderFormValue = (
  record: OrderRecord,
): OrderFormValue => ({
  stapleTypeCode: record.stapleTypeCode,
  sizeCode: record.sizeCode,
  customSizePriceCents: record.customSizePriceCents,
  stapleAmountCode: record.stapleAmountCode,
  extraStapleUnits: record.extraStapleUnits,
  selectedMeatCodes: [...record.selectedMeatCodes],
  greensCode: record.greensCode,
  scallionCode: record.scallionCode,
  pepperCode: record.pepperCode,
  diningMethodCode: record.diningMethodCode,
  packagingCode: record.packagingCode,
  packagingMethodCode: record.packagingMethodCode,
  note: record.note,
})
