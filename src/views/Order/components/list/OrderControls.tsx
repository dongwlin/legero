import OrderForm from '../forms/OrderForm'
import { useOrderStore } from '@/store/order'
import { Filter } from '@/types'
import { Card, ListBox, Select } from '@heroui/react'
import dayjs from 'dayjs'
import React, { useMemo } from 'react'

const OrderControls: React.FC = () => {
  const orders = useOrderStore((state) => state.orders)
  const filter = useOrderStore((state) => state.filter)
  const setFilter = useOrderStore((state) => state.setFilter)

  const { todayCompletedCount, uncompletedCount } = useMemo(() => {
    const now = dayjs()
    const todayDate = now.date()

    let todayCompleted = 0
    let uncompleted = 0

    orders.forEach((item) => {
      // Check for uncompleted
      if (item.completedAt === '') {
        uncompleted++
      }

      // Check for today completed
      if (item.completedAt !== '') {
        const itemDate = dayjs(item.createdAt).date()
        if (itemDate === todayDate) {
          todayCompleted++
        }
      }
    })

    return {
      todayCompletedCount: todayCompleted,
      uncompletedCount: uncompleted,
    }
  }, [orders])

  return (
    <Card.Root
      variant='secondary'
      className='mb-4 border border-border/70 p-0 shadow-surface'
    >
      <Card.Content className='flex flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6'>
        <div className='grid w-full gap-3 grid-cols-2 md:w-auto'>
          <div className='rounded-2xl border border-border/60 bg-background px-4 py-3'>
            <div className='text-sm text-muted'>{dayjs().date()}日已完成</div>
            <div className='mt-1 text-2xl font-semibold text-success tabular-nums'>
              {todayCompletedCount}
            </div>
          </div>
          <div className='rounded-2xl border border-border/60 bg-background px-4 py-3'>
            <div className='text-sm text-muted'>未完成</div>
            <div className='mt-1 text-2xl font-semibold text-warning tabular-nums'>
              {uncompletedCount}
            </div>
          </div>
        </div>

        <div className='flex w-full gap-3 flex-row md:w-auto md:items-center'>
          <Select.Root
            aria-label='订单筛选'
            className='w-full md:w-40'
            value={filter}
            variant='secondary'
            onChange={(selected) => {
              if (typeof selected === 'string') {
                setFilter(selected as Filter)
              }
            }}
          >
            <Select.Trigger className='min-h-12 rounded-2xl border border-border/60 bg-background px-4 text-sm md:text-base'>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover className='rounded-2xl border border-border/70 bg-background shadow-xl'>
              <ListBox className='p-2'>
                <ListBox.Item id='all' textValue='全部' className='rounded-xl px-3 py-2 text-sm md:text-base'>
                  <div className='flex items-center justify-between gap-3'>
                    <span>全部</span>
                    <ListBox.ItemIndicator />
                  </div>
                </ListBox.Item>
                <ListBox.Item
                  id='uncompleted'
                  textValue='未完成'
                  className='rounded-xl px-3 py-2 text-sm md:text-base'
                >
                  <div className='flex items-center justify-between gap-3'>
                    <span>未完成</span>
                    <ListBox.ItemIndicator />
                  </div>
                </ListBox.Item>
                <ListBox.Item
                  id='completed'
                  textValue='已完成'
                  className='rounded-xl px-3 py-2 text-sm md:text-base'
                >
                  <div className='flex items-center justify-between gap-3'>
                    <span>已完成</span>
                    <ListBox.ItemIndicator />
                  </div>
                </ListBox.Item>
              </ListBox>
            </Select.Popover>
          </Select.Root>

          <div className='flex-none self-end sm:self-auto'>
            <OrderForm mode='create' />
          </div>
        </div>
      </Card.Content>
    </Card.Root>
  )
}

export default OrderControls
