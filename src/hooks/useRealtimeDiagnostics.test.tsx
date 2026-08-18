/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import type { FC } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RealtimeDiagnosticsSnapshot } from '@/services/realtimeDiagnostics'
import { RealtimeDiagnosticsProvider } from './RealtimeDiagnosticsProvider'
import { useRealtimeDiagnostics } from './useRealtimeDiagnostics'

const snapshot = (
  state: RealtimeDiagnosticsSnapshot['state'],
): RealtimeDiagnosticsSnapshot => ({
  state,
  failureStage: null,
  connectionAttemptCount: 1,
  reconnectCount: 0,
  lastReconnectReason: null,
  lastConnectDurationMs: null,
  lastClose: null,
  lastCloseCode: null,
  lastCloseReason: null,
  lastRecoveryDurationMs: null,
  recoveryCount: 0,
  heartbeatCount: 0,
  serverActivityCount: 0,
  lastServerActivityAt: null,
  currentServerActivityGapMs: null,
  lastServerActivityGapMs: null,
  serverActivityGapMs: null,
  staleCount: 0,
  networkOnline: null,
  networkType: null,
  appBackgrounded: null,
  snapshotReconciliation: {
    count: 0,
    failureCount: 0,
    cancelledCount: 0,
    lastDurationMs: null,
    lastFailureAt: null,
  },
  stateChanges: [],
})

const Reader: FC = () => {
  const access = useRealtimeDiagnostics()
  const current = access?.getDiagnostics() ?? null

  return <output>{current?.state ?? 'unavailable'}</output>
}

describe('RealtimeDiagnosticsProvider', () => {
  afterEach(() => {
    cleanup()
  })

  it('passes through the active session getter without creating a subscription', () => {
    const getDiagnostics = vi.fn(() => snapshot('online'))

    render(
      <RealtimeDiagnosticsProvider getDiagnostics={getDiagnostics}>
        <Reader />
      </RealtimeDiagnosticsProvider>,
    )

    expect(screen.getByText('online')).not.toBeNull()
    expect(getDiagnostics).toHaveBeenCalledTimes(1)
  })

  it('switches to a new workspace getter and does not retain the previous session', () => {
    const firstGetter = vi.fn(() => snapshot('online'))
    const secondGetter = vi.fn(() => snapshot('reconnecting'))
    const { rerender, unmount } = render(
      <RealtimeDiagnosticsProvider getDiagnostics={firstGetter}>
        <Reader />
      </RealtimeDiagnosticsProvider>,
    )

    expect(screen.getByText('online')).not.toBeNull()

    rerender(
      <RealtimeDiagnosticsProvider getDiagnostics={secondGetter}>
        <Reader />
      </RealtimeDiagnosticsProvider>,
    )

    expect(screen.getByText('reconnecting')).not.toBeNull()
    expect(screen.queryByText('online')).toBeNull()
    unmount()
  })

  it('returns no access outside the active protected workspace provider', () => {
    const UnscopedReader: FC = () => {
      const access = useRealtimeDiagnostics()
      return <output>{access ? 'available' : 'unavailable'}</output>
    }

    render(<UnscopedReader />)

    expect(screen.getByText('unavailable')).not.toBeNull()
  })
})
