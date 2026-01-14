import { useOrderStore } from '@/store/order'
import React, { useState } from 'react'

const DataManagement: React.FC = () => {
  const clear = useOrderStore((state) => state.clearOrders)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const handleClear = () => {
    clear()
    setIsModalOpen(false)
  }

  return (
    <>
      <div className="card bg-base-200 shadow-lg rounded-xl">
        <div className="card-body p-6">
          <h2 className="card-title text-lg md:text-xl mb-4">数据管理</h2>
          <p className="text-base-content/70 mb-4">清空所有订单数据，此操作不可恢复。</p>
          <button
            className="btn btn-error w-full md:w-auto"
            onClick={() => setIsModalOpen(true)}
          >
            清空所有订单
          </button>
        </div>
      </div>

      <dialog className={`modal ${isModalOpen ? 'modal-open' : ''}`}>
        <div className="modal-box">
          <h3 className="font-bold text-lg mb-4">确认清空数据</h3>
          <p className="py-4">确定要清空所有订单数据吗？此操作不可恢复。</p>
          <div className="modal-action">
            <form method="dialog">
              <button className="btn" onClick={() => setIsModalOpen(false)}>
                取消
              </button>
            </form>
            <button className="btn btn-error" onClick={handleClear}>
              确认
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button onClick={() => setIsModalOpen(false)}>close</button>
        </form>
      </dialog>
    </>
  )
}

export default DataManagement
