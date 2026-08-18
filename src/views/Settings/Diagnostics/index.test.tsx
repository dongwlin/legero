/* @vitest-environment jsdom */

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RealtimeDiagnosticsSnapshot } from '@/services/realtimeDiagnostics'

const mocks = vi.hoisted(() => ({
  getDiagnostics: vi.fn(),
}))

vi.mock('@heroui/react', () => {
  const passthrough = ({ children, ...props }: Record<string, unknown>) => (
    <div {...props}>{children as ReactNode}</div>
  )
  const button = ({
    children,
    isDisabled,
    onPress,
    ...props
  }: Record<string, unknown>) => (
    <button
      {...props}
      disabled={Boolean(isDisabled)}
      onClick={onPress as (() => void) | undefined}
    >
      {children as ReactNode}
    </button>
  )

  return {
    Button: { Root: button },
    Card: {
      Root: passthrough,
      Header: passthrough,
      Title: passthrough,
      Description: passthrough,
      Content: passthrough,
    },
    Chip: { Root: passthrough, Label: passthrough },
    Disclosure: {
      Root: passthrough,
      Heading: passthrough,
      Trigger: button,
      Content: passthrough,
      Body: passthrough,
      Indicator: passthrough,
    },
    Separator: passthrough,
    Spinner: passthrough,
  }
})

vi.mock('@/components/Header', () => ({
  default: ({ title }: { title: string }) => <header>{title}</header>,
}))

vi.mock('@/hooks/useRealtimeDiagnostics', () => ({
  useRealtimeDiagnostics: () => ({ getDiagnostics: mocks.getDiagnostics }),
}))

import RealtimeDiagnostics from './index'

const makeSnapshot = (
  overrides: Partial<RealtimeDiagnosticsSnapshot> = {},
): RealtimeDiagnosticsSnapshot => ({
  state: 'online',
  failureStage: 'ws',
  connectionAttemptCount: 4,
  reconnectCount: 3,
  lastReconnectReason: 'network_recovery',
  lastConnectDurationMs: 183,
  lastClose: {
    at: Date.UTC(2026, 7, 18, 1, 31, 40),
    code: 1006,
    reason: 'network_offline',
  },
  lastCloseCode: 1006,
  lastCloseReason: 'network_offline',
  lastRecoveryDurationMs: 1200,
  recoveryCount: 2,
  heartbeatCount: 8,
  serverActivityCount: 11,
  lastServerActivityAt: Date.UTC(2026, 7, 18, 1, 31, 42),
  currentServerActivityGapMs: 3200,
  lastServerActivityGapMs: 21_000,
  serverActivityGapMs: 3200,
  staleCount: 1,
  networkOnline: true,
  networkType: 'wifi',
  appBackgrounded: false,
  snapshotReconciliation: {
    count: 4,
    failureCount: 1,
    cancelledCount: 0,
    lastDurationMs: 8427,
    lastFailureAt: Date.UTC(2026, 7, 18, 1, 30, 0),
  },
  stateChanges: [
    {
      at: Date.UTC(2026, 7, 18, 1, 30, 0),
      state: 'connecting',
      reason: 'connect_started',
    },
    {
      at: Date.UTC(2026, 7, 18, 1, 30, 2),
      state: 'online',
      reason: 'ready_received',
    },
  ],
  ...overrides,
})

describe('RealtimeDiagnostics viewer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.getDiagnostics.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('shows healthy connection, network, recovery, channel, and reconciliation metrics', () => {
    mocks.getDiagnostics.mockReturnValue(makeSnapshot())

    render(<RealtimeDiagnostics />)

    expect(screen.getAllByText('在线')).not.toHaveLength(0)
    expect(screen.getByText('Wi-Fi')).not.toBeNull()
    expect(screen.getByText('前台')).not.toBeNull()
    expect(screen.getByText('WebSocket')).not.toBeNull()
    expect(screen.getByText('收到握手确认')).not.toBeNull()
    expect(screen.getByText('网络恢复')).not.toBeNull()
    expect(screen.getByText('1.2 s')).not.toBeNull()
    expect(screen.getByText('183 ms')).not.toBeNull()
    expect(screen.getByText('3.2 秒')).not.toBeNull()
    expect(screen.getByText('21 秒')).not.toBeNull()
    expect(screen.getByText('成功对账次数')).not.toBeNull()
    expect(screen.getByText('对账失败次数')).not.toBeNull()
    expect(screen.getByText('最近状态变化')).not.toBeNull()
    expect(screen.getByText('收到握手确认')).not.toBeNull()

    expect(
      screen.getByText('成功对账次数').nextElementSibling?.textContent,
    ).toBe('4')
    expect(
      screen.getByText('对账失败次数').nextElementSibling?.textContent,
    ).toBe('1')

    const timelineItems = within(
      screen.getByRole('list', { name: '最近状态变化列表' }),
    ).getAllByRole('listitem')
    expect(timelineItems[0]?.textContent).toContain('在线')
    expect(timelineItems[1]?.textContent).toContain('正在连接')
  })

  it('shows failed state and its localized failure stage', () => {
    mocks.getDiagnostics.mockReturnValue(
      makeSnapshot({
        state: 'failed',
        failureStage: 'auth',
        networkOnline: false,
      }),
    )

    render(<RealtimeDiagnostics />)

    expect(screen.getAllByText('连接失败')).not.toHaveLength(0)
    expect(screen.getByText('身份认证')).not.toBeNull()
    expect(screen.getByText('离线')).not.toBeNull()
  })

  it('updates a mounted viewer at one-second intervals and clears polling on unmount', () => {
    const onlineSnapshot = makeSnapshot()
    const reconnectingSnapshot = makeSnapshot({
      state: 'reconnecting',
      failureStage: 'stale',
    })
    mocks.getDiagnostics.mockReturnValue(onlineSnapshot)

    const view = render(<RealtimeDiagnostics />)
    expect(screen.getAllByText('在线')).not.toHaveLength(0)

    mocks.getDiagnostics.mockReturnValue(reconnectingSnapshot)
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(screen.getAllByText('正在重连')).not.toHaveLength(0)
    expect(screen.getByLabelText('连接状态更新中')).not.toBeNull()
    view.unmount()
    const callsAfterUnmount = mocks.getDiagnostics.mock.calls.length
    vi.advanceTimersByTime(3000)
    expect(mocks.getDiagnostics).toHaveBeenCalledTimes(callsAfterUnmount)
  })

  it('shows a friendly unavailable state when no active sync session is exposed', () => {
    mocks.getDiagnostics.mockReturnValue(null)

    render(<RealtimeDiagnostics />)

    expect(screen.getByText('实时诊断暂不可用')).not.toBeNull()
    expect(screen.getByText(/没有可读取的工作区实时会话/)).not.toBeNull()
    expect(screen.queryByText('最近状态变化')).toBeNull()
  })

  it('keeps the timeline readable when no state changes are recorded', () => {
    mocks.getDiagnostics.mockReturnValue(makeSnapshot({ stateChanges: [] }))

    render(<RealtimeDiagnostics />)

    expect(screen.getByText('暂无连接状态记录')).not.toBeNull()
  })

  it('copies only the current snapshot and gives short feedback', async () => {
    vi.useRealTimers()
    const snapshot = makeSnapshot()
    mocks.getDiagnostics.mockReturnValue(snapshot)
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    render(<RealtimeDiagnostics />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '复制诊断信息' }))
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(writeText).toHaveBeenCalledWith(JSON.stringify(snapshot, null, 2))
    expect(await screen.findByText('已复制')).not.toBeNull()
    expect(screen.getByText(/诊断信息已复制/)).not.toBeNull()
  })
})
