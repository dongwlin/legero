import type { ReportResponse } from '@/services/apiTypes'
import { Button, Card, EmptyState } from '@heroui/react'
import React from 'react'
import ReportMetricItem from './ReportMetricItem'
import {
  formatDurationSeconds,
  formatMoneyCents,
  formatRatioMetric,
  formatStapleLabel,
} from './reportFormatters'

interface ReportDetailsCardProps {
  errorMessage: string | null
  isLoading: boolean
  onRefresh: () => void
  report: ReportResponse | null
  selectedDate: string | null
}

const ReportDetailsCard: React.FC<ReportDetailsCardProps> = ({
  errorMessage,
  isLoading,
  onRefresh,
  report,
  selectedDate,
}) => {
  return (
    <Card.Root
      variant='secondary'
      className='border border-border/70 p-0 shadow-surface'
    >
      <Card.Header className='gap-1 px-6 pt-6'>
        <div className='flex items-start justify-between gap-4'>
          <div className='min-w-0 space-y-1'>
            <Card.Title className='text-lg md:text-xl'>日报详情</Card.Title>
            <Card.Description className='leading-6'>
              {selectedDate
                ? `${selectedDate} 的完整经营指标。`
                : '选择上方任意日期，查看该日完整经营指标。'}
            </Card.Description>
          </div>
          {selectedDate ? (
            <Button.Root
              className='shrink-0'
              isDisabled={isLoading}
              variant='outline'
              onPress={onRefresh}
            >
              {isLoading ? '刷新中...' : '刷新'}
            </Button.Root>
          ) : null}
        </div>
      </Card.Header>

      <Card.Content className='px-6 pb-6 pt-4'>
        {errorMessage ? (
          <div
            className='rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm leading-6 text-danger'
            role='alert'
          >
            {errorMessage}
          </div>
        ) : isLoading ? (
          <div
            className='space-y-3 rounded-2xl border border-border/60 bg-background-secondary/40 px-4 py-5'
            role='status'
            aria-live='polite'
          >
            <div className='h-4 w-2/5 animate-pulse rounded bg-border/60' />
            <div className='h-10 w-full animate-pulse rounded bg-border/50' />
            <span className='sr-only'>日报加载中</span>
          </div>
        ) : report ? (
          <div className='space-y-5'>
            <div className='border-b border-border/60 pb-3 text-sm leading-6'>
              <p className='font-medium text-foreground'>
                {report.startDate === report.endDate
                  ? report.startDate
                  : `${report.startDate} 至 ${report.endDate}`}
              </p>
              <p className='text-foreground-secondary'>
                报告周期：{report.period === 'day' ? '日报' : report.period}
              </p>
            </div>

            {report.metrics.completedOrderCount === 0 ? (
              <p
                className='rounded-xl border border-dashed border-border/70 px-4 py-3 text-sm leading-6 text-foreground-secondary'
                role='status'
              >
                当日暂无完成订单，金额、比例和时长均按 0 展示。
              </p>
            ) : null}

            <section aria-labelledby='report-core-heading' className='space-y-2'>
              <h3 id='report-core-heading' className='text-sm font-semibold text-foreground'>
                核心经营
              </h3>
              <dl className='grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2'>
                <ReportMetricItem
                  label='营业额'
                  value={formatMoneyCents(report.metrics.revenueCents)}
                />
                <ReportMetricItem
                  label='完成订单'
                  value={`${report.metrics.completedOrderCount} 单`}
                />
                <ReportMetricItem
                  label='客单价'
                  value={formatMoneyCents(
                    report.metrics.averageOrderValueCents,
                  )}
                />
                <ReportMetricItem
                  label='平均出餐时间'
                  value={formatDurationSeconds(
                    report.metrics.averagePreparationSeconds,
                  )}
                />
                <ReportMetricItem
                  label='高峰时段'
                  value={
                    report.metrics.peak30MinuteBuckets.length > 0
                      ? report.metrics.peak30MinuteBuckets
                          .map(
                            (bucket) =>
                              `${bucket.start}–${bucket.end}（${bucket.orderCount} 单）`,
                          )
                          .join('、')
                      : '暂无高峰时段'
                  }
                />
              </dl>
            </section>

            <section
              aria-labelledby='report-order-mix-heading'
              className='space-y-2'
            >
              <h3
                id='report-order-mix-heading'
                className='text-sm font-semibold text-foreground'
              >
                订单构成
              </h3>
              <dl className='grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2'>
                <ReportMetricItem
                  label='主食销量'
                  value={
                    <span className='flex flex-wrap gap-x-3 gap-y-1'>
                      {report.metrics.stapleSales.map((sale) => (
                        <span key={sale.stapleTypeCode}>
                          {formatStapleLabel(sale.stapleTypeCode)} {sale.orderCount} 单
                        </span>
                      ))}
                    </span>
                  }
                  description={`无主食 ${report.metrics.noStapleOrderCount} 单 · 未知主食 ${report.metrics.unknownStapleOrderCount} 单`}
                />
                <ReportMetricItem
                  label='标准份量'
                  value={`标准 ${report.metrics.standardSize.standardCount} 单`}
                  description={`自定义 ${report.metrics.standardSize.customSizeOrderCount} 单`}
                />
                <ReportMetricItem
                  label='小份占比'
                  value={formatRatioMetric(report.metrics.standardSize.small)}
                />
                <ReportMetricItem
                  label='中份占比'
                  value={formatRatioMetric(report.metrics.standardSize.medium)}
                />
                <ReportMetricItem
                  label='大份占比'
                  value={formatRatioMetric(report.metrics.standardSize.large)}
                />
                <ReportMetricItem
                  label='加蛋数'
                  value={`${report.metrics.totalFriedEggCount} 个`}
                />
                <ReportMetricItem
                  label='外带比例'
                  value={formatRatioMetric(report.metrics.takeout)}
                />
              </dl>
            </section>

            <section
              aria-labelledby='report-customization-heading'
              className='space-y-2'
            >
              <h3
                id='report-customization-heading'
                className='text-sm font-semibold text-foreground'
              >
                客制化
              </h3>
              <dl className='grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3'>
                <ReportMetricItem
                  label='只要瘦肉'
                  value={formatRatioMetric(
                    report.metrics.customizations.leanMeatOnly,
                  )}
                />
                <ReportMetricItem
                  label='不要肠'
                  value={formatRatioMetric(
                    report.metrics.customizations.noIntestine,
                  )}
                />
                <ReportMetricItem
                  label='客制化合计'
                  value={formatRatioMetric(report.metrics.customizations.union)}
                />
              </dl>
            </section>
          </div>
        ) : (
          <EmptyState.Root className='rounded-2xl border border-dashed border-border/70 bg-background-secondary/40 px-6 py-8 text-center leading-6'>
            选择日期后加载日报详情
          </EmptyState.Root>
        )}
      </Card.Content>
    </Card.Root>
  )
}

export default ReportDetailsCard
