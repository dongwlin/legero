import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import OrderItem from './OrderItem'
import { useOrderStore } from '@/store/order'
import { List, RowComponentProps, useDynamicRowHeight } from 'react-window'
import { AutoSizer } from 'react-virtualized-auto-sizer'
import { isOrderCreatedToday } from '@/services/orderDomainUtils'
import { formatPriceCents } from '@/services/orderPricing'
import { CarbonArrowUp } from '@/components/Icon'
import { Button, Card, EmptyState } from '@heroui/react'
import { NowProvider } from './NowContext'

const DEFAULT_ORDER_ROW_HEIGHT = 280

type RowProps = {
  orderIds: string[]
  isQuickCalcMode: boolean
  selectedOrderIdSet: Set<string>
  onEnterQuickCalc: (id: string) => void
  onToggleQuickCalcSelection: (id: string) => void
}

type VirtualOrderListProps = {
  filteredOrderIds: string[]
  rowHeightCacheKey: string
  isQuickCalcMode: boolean
  selectedOrderCount: number
  selectedOrderTotalPriceCents: number
  selectedOrderIdSet: Set<string>
  onEnterQuickCalc: (id: string) => void
  onToggleQuickCalcSelection: (id: string) => void
  onExitQuickCalc: () => void
}

const Row = ({
  index,
  style,
  orderIds,
  isQuickCalcMode,
  selectedOrderIdSet,
  onEnterQuickCalc,
  onToggleQuickCalcSelection,
}: RowComponentProps<RowProps>) => {
  const id = orderIds[index]
  return (
    <div style={style} className='px-1 py-1 md:px-2'>
      <OrderItem
        id={id}
        isQuickCalcMode={isQuickCalcMode}
        isQuickCalcSelected={selectedOrderIdSet.has(id)}
        onEnterQuickCalc={onEnterQuickCalc}
        onToggleQuickCalcSelection={onToggleQuickCalcSelection}
      />
    </div>
  )
}

const VirtualOrderList: React.FC<VirtualOrderListProps> = ({
  filteredOrderIds,
  rowHeightCacheKey,
  isQuickCalcMode,
  selectedOrderCount,
  selectedOrderTotalPriceCents,
  selectedOrderIdSet,
  onEnterQuickCalc,
  onToggleQuickCalcSelection,
  onExitQuickCalc,
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

  const rowProps = useMemo(
    () => ({
      orderIds: filteredOrderIds,
      isQuickCalcMode,
      selectedOrderIdSet,
      onEnterQuickCalc,
      onToggleQuickCalcSelection,
    }),
    [
      filteredOrderIds,
      isQuickCalcMode,
      selectedOrderIdSet,
      onEnterQuickCalc,
      onToggleQuickCalcSelection,
    ],
  )

  if (filteredOrderIds.length === 0) {
    return (
      <Card.Root
        variant='secondary'
        className='h-full border border-border/70 p-0 shadow-surface'
      >
        <Card.Content className='h-full p-4 md:p-6'>
          <EmptyState.Root className='flex h-full items-center justify-center rounded-2xl border border-dashed border-border/70 bg-background-secondary/40 px-6 py-10 text-center leading-6 text-muted text-base'>
            暂无相关订单
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
              rowCount={filteredOrderIds.length}
              rowHeight={dynamicRowHeight}
              rowProps={rowProps}
              rowComponent={Row}
              overscanCount={5}
              onScroll={handleScroll}
            />
          )}
        />
      </Card.Content>
      {isQuickCalcMode && selectedOrderCount > 0 ? (
        <Card.Root
          variant='secondary'
          className='fixed left-1/2 top-[calc(4.75rem+env(safe-area-inset-top)+0.25rem)] z-30 w-[min(28rem,calc(100vw-1.5rem))] -translate-x-1/2 border border-border/70 bg-background/95 shadow-2xl backdrop-blur-md'
        >
          <Card.Content className='flex min-h-18 items-center justify-between gap-2'>
            <div className='min-w-0'>
              <div className='text-xs font-semibold uppercase tracking-[0.24em] text-muted'>
                快速计算
              </div>
              <div className='mt-1 text-sm text-muted md:text-base'>
                已选 {selectedOrderCount} 单
              </div>
            </div>
            <div className='text-2xl font-semibold tabular-nums text-foreground md:text-3xl'>
              {formatPriceCents(selectedOrderTotalPriceCents)}
            </div>
          </Card.Content>
        </Card.Root>
      ) : null}
      {isQuickCalcMode ? (
        <Button.Root
          variant='secondary'
          className='fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-[calc(1rem+env(safe-area-inset-left))] z-30 h-12 rounded-full border border-border/60 bg-background/95 px-4 shadow-lg backdrop-blur-md md:h-13'
          aria-label='退出快速计算'
          onPress={onExitQuickCalc}
        >
          <span className='text-sm font-semibold md:text-base'>退出计算</span>
        </Button.Root>
      ) : null}
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
  const ordersById = useOrderStore((state) => state.ordersById)
  const orderDisplayIds = useOrderStore((state) => state.orderDisplayIds)
  const filter = useOrderStore((state) => state.filter)
  const isQuickCalcMode = useOrderStore((state) => state.isQuickCalcMode)
  const quickCalcSelectedOrderIds = useOrderStore(
    (state) => state.quickCalcSelectedOrderIds,
  )
  const enterQuickCalcWith = useOrderStore((state) => state.enterQuickCalcWith)
  const toggleQuickCalcSelection = useOrderStore(
    (state) => state.toggleQuickCalcSelection,
  )
  const exitQuickCalc = useOrderStore((state) => state.exitQuickCalc)
  const pruneQuickCalcSelection = useOrderStore(
    (state) => state.pruneQuickCalcSelection,
  )

  const filteredOrderIds = useMemo(() => {
    const todayIds = orderDisplayIds.filter((id) =>
      isOrderCreatedToday(ordersById[id]),
    )

    switch (filter) {
      case 'uncompleted':
        return todayIds.filter((id) => ordersById[id].completedAt === null)
      case 'completed':
        return todayIds
          .filter((id) => ordersById[id].completedAt !== null)
          .sort(
            (a, b) =>
              new Date(ordersById[b].completedAt ?? 0).getTime() -
              new Date(ordersById[a].completedAt ?? 0).getTime(),
          )
      default:
        return todayIds
    }
  }, [ordersById, orderDisplayIds, filter])

  const selectedOrderIdSet = useMemo(
    () => new Set(quickCalcSelectedOrderIds),
    [quickCalcSelectedOrderIds],
  )
  const selectedOrderTotalPriceCents = useMemo(
    () =>
      quickCalcSelectedOrderIds.reduce(
        (total, id) => total + (ordersById[id]?.totalPriceCents ?? 0),
        0,
      ),
    [quickCalcSelectedOrderIds, ordersById],
  )
  const hasActiveOrders = useMemo(
    () => filteredOrderIds.some((id) => ordersById[id]?.completedAt === null),
    [filteredOrderIds, ordersById],
  )

  const filteredOrderIdsKey = useMemo(
    () => filteredOrderIds.join('|'),
    [filteredOrderIds],
  )

  useEffect(() => {
    if (!isQuickCalcMode) {
      return
    }

    pruneQuickCalcSelection(filteredOrderIds)
  }, [filteredOrderIdsKey, filteredOrderIds, isQuickCalcMode, pruneQuickCalcSelection])

  return (
    <NowProvider active={hasActiveOrders}>
      <VirtualOrderList
        key={filter}
        filteredOrderIds={filteredOrderIds}
        rowHeightCacheKey={filteredOrderIdsKey}
        isQuickCalcMode={isQuickCalcMode}
        selectedOrderCount={quickCalcSelectedOrderIds.length}
        selectedOrderTotalPriceCents={selectedOrderTotalPriceCents}
        selectedOrderIdSet={selectedOrderIdSet}
        onEnterQuickCalc={enterQuickCalcWith}
        onToggleQuickCalcSelection={toggleQuickCalcSelection}
        onExitQuickCalc={exitQuickCalc}
      />
    </NowProvider>
  )
}

export default OrderList
