import type { DailyStats } from '@/services/statistics'
import React from 'react'
import DailyStatsCard from './components/DailyStatsCard'
import Header from '@/components/Header'
import StatisticsControls from './components/StatisticsControls'
import { useStatisticsContext } from './StatisticsContext'

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
  const {
    errorMessage,
    fromDate,
    isLoading,
    onCalculate,
    onFromDateChange,
    onToDateChange,
    stats,
    toDate,
  } = useStatisticsContext()

  return (
    <StatisticsView
      errorMessage={errorMessage}
      fromDate={fromDate}
      isLoading={isLoading}
      onCalculate={onCalculate}
      onFromDateChange={onFromDateChange}
      onToDateChange={onToDateChange}
      stats={stats}
      toDate={toDate}
    />
  )
}

export default Statistic
