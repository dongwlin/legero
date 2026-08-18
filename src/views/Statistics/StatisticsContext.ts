import { createContext, useContext } from 'react'
import type { DailyStats } from '@/services/statistics'

export interface StatisticsContextValue {
  errorMessage: string | null
  fromDate: string
  isLoading: boolean
  onCalculate: () => void
  onFromDateChange: (value: string) => void
  onToDateChange: (value: string) => void
  stats: Map<string, DailyStats>
  toDate: string
}

export const StatisticsContext = createContext<StatisticsContextValue | null>(
  null,
)

export const useStatisticsContext = (): StatisticsContextValue => {
  const context = useContext(StatisticsContext)
  if (!context) {
    throw new Error('useStatisticsContext must be used inside StatisticsProvider')
  }

  return context
}
