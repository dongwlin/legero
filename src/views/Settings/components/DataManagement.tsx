import { useOrderStore } from '@/store/order'
import React from 'react'

const DataManagement: React.FC = () => {
  const clear = useOrderStore((state) => state.clearOrders)

  return (
    <div className="card bg-base-200 shadow-lg rounded-xl">
      <div className="card-body p-6">
        <h2 className="card-title text-lg md:text-xl mb-4">数据管理</h2>
        <p className="text-base-content/70 mb-4">清空所有订单数据，此操作不可恢复。</p>
        <button
          className="btn btn-error w-full md:w-auto"
          onClick={clear}
        >
          清空所有订单
        </button>
      </div>
    </div>
  )
}

export default DataManagement
