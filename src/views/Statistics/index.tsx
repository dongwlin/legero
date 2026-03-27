import { fetchDailyStats, DailyStats } from '@/services/statistics'
import PasswordLockScreen from '@/components/PasswordLockScreen'
import { usePasswordAuthStore } from '@/store/passwordAuth'
import dayjs from 'dayjs'
import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import DailyStatsCard from './components/DailyStatsCard'
import Header from '@/components/Header'
import StatisticsControls from './components/StatisticsControls'

interface StatisticsViewProps {
  errorMessage: string | null
  fromDate: string
  isLoading: boolean
  onCalculate: () => void
  onFromDateChange: (value: string) => void
  onToDateChange: (value: string) => void
  stats: Map<string, DailyStats>
  toDate: string
}

const StatisticsView: React.FC<StatisticsViewProps> = ({
  errorMessage,
  fromDate,
  isLoading,
  onCalculate,
  onFromDateChange,
  onToDateChange,
  stats,
  toDate,
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
            统计会请求后端返回指定日期区间内的每日汇总，方便你快速查看流水与订单量。
          </p>
        </section>

        <div className='space-y-6'>
          <StatisticsControls
            fromDate={fromDate}
            isLoading={isLoading}
            onCalculate={onCalculate}
            onFromDateChange={onFromDateChange}
            onToDateChange={onToDateChange}
            toDate={toDate}
          />
          {errorMessage ? (
            <p className='text-sm text-danger'>{errorMessage}</p>
          ) : null}
          <DailyStatsCard stats={stats} />
        </div>
      </main>
    </div>
  )
}

const Statistic: React.FC = () => {
  const passwordProtectionEnabled = usePasswordAuthStore(
    (state) => state.enabled,
  )
  const isPasswordAuthenticated = usePasswordAuthStore(
    (state) => state.isAuthenticated,
  )
  const authenticate = usePasswordAuthStore((state) => state.authenticate)
  const resetPasswordAuth = usePasswordAuthStore((state) => state.reset)
  const navigate = useNavigate()
  const [fromDate, setFromDate] = useState(() =>
    dayjs().startOf('month').format('YYYY-MM-DD'),
  )
  const [toDate, setToDate] = useState(() => dayjs().format('YYYY-MM-DD'))
  const [stats, setStats] = useState<Map<string, DailyStats>>(
    () => new Map<string, DailyStats>(),
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    resetPasswordAuth()
  }, [resetPasswordAuth])

  const handleStatistics = async () => {
    setIsLoading(true)
    setErrorMessage(null)

    try {
      const nextStats = await fetchDailyStats(fromDate, toDate)
      setStats(nextStats)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '统计加载失败，请稍后重试。')
    } finally {
      setIsLoading(false)
    }
  }

  const handleUnlock = () => {
    authenticate()
  }

  const handleCancel = () => {
    navigate('/', {
      replace: true,
    })
  }

  if (passwordProtectionEnabled && !isPasswordAuthenticated) {
    return (
      <PasswordLockScreen onUnlock={handleUnlock} onCancel={handleCancel} />
    )
  }

  return (
    <StatisticsView
      errorMessage={errorMessage}
      fromDate={fromDate}
      isLoading={isLoading}
      onCalculate={() => {
        void handleStatistics()
      }}
      onFromDateChange={setFromDate}
      onToDateChange={setToDate}
      stats={stats}
      toDate={toDate}
    />
  )
}

export default Statistic
