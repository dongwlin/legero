import { calculateDailyStats, DailyStats } from '@/services/statistics'
import { useOrderStore } from '@/store/order'
import { usePasswordAuthStore } from '@/store/passwordAuth'
import React, { useState } from 'react'
import DailyStatsCard from './components/DailyStatsCard'
import Header from '@/components/Header'
import StatisticsControls from './components/StatisticsControls'
import PasswordLockScreen from '@/components/PasswordLockScreen'

const Statistic: React.FC = () => {
  const orders = useOrderStore((state) => state.orders)
  const { enabled, isAuthenticated, authenticate, reset } = usePasswordAuthStore()
  const [stats, setStats] = useState<Map<string, DailyStats>>(
    new Map<string, DailyStats>()
  )

  const handleStatistics = () => {
    setStats(calculateDailyStats(orders))
  }

  const handleUnlock = () => {
    authenticate()
  }

  const handleLock = () => {
    reset()
    setStats(new Map<string, DailyStats>())
  }

  // 如果认证功能未启用，直接显示统计内容
  if (!enabled) {
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

  // 未认证时显示密码输入界面
  if (!isAuthenticated) {
    return <PasswordLockScreen onUnlock={handleUnlock} />
  }

  return (
    <div className='min-h-screen bg-base-100 pb-20'>
      {/* 顶部导航栏 */}
      <Header
        title='统计'
        rightAction={
          <button
            onClick={handleLock}
            className='btn btn-sm btn-ghost'
            aria-label='锁定页面'
          >
            退出
          </button>
        }
      />

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
