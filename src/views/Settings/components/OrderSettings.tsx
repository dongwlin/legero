import { useOrderSettingsStore } from '@/store/orderSettings'
import React from 'react'

const OrderSettings: React.FC = () => {
  const { waitTimeThresholdMinutes, setWaitTimeThresholdMinutes } = useOrderSettingsStore()

  const handleThresholdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10)
    if (!isNaN(value) && value >= 0) {
      setWaitTimeThresholdMinutes(value)
    }
  }

  return (
    <div className="card bg-base-200 shadow-lg rounded-xl mb-6">
      <div className="card-body p-6">
        <h2 className="card-title text-lg md:text-xl mb-4">订单设置</h2>
        <div className="form-control">
          <p className="text-base-content/70 mb-4">等待时间超时警告(分钟)</p>
          <input
            type="number"
            min="0"
            step="1"
            value={waitTimeThresholdMinutes}
            onChange={handleThresholdChange}
            className="input input-bordered w-full"
            placeholder="请输入分钟数，设置为 0 时不显示警告"
          />

        </div>
      </div>
    </div>
  )
}

export default OrderSettings
