import { CarbonChartMultitype } from '@/components/Icon'
import React from 'react'

interface StatisticsControlsProps {
  onCalculate: () => void
}

const StatisticsControls: React.FC<StatisticsControlsProps> = ({ onCalculate }) => {
  return (
    <div className="card bg-base-200 shadow-lg rounded-xl mb-6">
      <div className="card-body p-6">
        <h2 className="card-title text-lg md:text-xl mb-4">统计操作</h2>
        <p className="text-base-content/70 mb-4">点击下方按钮开始计算每日订单统计数据。</p>
        <button
          className="btn btn-primary w-full md:w-auto text-lg"
          onClick={onCalculate}
        >
          <CarbonChartMultitype className="w-6 h-6 mr-2" />
          开始统计
        </button>
      </div>
    </div>
  )
}

export default StatisticsControls