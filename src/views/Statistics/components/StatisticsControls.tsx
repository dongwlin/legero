import { Button, Card } from '@heroui/react'
import React from 'react'

const inputClassName =
  'w-full rounded-2xl border border-border/60 bg-background px-4 py-3 text-sm text-foreground outline-none transition-colors duration-200 focus:border-accent/50'

interface StatisticsControlsProps {
  fromDate: string
  isLoading: boolean
  onCalculate: () => void
  onFromDateChange: (value: string) => void
  onToDateChange: (value: string) => void
  toDate: string
}

const StatisticsControls: React.FC<StatisticsControlsProps> = ({
  fromDate,
  isLoading,
  onCalculate,
  onFromDateChange,
  onToDateChange,
  toDate,
}) => {
  return (
    <Card.Root
      variant='secondary'
      className='border border-border/70 p-0 shadow-surface'
    >
      <Card.Header className='gap-1 px-6 pt-6'>
        <Card.Title className='text-lg md:text-xl'>统计操作</Card.Title>
        <Card.Description className='leading-6'>
          选择统计区间后，请求后端生成每日订单汇总数据。
        </Card.Description>
      </Card.Header>
      <Card.Content className='px-6 pb-6 pt-4'>
        <div className='flex flex-col gap-4 md:flex-row md:items-end'>
          <label className='flex-1 space-y-2'>
            <span className='text-sm font-medium text-foreground'>开始日期</span>
            <input
              className={inputClassName}
              type='date'
              value={fromDate}
              onChange={(event) => onFromDateChange(event.target.value)}
            />
          </label>
          <label className='flex-1 space-y-2'>
            <span className='text-sm font-medium text-foreground'>结束日期</span>
            <input
              className={inputClassName}
              type='date'
              value={toDate}
              onChange={(event) => onToDateChange(event.target.value)}
            />
          </label>
          <Button.Root
            className='w-full md:w-auto'
            isDisabled={isLoading || fromDate === '' || toDate === ''}
            variant='primary'
            onPress={onCalculate}
          >
            {isLoading ? '统计中...' : '统计'}
          </Button.Root>
        </div>
      </Card.Content>
    </Card.Root>
  )
}

export default StatisticsControls
