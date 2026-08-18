import { STAPLE_TYPE_LABELS } from '@/types/options'
import type { ReportRatioMetric } from '@/services/apiTypes'
import { formatPriceCents } from '@/services/orderPricing'

const percentFormatter = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
  style: 'percent',
})

export const formatRatio = (ratio: number): string => {
  const safeRatio = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0
  return percentFormatter.format(safeRatio)
}

export const formatMoneyCents = (cents: number): string =>
  formatPriceCents(Number.isFinite(cents) ? cents : 0, {
    fixedFractionDigits: 2,
  })

export const formatRatioMetric = (metric: ReportRatioMetric): string =>
  `${formatRatio(metric.ratio)}（${metric.count}/${metric.denominator}）`

export const formatDurationSeconds = (seconds: number): string => {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0
  const minutes = Math.floor(safeSeconds / 60)
  const remainingSeconds = safeSeconds % 60

  if (minutes === 0) {
    return `${remainingSeconds}秒`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (hours === 0) {
    return `${minutes}分${remainingSeconds}秒`
  }

  return `${hours}小时${remainingMinutes}分${remainingSeconds}秒`
}

export const formatStapleLabel = (stapleTypeCode: number): string =>
  STAPLE_TYPE_LABELS[stapleTypeCode as keyof typeof STAPLE_TYPE_LABELS] ??
  `未知主食（${stapleTypeCode}）`
