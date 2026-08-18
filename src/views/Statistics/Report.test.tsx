/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { ReportResponse } from '@/services/apiTypes'
import { fetchReport } from '@/services/statistics'
import DailyReport from './Report'

const navigate = vi.hoisted(() => vi.fn())
const routeParams = vi.hoisted(() => ({ date: '2026-08-18' as string | undefined }))
const passwordAuthState = vi.hoisted(() => ({
  enabled: true,
  isAuthenticated: true,
  authenticate: vi.fn(),
}))

vi.mock('@/components/PasswordLockScreen', () => ({
  default: ({
    onCancel,
  }: {
    onCancel?: () => void
  }) => (
    <div role='dialog'>
      <button type='button' onClick={onCancel}>
        取消
      </button>
    </div>
  ),
}))

vi.mock('@/store/passwordAuth', () => ({
  usePasswordAuthStore: (
    selector: (state: typeof passwordAuthState) => unknown,
  ) => selector(passwordAuthState),
}))

vi.mock('@/services/statistics', () => ({
  fetchReport: vi.fn(),
}))

vi.mock('react-router', () => ({
  useNavigate: () => navigate,
  useParams: () => routeParams,
}))

vi.mock('@/components/Header', () => ({
  default: ({
    backLabel,
    backPath,
    title,
  }: {
    backLabel: string
    backPath: string
    title: string
  }) => (
    <button
      type='button'
      aria-label={backLabel}
      data-back-path={backPath}
      onClick={() => navigate(backPath)}
    >
      {title}
    </button>
  ),
}))

vi.mock('./components/ReportDetailsCard', () => ({
  default: ({
    errorMessage,
    isLoading,
    onRefresh,
    selectedDate,
  }: {
    errorMessage: string | null
    isLoading: boolean
    onRefresh: () => void
    selectedDate: string | null
  }) => (
    <section data-testid='report-details'>
      <span>{selectedDate}</span>
      {isLoading ? <span>加载中</span> : null}
      {errorMessage ? <p role='alert'>{errorMessage}</p> : null}
      <button type='button' onClick={onRefresh}>
        刷新
      </button>
    </section>
  ),
}))

vi.mock('@heroui/react', () => {
  const passthrough = ({
    children,
    ...props
  }: Record<string, unknown>) => (
    <div {...props}>{children as ReactNode}</div>
  )

  return {
    Button: {
      Root: ({
        children,
        onPress,
        ...props
      }: Record<string, unknown>) => (
        <button
          type='button'
          onClick={() => {
            if (typeof onPress === 'function') {
              onPress()
            }
          }}
          {...props}
        >
          {children as ReactNode}
        </button>
      ),
    },
    Card: {
      Root: passthrough,
      Header: passthrough,
      Title: passthrough,
      Description: passthrough,
      Content: passthrough,
    },
  }
})

const mockedFetchReport = vi.mocked(fetchReport)
const report = {
  period: 'day',
  startDate: '2026-08-18',
  endDate: '2026-08-18',
  metrics: {},
} as ReportResponse

describe('DailyReport', () => {
  beforeEach(() => {
    routeParams.date = '2026-08-18'
    passwordAuthState.enabled = true
    passwordAuthState.isAuthenticated = true
    mockedFetchReport.mockReset()
    navigate.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('loads one valid daily report and exposes the statistics fallback', async () => {
    mockedFetchReport.mockResolvedValue(report)

    render(<DailyReport />)

    await waitFor(() => expect(mockedFetchReport).toHaveBeenCalledOnce())
    expect(mockedFetchReport).toHaveBeenCalledWith('day', '2026-08-18')
    expect(screen.getByTestId('report-details')).not.toBeNull()
    expect(
      screen.getByRole('button', { name: '返回统计' }).getAttribute(
        'data-back-path',
      ),
    ).toBe('/statistics')
    expect(screen.getByRole('button', { name: '返回统计' }).textContent).toBe(
      '2026-08-18 日报',
    )
  })

  it('shows loading on the first valid-date frame before the request resolves', () => {
    mockedFetchReport.mockImplementation(
      () => new Promise<ReportResponse>(() => {}),
    )

    render(<DailyReport />)

    expect(screen.getByText('加载中')).not.toBeNull()
  })

  it('rejects invalid route dates without requesting a report and can recover', () => {
    routeParams.date = '2026-02-30'

    render(<DailyReport />)

    expect(mockedFetchReport).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('日期格式无效')
    const headerBackButton = screen
      .getAllByRole('button', { name: '返回统计' })
      .find((button) => button.getAttribute('data-back-path') === '/statistics')
    expect(headerBackButton?.textContent).toBe('日报详情')

    const backButtons = screen.getAllByRole('button', { name: '返回统计' })
    fireEvent.click(backButtons.at(-1)!)
    expect(navigate).toHaveBeenCalledWith('/statistics', { replace: true })
  })

  it('shows the password lock for a direct protected-page visit and cancels to statistics', () => {
    passwordAuthState.isAuthenticated = false

    render(<DailyReport />)

    expect(screen.getByRole('dialog')).not.toBeNull()
    expect(mockedFetchReport).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(navigate).toHaveBeenCalledWith('/statistics', { replace: true })
  })
})
