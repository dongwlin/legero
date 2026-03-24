import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import OrderItem from './OrderItem'
import { useOrderStore } from '@/store/order'
import { List, RowComponentProps, useDynamicRowHeight } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'
import { OrderItem as OrderItemType } from '@/types'
import { CarbonArrowUp } from '@/components/Icon'
import { Button, Card, EmptyState } from '@heroui/react'

const DEFAULT_ORDER_ROW_HEIGHT = 280

type RowProps = {
  orders: OrderItemType[]
  now: number
}

type VirtualOrderListProps = {
  filteredOrders: OrderItemType[]
  now: number
  rowHeightCacheKey: string
}

const Row = ({ index, style, orders, now }: RowComponentProps<RowProps>) => {
  const order = orders[index]
  return (
    <div style={style} className='px-1 py-2 md:px-2'>
      <OrderItem order={order} now={now} />
    </div>
  )
}

const VirtualOrderList: React.FC<VirtualOrderListProps> = ({
  filteredOrders,
  now,
  rowHeightCacheKey,
}) => {
  const [showBackToTop, setShowBackToTop] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const dynamicRowHeight = useDynamicRowHeight({
    defaultRowHeight: DEFAULT_ORDER_ROW_HEIGHT,
    key: rowHeightCacheKey,
  })

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    scrollContainerRef.current = event.currentTarget
    setShowBackToTop(event.currentTarget.scrollTop > 0)
  }, [])

  const handleBackToTop = useCallback(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  if (filteredOrders.length === 0) {
    return (
      <Card.Root
        variant='secondary'
        className='h-full border border-border/70 p-0 shadow-surface'
      >
        <Card.Content className='h-full p-4 md:p-6'>
          <EmptyState.Root className='flex h-full items-center justify-center rounded-2xl border border-dashed border-border/70 bg-background-secondary/40 px-6 py-10 text-center leading-6 text-muted'>
            当前筛选条件下暂无订单
          </EmptyState.Root>
        </Card.Content>
      </Card.Root>
    )
  }

  return (
    <Card.Root
      variant='secondary'
      className='relative h-full border border-border/70 p-0 shadow-surface'
    >
      <Card.Content className='h-full overflow-hidden p-0'>
        <AutoSizer
          renderProp={({ height, width }) => (
            <List
              style={{ height: height ?? 0, width: width ?? 0 }}
              rowCount={filteredOrders.length}
              rowHeight={dynamicRowHeight}
              rowProps={{
                orders: filteredOrders,
                now,
              }}
              rowComponent={Row}
              overscanCount={5}
              onScroll={handleScroll}
            />
          )}
        />
      </Card.Content>
      {showBackToTop ? (
        <Button.Root
          isIconOnly
          variant='secondary'
          className='absolute bottom-4 left-1/2 z-10 size-12 -translate-x-1/2 rounded-full border border-border/60 bg-background/90 shadow-lg backdrop-blur-md'
          aria-label='返回顶部'
          onPress={handleBackToTop}
        >
          <CarbonArrowUp className='w-6 h-6' />
        </Button.Root>
      ) : null}
    </Card.Root>
  )
}

const OrderList: React.FC = () => {
  const orders = useOrderStore((state) => state.orders)
  const filter = useOrderStore((state) => state.filter)
  const [now, setNow] = useState(() => Date.now())

  const filteredOrders = useMemo(() => {
    switch (filter) {
      case 'all':
        return orders
      case 'uncompleted':
        return orders.filter((order) => !order.completedAt)
      case 'completed':
        return orders
          .filter((order) => !!order.completedAt)
          .sort(
            (a, b) =>
              new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime(),
          )
      default:
        return orders
    }
  }, [orders, filter])

  const filteredOrderIdsKey = useMemo(
    () => filteredOrders.map((order) => order.id).join('|'),
    [filteredOrders],
  )
  const hasActiveOrders = useMemo(
    () => filteredOrders.some((order) => !order.completedAt),
    [filteredOrders],
  )

  useEffect(() => {
    if (!hasActiveOrders) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      setNow(Date.now())
    })

    const interval = setInterval(() => {
      setNow(Date.now())
    }, 1000)

    return () => {
      window.cancelAnimationFrame(frameId)
      clearInterval(interval)
    }
  }, [hasActiveOrders])

  return (
    <VirtualOrderList
      key={filter}
      filteredOrders={filteredOrders}
      now={now}
      rowHeightCacheKey={filteredOrderIdsKey}
    />
  )
}

export default OrderList
