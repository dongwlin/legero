import React, { useMemo } from "react"
import OrderItem from "./OrderItem"
import { useOrderStore } from "@/store/order"
import { List, RowComponentProps } from "react-window";
import { AutoSizer } from "react-virtualized-auto-sizer"
import { getMeatsRequest, getOtherRequest } from "@/service/order"
import { OrderItem as OrderItemType } from "@/types"

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

  return (
    <div className="list rounded-box shadow-md w-full h-full bg-base-100">
      <AutoSizer renderProp={({ height, width }) => (
        <List
          style={{ height: height ?? 0, width: width ?? 0 }}
          rowCount={filteredOrders.length}
          rowHeight={getItemSize}
          rowProps={{ data: filteredOrders }}
          rowComponent={Row}
          overscanCount={5}
        />
      )} />
    </div>
  )
}

export default OrderList
