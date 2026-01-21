import React, { useCallback, useMemo, useState, useRef } from "react"
import OrderItem from "./OrderItem"
import { useOrderStore } from "@/store/order"
import { List, RowComponentProps } from "react-window";
import { AutoSizer } from "react-virtualized-auto-sizer"
import { getMeatsRequest, getOtherRequest } from "@/services/order"
import { OrderItem as OrderItemType } from "@/types"
import { CarbonArrowUp } from "@/components/Icon"

type RowProps = {
  data: OrderItemType[]
}

const Row = ({ index, style, data }: RowComponentProps<RowProps>) => {
  // Fix for RowComponentProps
  const order = data[index]
  return (
    <div style={style} className="list-row border-b border-base-300 px-4 items-start py-4">
      <OrderItem {...order} />
    </div>
  )
}

const OrderList: React.FC = () => {
  const orders = useOrderStore((state) => state.orders)
  const filter = useOrderStore((state) => state.filter)
  const [showBackToTop, setShowBackToTop] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)

  const filteredOrders = useMemo(() => {
    switch (filter) {
      case "all":
        return orders
      case "uncompleted":
        return orders.filter((order) => !order.completedAt)
      case "completed":
        return orders.filter((order) => !!order.completedAt)
      default:
        return orders
    }
  }, [orders, filter])

  const getItemSize = (index: number) => {
    const item = filteredOrders[index]
    let height = 150 // Base height increased for safety

    const meatReq = getMeatsRequest(item)
    const otherReq = getOtherRequest(item)
    
    // Add height for each line of text, increased to account for text-2xl and margins
    if (meatReq !== "") height += 40 
    if (otherReq !== "") height += 40
    if (item.note !== "") height += 40

    return height
  }

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    scrollContainerRef.current = event.currentTarget
    setShowBackToTop(event.currentTarget.scrollTop > 0)
  }, [])

  const handleBackToTop = useCallback(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" })
  }, [])

  return (
    <div className="list rounded-box shadow-md w-full h-full bg-base-100 relative">
      <AutoSizer renderProp={({ height, width }) => (
        <List
          style={{ height: height ?? 0, width: width ?? 0 }}
          rowCount={filteredOrders.length}
          rowHeight={getItemSize}
          rowProps={{ data: filteredOrders }}
          rowComponent={Row}
          overscanCount={5}
          onScroll={handleScroll}
        />
      )} />
      {showBackToTop ? (
        <button
          type="button"
          className="btn btn-circle absolute bottom-4 left-1/2 -translate-x-1/2 border border-base-300/70 bg-base-100/80 text-base-content/60 shadow-md backdrop-blur hover:bg-base-200 hover:text-base-content/90"
          onClick={handleBackToTop}
          aria-label="返回顶部"
        >
          <CarbonArrowUp className="w-6 h-6" />
        </button>
      ) : null}
    </div>
  )
}

export default OrderList
