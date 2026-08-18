import { fetchDailyStats, DailyStats } from '@/services/statistics'
import PasswordLockScreen from '@/components/PasswordLockScreen'
import { usePasswordAuthStore } from '@/store/passwordAuth'
import dayjs from 'dayjs'
import React, { useCallback, useEffect, useRef, useState } from 'react'
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
  const hasAutoLoadedRef = useRef(false)

  useEffect(() => {
    resetPasswordAuth()
  }, [resetPasswordAuth])

  const handleStatistics = useCallback(async () => {
    hasAutoLoadedRef.current = true
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
  }, [fromDate, toDate])

  const handleUnlock = () => {
    authenticate()
  }

  const handleCancel = () => {
    navigate('/', {
      replace: true,
    })
  }

  useEffect(() => {
    if (hasAutoLoadedRef.current) {
      return
    }

    if (fromDate === '' || toDate === '') {
      return
    }

    if (passwordProtectionEnabled && !isPasswordAuthenticated) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      if (hasAutoLoadedRef.current) {
        return
      }

      void handleStatistics()
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [
    fromDate,
    handleStatistics,
    isPasswordAuthenticated,
    passwordProtectionEnabled,
    toDate,
  ])

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
