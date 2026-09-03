import { describe, expect, it } from 'vitest'
import {
  composeOrderRecord,
  createOrderRecord,
  normalizeOrderFormValue,
  rebuildOrderRecord,
} from '@/services/orderFactories'
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
  type OrderFormValue,
  type OrderRecord,
} from '@/types'

const makeForm = (overrides: Partial<OrderFormValue> = {}): OrderFormValue => ({
  ...DEFAULT_ORDER_FORM_VALUE,
  selectedMeatCodes: [...DEFAULT_ORDER_FORM_VALUE.selectedMeatCodes],
  ...overrides,
})

const metadata = {
  id: '202609030042',
  displayNo: null,
  version: 8,
  createdAt: '2026-09-03T10:00:00+08:00',
  updatedAt: '2026-09-03T10:00:00+08:00',
}

const makeRecord = (overrides: Partial<OrderRecord> = {}): OrderRecord => ({
  ...createOrderRecord(makeForm(), metadata),
  ...overrides,
})

describe('order factories', () => {
  it('normalizes quantities, meat visibility, and incompatible fields', () => {
    const normalized = normalizeOrderFormValue(
      makeForm({
        stapleTypeCode: STAPLE_TYPE.yiNoodle,
        sizeCode: SIZE.small,
        customSizePriceCents: 999,
        extraStapleUnits: 2.9,
        friedEggCount: -1.2,
        tofuSkewerCount: 3.8,
        selectedMeatCodes: [MEAT.kidney, MEAT.leanPork, MEAT.leanPork],
        diningMethodCode: DINING_METHOD.dineIn,
        packagingCode: PACKAGING.bag,
        packagingMethodCode: PACKAGING_METHOD.separated,
      }),
    )

    expect(normalized).toMatchObject({
      sizeCode: SIZE.small,
      customSizePriceCents: null,
      extraStapleUnits: 2,
      friedEggCount: 0,
      tofuSkewerCount: 3,
      selectedMeatCodes: [MEAT.leanPork],
      packagingCode: null,
      packagingMethodCode: null,
    })
  })

  it('normalizes rice small to medium and supplies rice takeout defaults', () => {
    const normalized = normalizeOrderFormValue(
      makeForm({
        stapleTypeCode: STAPLE_TYPE.rice,
        sizeCode: SIZE.small,
        stapleAmountCode: ADJUSTMENT.more,
        diningMethodCode: DINING_METHOD.takeout,
        packagingCode: null,
        packagingMethodCode: null,
      }),
    )

    expect(normalized.sizeCode).toBe(SIZE.medium)
    expect(normalized.stapleAmountCode).toBe(ADJUSTMENT.more)
    expect(normalized.packagingCode).toBe(PACKAGING.container)
    expect(normalized.packagingMethodCode).toBe(PACKAGING_METHOD.separated)
    expect(normalized.extraStapleUnits).toBe(0)
  })

  it('creates a record from normalized values with calculated price and initial statuses', () => {
    const record = createOrderRecord(
      makeForm({
        stapleTypeCode: STAPLE_TYPE.yiNoodle,
        sizeCode: SIZE.large,
        extraStapleUnits: 1.9,
        friedEggCount: 1,
        tofuSkewerCount: 1,
        selectedMeatCodes: [],
        diningMethodCode: DINING_METHOD.takeout,
        packagingCode: PACKAGING.container,
      }),
      metadata,
    )

    expect(record).toMatchObject({
      id: metadata.id,
      version: metadata.version,
      displayNo: '0042',
      totalPriceCents: 1600 + 300 + 200 + 200 + 50,
      stapleStepStatusCode: STEP_STATUS.notStarted,
      meatStepStatusCode: STEP_STATUS.unrequired,
      completedAt: null,
    })
  })

  it('clears a stale completed timestamp when composed statuses cannot serve', () => {
    const record = composeOrderRecord(
      makeForm({
        stapleTypeCode: STAPLE_TYPE.riceSheet,
        selectedMeatCodes: [MEAT.leanPork],
      }),
      { ...metadata, completedAt: '2026-09-03T10:05:00+08:00' },
      {
        stapleStepStatusCode: STEP_STATUS.completed,
        meatStepStatusCode: STEP_STATUS.notStarted,
      },
    )

    expect(record.completedAt).toBeNull()
  })

  it('rebuilds an edited record with fresh step requirements while preserving identity', () => {
    const baseRecord = makeRecord({
      displayNo: 'A42',
      version: 12,
      completedAt: '2026-09-03T10:05:00+08:00',
    })

    const rebuilt = rebuildOrderRecord(
      makeForm({
        stapleTypeCode: STAPLE_TYPE.rice,
        selectedMeatCodes: [],
        sizeCode: SIZE.small,
      }),
      baseRecord,
    )

    expect(rebuilt).toMatchObject({
      id: baseRecord.id,
      displayNo: 'A42',
      version: 12,
      createdAt: baseRecord.createdAt,
      updatedAt: baseRecord.updatedAt,
      stapleStepStatusCode: STEP_STATUS.unrequired,
      meatStepStatusCode: STEP_STATUS.unrequired,
      completedAt: null,
      sizeCode: SIZE.medium,
    })
  })
})
