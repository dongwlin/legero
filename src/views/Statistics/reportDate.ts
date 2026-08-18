import dayjs from 'dayjs'

const REPORT_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Returns true only for a real calendar date in the YYYY-MM-DD route shape. */
export const isValidReportDate = (
  value: string | undefined,
): value is string => {
  if (!value || !REPORT_DATE_PATTERN.test(value)) {
    return false
  }

  return dayjs(value).format('YYYY-MM-DD') === value
}
