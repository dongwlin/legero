import { fetchReport } from '@/services/statistics'
import type { ReportResponse } from '@/services/apiTypes'
import { useCallback, useEffect, useRef, useState } from 'react'

type ReportRequestOptions = {
  force?: boolean
}

type InFlightReportRequest = {
  generation: number
  promise: Promise<void>
}

export interface StatisticsReportsState {
  errorMessage: string | null
  isLoading: boolean
  report: ReportResponse | null
  onRefresh: () => void
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '日报加载失败，请稍后重试。'

/**
 * Loads the report for the current route date. The route owns the selected
 * date, so every derived value is read from that date's cache entry during
 * render; a route change cannot briefly display the previous report.
 */
export const useStatisticsReports = (
  date: string | null,
  enabled: boolean,
): StatisticsReportsState => {
  const [reportByDate, setReportByDate] = useState<Map<string, ReportResponse>>(
    () => new Map(),
  )
  const [loadingDate, setLoadingDate] = useState<string | null>(null)
  const [errorByDate, setErrorByDate] = useState<Map<string, string>>(
    () => new Map(),
  )
  const reportByDateRef = useRef(reportByDate)
  const inFlightRef = useRef(new Map<string, InFlightReportRequest>())
  const requestGenerationRef = useRef(0)

  const loadReport = useCallback(
    async (
      requestedDate: string,
      options: ReportRequestOptions = {},
    ): Promise<void> => {
      const { force = false } = options
      if (!force) {
        if (reportByDateRef.current.has(requestedDate)) {
          setErrorByDate((current) => {
            if (!current.has(requestedDate)) {
              return current
            }

            const next = new Map(current)
            next.delete(requestedDate)
            return next
          })
          return
        }

        const pending = inFlightRef.current.get(requestedDate)
        if (pending) {
          return pending.promise
        }
      }

      const generation = ++requestGenerationRef.current
      setLoadingDate(requestedDate)
      setErrorByDate((current) => {
        if (!current.has(requestedDate)) {
          return current
        }

        const next = new Map(current)
        next.delete(requestedDate)
        return next
      })

      const request = (async () => {
        try {
          const report = await fetchReport('day', requestedDate)
          reportByDateRef.current.set(requestedDate, report)
          setReportByDate(new Map(reportByDateRef.current))
        } catch (error) {
          setErrorByDate((current) => {
            const next = new Map(current)
            next.set(requestedDate, getErrorMessage(error))
            return next
          })
        } finally {
          if (
            inFlightRef.current.get(requestedDate)?.generation === generation
          ) {
            inFlightRef.current.delete(requestedDate)
          }
          if (generation === requestGenerationRef.current) {
            setLoadingDate(null)
          }
        }
      })()

      inFlightRef.current.set(requestedDate, { generation, promise: request })
      await request
    },
    [],
  )

  useEffect(() => {
    if (!enabled || !date) {
      return
    }

    void loadReport(date)
  }, [date, enabled, loadReport])

  const onRefresh = useCallback(() => {
    if (enabled && date) {
      void loadReport(date, { force: true })
    }
  }, [date, enabled, loadReport])

  const report = date ? (reportByDate.get(date) ?? null) : null
  const errorMessage = date ? (errorByDate.get(date) ?? null) : null
  const isLoading = Boolean(
    enabled &&
      date &&
      (loadingDate === date || (report === null && errorMessage === null)),
  )

  return {
    errorMessage,
    isLoading,
    report,
    onRefresh,
  }
}
