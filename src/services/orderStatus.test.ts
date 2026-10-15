import { describe, expect, it } from 'vitest'
import {
  canServeOrder,
  createInitialOrderStepStatus,
  isStepCompleted,
  needsMeatStep,
  needsStapleStep,
  synchronizeOrderCompletion,
  toggleOrderServed,
  toggleOrderStepStatus,
} from '@/services/orderStatus'
import {
  DEFAULT_ORDER_FORM_VALUE,
  MEAT,
  STAPLE_TYPE,
  STEP_STATUS,
  type OrderRecord,
} from '@/types'

const makeOrder = (overrides: Partial<OrderRecord> = {}): OrderRecord => ({
  ...DEFAULT_ORDER_FORM_VALUE,
  id: 'order-1',
  version: 1,
  displayNo: '0001',
  totalPriceCents: 1000,
  stapleStepStatusCode: STEP_STATUS.notStarted,
  meatStepStatusCode: STEP_STATUS.notStarted,
  createdAt: '2026-01-01T10:00:00+08:00',
  updatedAt: '2026-01-01T10:00:00+08:00',
  completedAt: null,
  ...overrides,
})

describe('order status rules', () => {
  it('requires a non-rice staple and selected meat, but not rice or empty meat', () => {
    expect(needsStapleStep({ stapleTypeCode: null, selectedMeatCodes: [] })).toBe(
      false,
    )
    expect(
      needsStapleStep({ stapleTypeCode: STAPLE_TYPE.rice, selectedMeatCodes: [] }),
    ).toBe(false)
    expect(
      needsStapleStep({
        stapleTypeCode: STAPLE_TYPE.riceSheet,
        selectedMeatCodes: [],
      }),
    ).toBe(true)
    expect(needsMeatStep({ stapleTypeCode: null, selectedMeatCodes: [] })).toBe(
      false,
    )
    expect(
      needsMeatStep({
        stapleTypeCode: null,
        selectedMeatCodes: [MEAT.leanPork],
      }),
    ).toBe(true)
  })

  it('initializes required steps as not started and optional steps as unrequired', () => {
    expect(
      createInitialOrderStepStatus({
        stapleTypeCode: STAPLE_TYPE.rice,
        selectedMeatCodes: [],
      }),
    ).toEqual({
      stapleStepStatusCode: STEP_STATUS.unrequired,
      meatStepStatusCode: STEP_STATUS.unrequired,
      completedAt: null,
    })
    expect(
      createInitialOrderStepStatus({
        stapleTypeCode: STAPLE_TYPE.yiNoodle,
        selectedMeatCodes: [MEAT.liver],
      }),
    ).toEqual({
      stapleStepStatusCode: STEP_STATUS.notStarted,
      meatStepStatusCode: STEP_STATUS.notStarted,
      completedAt: null,
    })
  })

  it('only serves an order when every required step is completed', () => {
    expect(
      canServeOrder(
        makeOrder({
          stapleStepStatusCode: STEP_STATUS.completed,
          meatStepStatusCode: STEP_STATUS.notStarted,
        }),
      ),
    ).toBe(false)
    expect(
      canServeOrder(
        makeOrder({
          stapleStepStatusCode: STEP_STATUS.completed,
          meatStepStatusCode: STEP_STATUS.completed,
        }),
      ),
    ).toBe(true)
    expect(
      canServeOrder(
        makeOrder({
          stapleTypeCode: STAPLE_TYPE.rice,
          selectedMeatCodes: [],
          stapleStepStatusCode: STEP_STATUS.unrequired,
          meatStepStatusCode: STEP_STATUS.unrequired,
        }),
      ),
    ).toBe(true)
  })

  it('toggles required steps and leaves an unrequired step untouched', () => {
    const started = makeOrder({
      completedAt: '2026-01-01T10:05:00+08:00',
      meatStepStatusCode: STEP_STATUS.completed,
    })
    const completed = toggleOrderStepStatus(started, 'staple')

    expect(completed.stapleStepStatusCode).toBe(STEP_STATUS.completed)
    expect(completed.completedAt).toBe('2026-01-01T10:05:00+08:00')

    const reset = toggleOrderStepStatus(completed, 'staple')
    expect(reset.stapleStepStatusCode).toBe(STEP_STATUS.notStarted)
    expect(reset.completedAt).toBeNull()

    const unrequired = makeOrder({
      stapleTypeCode: STAPLE_TYPE.rice,
      stapleStepStatusCode: STEP_STATUS.unrequired,
    })
    expect(toggleOrderStepStatus(unrequired, 'staple')).toBe(unrequired)
  })

  it('clears stale completion when a required step becomes incomplete', () => {
    const record = makeOrder({
      completedAt: '2026-01-01T10:05:00+08:00',
      meatStepStatusCode: STEP_STATUS.notStarted,
    })

    const synchronized = synchronizeOrderCompletion(record)

    expect(synchronized.completedAt).toBeNull()
    expect(synchronized.id).toBe(record.id)
  })

  it('marks a servable order served and toggles it back to active', () => {
    const record = makeOrder({
      stapleStepStatusCode: STEP_STATUS.completed,
      meatStepStatusCode: STEP_STATUS.completed,
    })

    const served = toggleOrderServed(record, '2026-01-01T10:06:00+08:00')
    expect(served.completedAt).toBe('2026-01-01T10:06:00+08:00')
    expect(toggleOrderServed(served, '2026-01-01T10:07:00+08:00').completedAt).toBeNull()

    const blocked = toggleOrderServed(
      makeOrder({ completedAt: '2026-01-01T10:05:00+08:00' }),
      '2026-01-01T10:08:00+08:00',
    )
    expect(blocked.completedAt).toBeNull()
  })

  it('recognizes only the completed step status as completed', () => {
    expect(isStepCompleted(STEP_STATUS.unrequired)).toBe(false)
    expect(isStepCompleted(STEP_STATUS.notStarted)).toBe(false)
    expect(isStepCompleted(STEP_STATUS.completed)).toBe(true)
  })
})
