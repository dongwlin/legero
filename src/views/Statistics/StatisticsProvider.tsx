import PasswordLockScreen from '@/components/PasswordLockScreen'
import { fetchDailyStats, type DailyStats } from '@/services/statistics'
import { usePasswordAuthStore } from '@/store/passwordAuth'
import dayjs from 'dayjs'
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useLocation, useNavigate } from 'react-router'
import { validateStatisticsDateRange } from './dateRange'
import {
  StatisticsContext,
  type StatisticsContextValue,
} from './StatisticsContext'

interface StatisticsProviderProps {
  children: ReactNode
}

export const StatisticsProvider = ({
  children,
}: StatisticsProviderProps) => {
  const passwordProtectionEnabled = usePasswordAuthStore(
    (state) => state.enabled,
  )
  const isPasswordAuthenticated = usePasswordAuthStore(
    (state) => state.isAuthenticated,
  )
  const authenticate = usePasswordAuthStore((state) => state.authenticate)
  const resetPasswordAuth = usePasswordAuthStore((state) => state.reset)
  const location = useLocation()
  const navigate = useNavigate()
  const [isSessionReady, setIsSessionReady] = useState(false)
  const [fromDate, setFromDate] = useState(() =>
    dayjs().startOf('month').format('YYYY-MM-DD'),
  )
  const [toDate, setToDate] = useState(() => dayjs().format('YYYY-MM-DD'))
  const [stats, setStats] = useState<Map<string, DailyStats>>(
    () => new Map<string, DailyStats>(),
  )
  const [requestError, setRequestError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const hasAutoLoadedRef = useRef(false)
  const hasInitializedSessionRef = useRef(false)
  const isStatisticsIndex =
    location.pathname === '/statistics' || location.pathname === '/statistics/'

  // The provider is mounted once for /statistics and both of its children.
  // Gate the outlet until reset has run so a direct report visit cannot issue
  // a request with a password session left over from another route.
  useEffect(() => {
    if (hasInitializedSessionRef.current) {
      return
    }

    hasInitializedSessionRef.current = true
    resetPasswordAuth()
    setIsSessionReady(true)
  }, [resetPasswordAuth])

  const rangeError = useMemo(
    () => validateStatisticsDateRange(fromDate, toDate),
    [fromDate, toDate],
  )

  const handleStatistics = useCallback(async () => {
    hasAutoLoadedRef.current = true
    const validationMessage = validateStatisticsDateRange(fromDate, toDate)
    if (validationMessage) {
      setRequestError(validationMessage)
      return
    }

    setIsLoading(true)
    setRequestError(null)

    try {
      const nextStats = await fetchDailyStats(fromDate, toDate)
      setStats(nextStats)
    } catch (error) {
      setRequestError(
        error instanceof Error ? error.message : '统计加载失败，请稍后重试。',
      )
    } finally {
      setIsLoading(false)
    }
  }, [fromDate, toDate])

  const handleFromDateChange = useCallback((value: string) => {
    setFromDate(value)
    setRequestError(null)
  }, [])

  const handleToDateChange = useCallback((value: string) => {
    setToDate(value)
    setRequestError(null)
  }, [])

  useEffect(() => {
    if (!isSessionReady || !isStatisticsIndex || hasAutoLoadedRef.current) {
      return
    }

    if (rangeError || (passwordProtectionEnabled && !isPasswordAuthenticated)) {
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
    handleStatistics,
    isPasswordAuthenticated,
    isSessionReady,
    isStatisticsIndex,
    passwordProtectionEnabled,
    rangeError,
  ])

  const handleCancel = useCallback(() => {
    const cancelPath = location.pathname.startsWith('/statistics/report/')
      ? '/statistics'
      : '/'
    navigate(cancelPath, { replace: true })
  }, [location.pathname, navigate])

  if (!isSessionReady) {
    return null
  }

  const contextValue: StatisticsContextValue = {
    errorMessage: rangeError ?? requestError,
    fromDate,
    isLoading,
    onCalculate: () => {
      void handleStatistics()
    },
    onFromDateChange: handleFromDateChange,
    onToDateChange: handleToDateChange,
    stats,
    toDate,
  }

  if (passwordProtectionEnabled && !isPasswordAuthenticated) {
    return (
      <PasswordLockScreen
        onUnlock={authenticate}
        onCancel={handleCancel}
      />
    )
  }

  return (
    <StatisticsContext.Provider value={contextValue}>
      {children}
    </StatisticsContext.Provider>
  )
}
