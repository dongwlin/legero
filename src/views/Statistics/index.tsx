import { calculateDailyStats, DailyStats } from '@/services/statistics'
import { useOrderStore } from '@/store/order'
import React, { useState } from 'react'
import DailyStatsCard from './components/DailyStatsCard'
import Header from '@/components/Header'
import StatisticsControls from './components/StatisticsControls'

const Statistic: React.FC = () => {
  const orders = useOrderStore((state) => state.orders)
  const [stats, setStats] = useState<Map<string, DailyStats>>(
    new Map<string, DailyStats>()
  )

  const handleStatistics = () => {
    setStats(calculateDailyStats(orders))
  }

  return (
    <div className='min-h-screen bg-base-100 pb-20'>
      {/* 顶部导航栏 */}
      <Header title='统计' />

      {/* 主内容区 */}
      <div className='pt-[calc(5rem+env(safe-area-inset-top))] px-4 md:px-8 max-w-4xl mx-auto'>
        {/* 统计操作部分 */}
        <StatisticsControls onCalculate={handleStatistics} />

        {/* 统计结果展示部分 */}
        <DailyStatsCard stats={stats} />
      </div>
    </div>
  )
}

export default Statistic
