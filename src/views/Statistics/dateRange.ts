const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/** The API and UI allow at most one inclusive year of daily rows. */
export const MAX_STATISTICS_DAYS = 366

const millisecondsPerDay = 24 * 60 * 60 * 1000

const parseCalendarDate = (value: string): number | null => {
  const match = DATE_PATTERN.exec(value)
  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const timestamp = Date.UTC(year, month - 1, day)
  const parsed = new Date(timestamp)

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null
  }

  return timestamp
}

/**
 * Returns a user-facing validation message for a daily statistics range.
 * Returning null means the range is valid and can be sent to the API.
 */
export const validateStatisticsDateRange = (
  fromDate: string,
  toDate: string,
): string | null => {
  if (fromDate === '' || toDate === '') {
    return '请选择开始日期和结束日期。'
  }

  const fromTimestamp = parseCalendarDate(fromDate)
  const toTimestamp = parseCalendarDate(toDate)
  if (fromTimestamp === null || toTimestamp === null) {
    return '日期格式无效，请使用 YYYY-MM-DD。'
  }

  if (fromTimestamp > toTimestamp) {
    return '开始日期不能晚于结束日期。'
  }

  const inclusiveDays =
    Math.floor((toTimestamp - fromTimestamp) / millisecondsPerDay) + 1
  if (inclusiveDays > MAX_STATISTICS_DAYS) {
    return `单次最多查询 ${MAX_STATISTICS_DAYS} 天。`
  }

  return null
}
