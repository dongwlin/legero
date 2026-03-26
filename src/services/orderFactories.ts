import {
  ADJUSTMENT,
  DINING_METHOD,
  PACKAGING,
  PACKAGING_METHOD,
  SIZE,
  STAPLE_TYPE,
  type OrderFormValue,
  type OrderRecord,
} from '@/types'
import {
  deriveDisplayNoFromId,
  normalizeSelectedMeatCodes,
} from './orderDomainUtils'
import { calculateOrderTotalPriceCents } from './orderPricing'
import {
  createInitialOrderStepStatus,
  synchronizeOrderCompletion,
} from './orderStatus'

type OrderRecordMetadata = Pick<OrderRecord, 'id' | 'displayNo' | 'createdAt' | 'completedAt'>

type OrderRecordStatusFields = Pick<
  OrderRecord,
  'stapleStepStatusCode' | 'meatStepStatusCode'
>

const normalizeSizeCodeForStapleType = (
  stapleTypeCode: OrderFormValue['stapleTypeCode'],
  sizeCode: OrderFormValue['sizeCode'],
): OrderFormValue['sizeCode'] =>
  stapleTypeCode === STAPLE_TYPE.rice && sizeCode === SIZE.small
    ? SIZE.medium
    : sizeCode

const normalizeCustomPriceCents = (
  sizeCode: OrderFormValue['sizeCode'],
  customSizePriceCents: OrderFormValue['customSizePriceCents'],
): number | null =>
  sizeCode === SIZE.custom
    ? customSizePriceCents == null
      ? null
      : Math.max(0, Math.trunc(customSizePriceCents))
    : null

export const normalizeOrderFormValue = (
  formValue: OrderFormValue,
): OrderFormValue => {
  const stapleTypeCode = formValue.stapleTypeCode
  const sizeCode = normalizeSizeCodeForStapleType(
    stapleTypeCode,
    formValue.sizeCode,
  )
  const diningMethodCode = formValue.diningMethodCode

  return {
    ...formValue,
    sizeCode,
    stapleAmountCode:
      stapleTypeCode === null ? ADJUSTMENT.normal : formValue.stapleAmountCode,
    extraStapleUnits:
      stapleTypeCode === STAPLE_TYPE.yiNoodle
        ? Math.max(0, Math.trunc(formValue.extraStapleUnits))
        : 0,
    selectedMeatCodes: normalizeSelectedMeatCodes(
      formValue.selectedMeatCodes,
      sizeCode,
    ),
    customSizePriceCents: normalizeCustomPriceCents(
      sizeCode,
      formValue.customSizePriceCents,
    ),
    packagingCode:
      diningMethodCode === DINING_METHOD.takeout
        ? (formValue.packagingCode ?? PACKAGING.container)
        : null,
    packagingMethodCode:
      diningMethodCode === DINING_METHOD.takeout
        ? (formValue.packagingMethodCode ??
          (stapleTypeCode === STAPLE_TYPE.rice
            ? PACKAGING_METHOD.separated
            : PACKAGING_METHOD.together))
        : null,
  }
}

export const composeOrderRecord = (
  formValue: OrderFormValue,
  metadata: OrderRecordMetadata,
  statusFields: OrderRecordStatusFields,
): OrderRecord => {
  const normalizedFormValue = normalizeOrderFormValue(formValue)

  return synchronizeOrderCompletion({
    ...normalizedFormValue,
    id: metadata.id,
    displayNo: metadata.displayNo ?? deriveDisplayNoFromId(metadata.id),
    totalPriceCents: calculateOrderTotalPriceCents(normalizedFormValue),
    stapleStepStatusCode: statusFields.stapleStepStatusCode,
    meatStepStatusCode: statusFields.meatStepStatusCode,
    createdAt: metadata.createdAt,
    completedAt: metadata.completedAt,
  })
}

export const createOrderRecord = (
  formValue: OrderFormValue,
  metadata: Pick<OrderRecordMetadata, 'id' | 'displayNo' | 'createdAt'>,
): OrderRecord => {
  const normalizedFormValue = normalizeOrderFormValue(formValue)

  return composeOrderRecord(
    normalizedFormValue,
    {
      ...metadata,
      completedAt: null,
    },
    createInitialOrderStepStatus(normalizedFormValue),
  )
}

export const rebuildOrderRecord = (
  formValue: OrderFormValue,
  baseRecord: OrderRecord,
): OrderRecord => {
  const normalizedFormValue = normalizeOrderFormValue(formValue)

  return composeOrderRecord(
    normalizedFormValue,
    {
      id: baseRecord.id,
      displayNo: baseRecord.displayNo,
      createdAt: baseRecord.createdAt,
      completedAt: null,
    },
    createInitialOrderStepStatus(normalizedFormValue),
  )
}
