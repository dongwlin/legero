import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import 'dayjs/locale/zh-cn'
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest'
import { server } from './mocks/server'

// The browser entrypoint performs this setup before mounting App. Integration
// tests mount the router directly, so mirror the production date configuration
// here for the real order controls and mappers.
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.locale('zh-cn')
dayjs.tz.setDefault('Asia/Shanghai')

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
})

beforeEach(() => {
  // jsdom does not implement matchMedia, while HeroUI's real Toast provider
  // uses it during render. Keep this browser API shim conditional so node
  // unit tests retain their normal environment.
  if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
    vi.stubGlobal('matchMedia', (query: string): MediaQueryList => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    }))
  }
})

afterEach(() => {
  // Existing unit tests perform their own cleanup. Calling it here as well
  // makes the shared integration harness safe for tests that omit boilerplate,
  // while the guard preserves node-environment unit test behavior.
  if (typeof document !== 'undefined') {
    cleanup()
  }

  server.resetHandlers()
  vi.useRealTimers()
})

afterAll(() => {
  server.close()
})
