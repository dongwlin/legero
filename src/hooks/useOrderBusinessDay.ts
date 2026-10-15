import { useEffect, useState } from 'react'
import { getOrderDayRange } from '@/services/orderDomainUtils'

/** A stable memo dependency that advances at Shanghai midnight and on resume. */
export const useOrderBusinessDay = (): number => {
  const [dayStartAt, setDayStartAt] = useState(() => getOrderDayRange().startAt)

  useEffect(() => {
    const refresh = () => {
      const day = getOrderDayRange()
      setDayStartAt(day.startAt)
      window.clearTimeout(timer)
      timer = window.setTimeout(refresh, Math.max(1, day.endAt - Date.now() + 1))
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    // Correct a midnight crossed between initial render and effect setup.
    let timer = window.setTimeout(refresh, 0)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)

    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
    }
  }, [])

  return dayStartAt
}
