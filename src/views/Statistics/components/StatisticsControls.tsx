import { CarbonChartMultitype } from '@/components/Icon'
import { Button, Card } from '@heroui/react'
import React from 'react'

interface StatisticsControlsProps {
  onCalculate: () => void
}

const StatisticsControls: React.FC<StatisticsControlsProps> = ({
  onCalculate,
}) => {
  return (
    <Card.Root
      variant='secondary'
      className='border border-border/70 p-0 shadow-surface'
    >
      <Card.Header className='gap-1 px-6 pt-6'>
        <Card.Title className='text-lg md:text-xl'>统计操作</Card.Title>
        <Card.Description className='leading-6'>
          点击下方按钮开始计算每日订单统计数据。
        </Card.Description>
      </Card.Header>
      <Card.Content className='px-6 pb-6 pt-4'>
        <Button.Root
          className='w-full md:w-auto'
          variant='primary'
          onPress={onCalculate}
        >
          <CarbonChartMultitype className='size-5' />
          开始统计
        </Button.Root>
      </Card.Content>
    </Card.Root>
  )
}

export default StatisticsControls
