import { calculateDailyStats, DailyStats } from '@/services/statistics'
import { useOrderStore } from '@/store/order'
import { usePasswordAuthStore } from '@/store/passwordAuth'
import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import DailyStatsCard from './components/DailyStatsCard'
import Header from '@/components/Header'
import StatisticsControls from './components/StatisticsControls'
import PasswordLockScreen from '@/components/PasswordLockScreen'

interface StatisticsViewProps {
  onCalculate: () => void
  stats: Map<string, DailyStats>
}

const StatisticsView: React.FC<StatisticsViewProps> = ({
  onCalculate,
  stats,
}) => {
  return (
    <div className='min-h-dvh bg-background pb-20 text-foreground'>
      <Header title='统计' />

      <main className='mx-auto max-w-4xl px-4 pt-[calc(5.25rem+env(safe-area-inset-top))] md:px-8'>
        <section className='mb-8'>
          <p className='text-xs font-medium uppercase tracking-[0.24em] text-muted md:text-sm'>
            Analytics
          </p>
          <h2 className='mt-3 text-3xl font-semibold tracking-tight md:text-4xl'>
            查看每日订单汇总与营业表现
          </h2>
          <p className='mt-3 max-w-2xl text-sm leading-6 text-muted md:text-base'>
            统计会基于当前设备中的订单数据生成每日汇总，方便你快速查看流水与订单量。
          </p>
        </section>

        <div className='space-y-6'>
          <StatisticsControls onCalculate={onCalculate} />
          <DailyStatsCard stats={stats} />
        </div>
      </main>
    </div>
  )
}

const Statistic: React.FC = () => {
  const orders = useOrderStore((state) => state.orders)
  const { enabled, isAuthenticated, authenticate, reset } =
    usePasswordAuthStore()
  const navigate = useNavigate()
  const [stats, setStats] = useState<Map<string, DailyStats>>(
    new Map<string, DailyStats>(),
  )

  // 每次进入统计页面时重置认证状态
  useEffect(() => {
    reset()
  }, [reset])

  const handleStatistics = () => {
    setStats(calculateDailyStats(orders))
  }

  const handleUnlock = () => {
    authenticate()
  }

  const handleCancel = () => {
    navigate('/', {
      replace: true,
    })
  }

  if (enabled && !isAuthenticated) {
    return (
      <PasswordLockScreen onUnlock={handleUnlock} onCancel={handleCancel} />
    )
  }

  return (
    <StatisticsView onCalculate={handleStatistics} stats={stats} />
  )
}

export default Statistic
