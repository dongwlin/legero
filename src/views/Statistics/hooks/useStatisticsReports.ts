import { fetchReport } from '@/services/statistics'
import type { ReportResponse } from '@/services/apiTypes'
import { useCallback, useRef, useState } from 'react'

type ReportRequestOptions = {
  force?: boolean
}

export interface StatisticsReportsState {
  errorMessage: string | null
  isLoading: boolean
  report: ReportResponse | null
  selectedDate: string | null
  onDateSelect: (date: string) => void
  onRefresh: () => void
  reset: () => void
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '日报加载失败，请稍后重试。'

/**
 * Owns the interaction boundary for complete reports.
 *
 * Selecting a date starts exactly one request for that date. Results remain
 * cached for the current range, while refresh explicitly bypasses the cache
 * so mutations made in the order workspace can be reflected immediately.
 */
export const useStatisticsReports = (): StatisticsReportsState => {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [reportByDate, setReportByDate] = useState<Map<string, ReportResponse>>(
    () => new Map(),
  )
  const [loadingDate, setLoadingDate] = useState<string | null>(null)
  const [errorByDate, setErrorByDate] = useState<Map<string, string>>(
    () => new Map(),
  )
  const selectedDateRef = useRef<string | null>(null)
  const reportByDateRef = useRef(reportByDate)
  const inFlightRef = useRef(new Map<string, Promise<void>>())
  const requestGenerationRef = useRef(0)
  const cacheGenerationRef = useRef(0)

  const loadReport = useCallback(
    async (date: string, options: ReportRequestOptions = {}): Promise<void> => {
      const { force = false } = options
      if (!force) {
        if (reportByDateRef.current.has(date)) {
          setErrorByDate((current) => {
            if (!current.has(date)) {
              return current
            }

            const next = new Map(current)
            next.delete(date)
            return next
          })
          return
        }

        const pending = inFlightRef.current.get(date)
        if (pending) {
          return pending
        }
      }

      const generation = ++requestGenerationRef.current
      const cacheGeneration = cacheGenerationRef.current
      setLoadingDate(date)
      setErrorByDate((current) => {
        if (!current.has(date)) {
          return current
        }

        const next = new Map(current)
        next.delete(date)
        return next
      })

      const request = (async () => {
        try {
          const report = await fetchReport('day', date)
          if (cacheGeneration !== cacheGenerationRef.current) {
            return
          }

          reportByDateRef.current.set(date, report)
          setReportByDate(new Map(reportByDateRef.current))
        } catch (error) {
          if (cacheGeneration !== cacheGenerationRef.current) {
            return
          }

          setErrorByDate((current) => {
            const next = new Map(current)
            next.set(date, getErrorMessage(error))
            return next
          })
        } finally {
          inFlightRef.current.delete(date)
          if (generation === requestGenerationRef.current) {
            setLoadingDate(null)
          }
        }
      })()

      inFlightRef.current.set(date, request)
      await request
    },
    [],
  )

  const onDateSelect = useCallback(
    (date: string) => {
      selectedDateRef.current = date
      setSelectedDate(date)
      void loadReport(date)
    },
    [loadReport],
  )

  const onRefresh = useCallback(() => {
    const date = selectedDateRef.current
    if (date) {
      void loadReport(date, { force: true })
    }
  }, [loadReport])

  const reset = useCallback(() => {
    requestGenerationRef.current += 1
    cacheGenerationRef.current += 1
    selectedDateRef.current = null
    reportByDateRef.current.clear()
    inFlightRef.current.clear()
    setSelectedDate(null)
    setReportByDate(new Map())
    setErrorByDate(new Map())
    setLoadingDate(null)
  }, [])

  const errorMessage = selectedDate
    ? (errorByDate.get(selectedDate) ?? null)
    : null

  return {
    errorMessage,
    isLoading: selectedDate !== null && loadingDate === selectedDate,
    report: selectedDate ? (reportByDate.get(selectedDate) ?? null) : null,
    selectedDate,
    onDateSelect,
    onRefresh,
    reset,
  }
}
