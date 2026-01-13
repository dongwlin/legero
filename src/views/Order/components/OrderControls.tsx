import { OrderCreateForm } from "@/components/Order"
import { useOrderStore } from "@/store/order"
import { Filter } from "@/types"
import dayjs from "dayjs"
import React, { useMemo } from "react"

const OrderControls: React.FC = () => {
  const orders = useOrderStore(state => state.orders)
  const filter = useOrderStore(state => state.filter)
  const setFilter = useOrderStore(state => state.setFilter)

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
    <div className="card bg-base-200 shadow-lg rounded-xl mb-4">
      <div className="card-body p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-row gap-4 w-full md:w-auto justify-between md:justify-start">
          <div className="flex flex-col items-center p-2 bg-base-100 rounded-lg shadow-sm w-full md:w-32">
            <span className="text-sm text-base-content/70">{dayjs().date()}日已完成</span>
            <span className="text-2xl font-bold text-success">{todayCompletedCount}</span>
          </div>
          <div className="flex flex-col items-center p-2 bg-base-100 rounded-lg shadow-sm w-full md:w-32">
            <span className="text-sm text-base-content/70">未完成</span>
            <span className="text-2xl font-bold text-warning">{uncompletedCount}</span>
          </div>
        </div>

        <div className="flex flex-row gap-4 w-full md:w-auto items-center">
          <select 
            className="select select-bordered w-full md:w-32" 
            value={filter} 
            onChange={handleFilterChange}
          >
            <option value="all">全部</option>
            <option value="uncompleted">未完成</option>
            <option value="completed">已完成</option>
          </select>
          
          <div className="flex-none">
            <OrderCreateForm />
          </div>
        </div>
      </div>
    </div>
  )
}

export default OrderControls