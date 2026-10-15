/* @vitest-environment jsdom */

import dayjs from 'dayjs'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useOrderBusinessDay } from '@/hooks/useOrderBusinessDay'

describe('useOrderBusinessDay', () => {
  it('advances the memo dependency at Shanghai midnight without order updates', () => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-10-15T15:59:59.990Z')
    const { result, unmount } = renderHook(() => useOrderBusinessDay())
    expect(result.current).toBe(dayjs('2026-10-14T16:00:00Z').valueOf())

    act(() => { vi.advanceTimersByTime(11) })
    expect(result.current).toBe(dayjs('2026-10-15T16:00:00Z').valueOf())
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['focus', 'pageshow', 'visibilitychange'])(
    'corrects the business date after a suspended clock jump on %s',
    (event) => {
      vi.useFakeTimers()
      vi.setSystemTime('2026-10-15T12:00:00+08:00')
      const { result, unmount } = renderHook(() => useOrderBusinessDay())
      act(() => { vi.advanceTimersByTime(0) })
      const initial = result.current
      vi.setSystemTime('2026-10-17T12:00:00+08:00')

      act(() => {
        if (event === 'visibilitychange') {
          vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
          document.dispatchEvent(new Event(event))
        } else {
          window.dispatchEvent(new Event(event))
        }
      })
      expect(result.current).not.toBe(initial)
      expect(result.current).toBe(dayjs('2026-10-16T16:00:00Z').valueOf())
      unmount()
      expect(vi.getTimerCount()).toBe(0)
    },
  )
})
