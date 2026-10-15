import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { describe, expect, it } from 'vitest'
import {
  ALL_MEAT_CODES_IN_ORDER,
  deriveDisplayNoFromId,
  getOrderDateKey,
  getOrderDayRange,
  getVisibleMeatCodes,
  isOrderCreatedToday,
  normalizeSelectedMeatCodes,
} from '@/services/orderDomainUtils'
import { MEAT, SIZE, type MeatCode } from '@/types'

dayjs.extend(utc)
dayjs.extend(timezone)

describe('order domain utilities', () => {
  it('hides kidney for small orders and keeps canonical meat ordering', () => {
    expect(getVisibleMeatCodes(SIZE.small)).toEqual(
      ALL_MEAT_CODES_IN_ORDER.filter((code) => code !== MEAT.kidney),
    )
    expect(getVisibleMeatCodes(SIZE.large)).toEqual(ALL_MEAT_CODES_IN_ORDER)

    expect(
      normalizeSelectedMeatCodes(
        [MEAT.kidney, MEAT.smallIntestine, MEAT.leanPork, MEAT.leanPork],
        SIZE.small,
      ),
    ).toEqual([MEAT.leanPork, MEAT.smallIntestine])
    expect(
      normalizeSelectedMeatCodes(
        [MEAT.kidney, MEAT.leanPork, MEAT.kidney],
        SIZE.medium,
      ),
    ).toEqual([MEAT.leanPork, MEAT.kidney])
  })

  it('filters unknown meat codes while preserving the visible canonical order', () => {
    const selectedCodes = [99, MEAT.kidney, MEAT.liver, 0] as unknown as readonly MeatCode[]

    expect(normalizeSelectedMeatCodes(selectedCodes, SIZE.large)).toEqual([
      MEAT.liver,
      MEAT.kidney,
    ])
  })

  it('uses Asia/Shanghai when UTC crosses Shanghai business midnight', () => {
    expect(getOrderDateKey('2026-01-01T15:59:59.999Z')).toBe('2026-01-01')
    expect(getOrderDateKey('2026-01-01T16:00:00.000Z')).toBe('2026-01-02')
  })

  it('compares an order and reference by their business date', () => {
    expect(
      isOrderCreatedToday(
        { createdAt: '2026-01-01T23:59:59+08:00' },
        '2026-01-01T15:00:00Z',
      ),
    ).toBe(true)
    expect(
      isOrderCreatedToday(
        { createdAt: '2026-01-01T23:59:59+08:00' },
        '2026-01-01T16:00:00Z',
      ),
    ).toBe(false)
  })

  it('resolves Shanghai business-day boundaries independently of the host timezone', () => {
    const range = getOrderDayRange('2026-10-15T03:00:00-07:00')
    expect(range).toEqual({
      startAt: dayjs('2026-10-14T16:00:00Z').valueOf(),
      endAt: dayjs('2026-10-15T16:00:00Z').valueOf(),
    })
    expect(isOrderCreatedToday({ createdAt: 'invalid' }, range.startAt)).toBe(false)
  })

  it('does not assume historical Shanghai business days are always 24 hours', () => {
    const spring = getOrderDayRange('1991-04-14T12:00:00+09:00')
    const autumn = getOrderDayRange('1991-09-15T12:00:00+08:00')
    expect(spring.endAt - spring.startAt).toBe(23 * 60 * 60 * 1000)
    expect(autumn.endAt - autumn.startAt).toBe(25 * 60 * 60 * 1000)
  })

  it('derives the last four digits only from a twelve digit order id', () => {
    expect(deriveDisplayNoFromId('202609030042')).toBe('0042')
    expect(deriveDisplayNoFromId('20260903004')).toBeNull()
    expect(deriveDisplayNoFromId('order-42')).toBeNull()
    expect(deriveDisplayNoFromId('')).toBeNull()
  })
})
