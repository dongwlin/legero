import { describe, expect, it } from 'vitest'
import {
  MAX_STATISTICS_DAYS,
  validateStatisticsDateRange,
} from './dateRange'

describe('validateStatisticsDateRange', () => {
  it('accepts a same-day and maximum inclusive range', () => {
    expect(validateStatisticsDateRange('2026-08-18', '2026-08-18')).toBeNull()
    expect(
      validateStatisticsDateRange(
        '2026-01-01',
        '2027-01-01',
      ),
    ).toBeNull()
    expect(MAX_STATISTICS_DAYS).toBe(366)
  })

  it('rejects a range longer than the inclusive maximum', () => {
    expect(
      validateStatisticsDateRange('2026-01-01', '2027-01-02'),
    ).toBe('单次最多查询 366 天。')
  })

  it('rejects reversed and malformed dates before a request can start', () => {
    expect(
      validateStatisticsDateRange('2026-08-19', '2026-08-18'),
    ).toBe('开始日期不能晚于结束日期。')
    expect(
      validateStatisticsDateRange('2026-02-30', '2026-03-01'),
    ).toBe('日期格式无效，请使用 YYYY-MM-DD。')
  })
})
