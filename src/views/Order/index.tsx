import { CarbonArrowLeft } from "@/components/Icon"
import { OrderCreateForm, OrderList, OrderEditForm } from "@/components/Order"
import { useOrderStore } from "@/store/order"
import { Filter } from "@/types"
import dayjs from "dayjs"
import React, { useMemo } from "react"
import { useNavigate } from "react-router"

const Order: React.FC = () => {
  const navigate = useNavigate()

  const orders = useOrderStore(state => state.orders)
  const filter = useOrderStore(state => state.filter)
  const setFilter = useOrderStore(state => state.setFilter)

  const NavToHomeView = () => {
    navigate("/", {
      replace: true,
    })
  }

  const handleFilterChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = event.target.value as Filter
    setFilter(selected)
  }

  const { todayCompletedCount, uncompletedCount } = useMemo(() => {
    const now = dayjs()
    const todayDate = now.date()
    
    let todayCompleted = 0
    let uncompleted = 0

    orders.forEach(item => {
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
      uncompletedCount: uncompleted
    }
  }, [orders])

  return (
    <div>
      <div className="fixed top-0 left-0 right-0 z-10 h-16 mt-4 bg-base-200 flex justify-between items-center px-4">
        <button className="btn btn-ghost" onClick={NavToHomeView}>
          <CarbonArrowLeft className="size-10" />
        </button>

        <div>
          <span className="text-2xl">{dayjs().date()}日已完成 {todayCompletedCount}</span>
        </div>

        <div>
          <span className="text-2xl">未完成 </span>
          <span className="text-2xl">{uncompletedCount}</span>
        </div>

        <select className="select w-32" value={filter} onChange={handleFilterChange}>
          <option value="all">全部</option>
          <option value="uncompleted">未完成</option>
          <option value="completed">已完成</option>
        </select>

        <OrderCreateForm />
      </div>
      <div className="mt-20 h-[calc(100vh-6rem)]">
        <OrderList />
      </div>
      <OrderEditForm />
    </div>
  )
}

export default Order
