import { describe, expect, it } from 'vitest'
import {
  createDefaultOrderFormValue,
  orderRecordToOrderFormValue,
} from '@/services/orderFormAdapter'
import {
  ADJUSTMENT,
  DEFAULT_ORDER_FORM_VALUE,
  DINING_METHOD,
  MEAT,
  PACKAGING,
  PACKAGING_METHOD,
  SIZE,
  STAPLE_TYPE,
  STEP_STATUS,
  type OrderRecord,
} from '@/types'

const makeRecord = (overrides: Partial<OrderRecord> = {}): OrderRecord => ({
  ...DEFAULT_ORDER_FORM_VALUE,
  id: 'order-1',
  version: 4,
  displayNo: '0001',
  totalPriceCents: 1200,
  stapleStepStatusCode: STEP_STATUS.notStarted,
  meatStepStatusCode: STEP_STATUS.completed,
  createdAt: '2026-01-01T10:00:00+08:00',
  updatedAt: '2026-01-01T10:01:00+08:00',
  completedAt: null,
  ...overrides,
})

describe('order form adapters', () => {
  it('creates independent default form values for each editing session', () => {
    const first = createDefaultOrderFormValue()
    const second = createDefaultOrderFormValue()

    expect(first).toEqual(DEFAULT_ORDER_FORM_VALUE)
    expect(first.selectedMeatCodes).not.toBe(second.selectedMeatCodes)

    first.selectedMeatCodes.pop()
    expect(second.selectedMeatCodes).toEqual(
      DEFAULT_ORDER_FORM_VALUE.selectedMeatCodes,
    )
  })

  it('copies editable fields without leaking record metadata or the meat array', () => {
    const record = makeRecord({
      stapleTypeCode: STAPLE_TYPE.yiNoodle,
      sizeCode: SIZE.large,
      customSizePriceCents: 2500,
      stapleAmountCode: ADJUSTMENT.more,
      extraStapleUnits: 2,
      friedEggCount: 1,
      tofuSkewerCount: 3,
      selectedMeatCodes: [MEAT.leanPork, MEAT.kidney],
      diningMethodCode: DINING_METHOD.takeout,
      packagingCode: PACKAGING.bag,
      packagingMethodCode: PACKAGING_METHOD.separated,
      note: '少盐',
    })

    const formValue = orderRecordToOrderFormValue(record)

    expect(formValue).toEqual({
      stapleTypeCode: STAPLE_TYPE.yiNoodle,
      sizeCode: SIZE.large,
      customSizePriceCents: 2500,
      stapleAmountCode: ADJUSTMENT.more,
      extraStapleUnits: 2,
      friedEggCount: 1,
      tofuSkewerCount: 3,
      selectedMeatCodes: [MEAT.leanPork, MEAT.kidney],
      greensCode: record.greensCode,
      scallionCode: record.scallionCode,
      pepperCode: record.pepperCode,
      diningMethodCode: DINING_METHOD.takeout,
      packagingCode: PACKAGING.bag,
      packagingMethodCode: PACKAGING_METHOD.separated,
      note: '少盐',
    })
    expect(formValue.selectedMeatCodes).not.toBe(record.selectedMeatCodes)
    expect(formValue).not.toHaveProperty('id')
    expect(formValue).not.toHaveProperty('totalPriceCents')
    expect(formValue).not.toHaveProperty('completedAt')
  })
})
