import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_ORDER_FORM_VALUE, STEP_STATUS, type OrderRecord } from '@/types'
import { orderTombstones } from './orderTombstones'

dayjs.extend(utc)
dayjs.extend(timezone)

const makeOrder = (
  id: string,
  createdAt: string,
  overrides: Partial<OrderRecord> = {},
): OrderRecord => ({
  ...DEFAULT_ORDER_FORM_VALUE,
  id,
  version: 1,
  displayNo: id,
  totalPriceCents: 1500,
  stapleStepStatusCode: STEP_STATUS.notStarted,
  meatStepStatusCode: STEP_STATUS.notStarted,
  createdAt,
  updatedAt: createdAt,
  completedAt: null,
  ...overrides,
})

describe('orderTombstones before_today barrier', () => {
  beforeEach(() => {
    orderTombstones.reset()
  })

  it('rejects upserts created before the pinned cutoff and accepts those on or after it', () => {
    orderTombstones.markBeforeTodayClear('2020-08-17')

    expect(
      orderTombstones.rejectsUpsert(
        makeOrder('old', '2020-08-16T23:59:59+08:00'),
      ),
    ).toBe(true)
    expect(
      orderTombstones.rejectsUpsert(
        makeOrder('onCutoff', '2020-08-17T00:00:00+08:00'),
      ),
    ).toBe(false)
    expect(
      orderTombstones.rejectsUpsert(
        makeOrder('afterCutoff', '2020-08-18T10:00:00+08:00'),
      ),
    ).toBe(false)
  })

  it('judges against the pinned cutoff, never the live date', () => {
    // Review blocker P1: the clear happened on the pinned business day, so an
    // order created that day must stay accepted no matter when the clock
    // says it is now. With the old `isOrderCreatedToday` guard this order
    // would flip to rejected the moment the calendar rolled past its day.
    orderTombstones.markBeforeTodayClear('2020-08-17')

    const order = makeOrder('a', '2020-08-17T10:00:00+08:00')

    expect(orderTombstones.rejectsUpsert(order)).toBe(false)
    expect(orderTombstones.isBeforeTodayCleared()).toBe(true)
    expect(orderTombstones.beforeTodayClearDateKeyValue()).toBe('2020-08-17')
  })

  it('re-pinning on a later clear moves the cutoff forward', () => {
    orderTombstones.markBeforeTodayClear('2020-08-17')
    orderTombstones.markBeforeTodayClear('2020-08-18')

    expect(
      orderTombstones.rejectsUpsert(
        makeOrder('aug17', '2020-08-17T10:00:00+08:00'),
      ),
    ).toBe(true)
    expect(
      orderTombstones.rejectsUpsert(
        makeOrder('aug18', '2020-08-18T10:00:00+08:00'),
      ),
    ).toBe(false)
  })

  it('has no date guard before any before_today clear', () => {
    expect(orderTombstones.isBeforeTodayCleared()).toBe(false)
    expect(orderTombstones.beforeTodayClearDateKeyValue()).toBeNull()
    expect(
      orderTombstones.rejectsUpsert(
        makeOrder('ancient', '2020-01-01T10:00:00+08:00'),
      ),
    ).toBe(false)
  })

  it('reset drops the pinned cutoff', () => {
    orderTombstones.markBeforeTodayClear('2020-08-17')
    orderTombstones.reset()

    expect(orderTombstones.isBeforeTodayCleared()).toBe(false)
    expect(
      orderTombstones.rejectsUpsert(
        makeOrder('ancient', '2020-01-01T10:00:00+08:00'),
      ),
    ).toBe(false)
  })
})

describe('orderTombstones full-clear pending barrier', () => {
  beforeEach(() => {
    orderTombstones.reset()
  })

  it('distinguishes pending clear from a permanent tombstone', () => {
    orderTombstones.bumpClearEpoch()
    orderTombstones.blockPendingClear('pending')

    expect(orderTombstones.isPendingClear('pending')).toBe(true)
    expect(orderTombstones.has('pending')).toBe(false)
    expect(orderTombstones.rejectsUpsert(makeOrder('pending', '2020-08-17T10:00:00+08:00'))).toBe(
      true,
    )

    orderTombstones.markRemoved('pending')
    orderTombstones.blockPendingClear('pending')

    expect(orderTombstones.isPendingClear('pending')).toBe(false)
    expect(orderTombstones.has('pending')).toBe(true)
  })

  it('promotes only ids absent from the raw post-clear snapshot', () => {
    orderTombstones.bumpClearEpoch()
    orderTombstones.blockPendingClear('deleted')
    orderTombstones.blockPendingClear('survivor')

    orderTombstones.confirmClearEpoch(new Set(['survivor']))

    expect(orderTombstones.has('deleted')).toBe(true)
    expect(orderTombstones.has('survivor')).toBe(false)
    expect(orderTombstones.isPendingClear('deleted')).toBe(false)
    expect(orderTombstones.isPendingClear('survivor')).toBe(false)
    expect(orderTombstones.isClearEpochOpen()).toBe(false)
  })

  it('clears pending ambiguity on reset without retaining a tombstone', () => {
    orderTombstones.bumpClearEpoch()
    orderTombstones.blockPendingClear('pending')

    orderTombstones.reset()

    expect(orderTombstones.isPendingClear('pending')).toBe(false)
    expect(orderTombstones.has('pending')).toBe(false)
    expect(orderTombstones.isClearEpochOpen()).toBe(false)
  })
})
