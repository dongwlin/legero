import type { ReportResponse } from '@/services/apiTypes'
import { Button, Card, EmptyState } from '@heroui/react'
import React from 'react'

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
                ? `选择 ${selectedDate} 后按需加载完整指标。`
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
          <div className='rounded-2xl border border-border/60 bg-background-secondary/40 px-4 py-4 text-sm leading-6'>
            <p className='font-medium text-foreground'>
              {report.startDate} 至 {report.endDate}
            </p>
            <p className='text-foreground-secondary'>
              报告周期：{report.period === 'day' ? '日报' : report.period}
            </p>
            <p className='mt-2 text-foreground-secondary'>完整指标已加载。</p>
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

