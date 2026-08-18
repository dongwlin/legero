import { describe, expect, it } from 'vitest'
import { createRealtimeDiagnostics } from './realtimeDiagnostics'

describe('realtime diagnostics', () => {
  it('keeps lifecycle facts, close data, and recovery duration without payloads', () => {
    let monotonicNow = 100
    let wallClockNow = 1000
    const diagnostics = createRealtimeDiagnostics({
      clock: {
        monotonicNow: () => monotonicNow,
        wallClockNow: () => wallClockNow,
      },
      debug: true,
      maxStateChanges: 4,
    })

    diagnostics.transition('connecting', 'connect_started')
    diagnostics.recordConnectionAttempt('initial')
    diagnostics.recordFailure('session')
    monotonicNow = 250
    wallClockNow = 1250
    diagnostics.transition('reconnecting', 'reconnect_scheduled')
    diagnostics.recordClose(1006, 'server_restart')
    monotonicNow = 450
    wallClockNow = 1450
    diagnostics.transition('connecting', 'connect_started')
    diagnostics.recordConnectionAttempt('timer')
    diagnostics.beginConnectSession()
    monotonicNow = 700
    wallClockNow = 1700
    diagnostics.finishConnectSession(true)
    diagnostics.transition('online', 'ready_received')

    const snapshot = diagnostics.getSnapshot()

    expect(snapshot.failureStage).toBe('session')
    expect(snapshot.connectionAttemptCount).toBe(2)
    expect(snapshot.reconnectCount).toBe(1)
    expect(snapshot.lastReconnectReason).toBe('timer')
    expect(snapshot.lastConnectDurationMs).toBe(250)
    expect(snapshot.lastCloseCode).toBe(1006)
    expect(snapshot.lastCloseReason).toBe('server_restart')
    expect(snapshot.lastClose?.at).toBe(1250)
    expect(snapshot.lastRecoveryDurationMs).toBe(600)
    expect(snapshot.recoveryCount).toBe(1)
    expect(snapshot.stateChanges).toHaveLength(4)
    expect(snapshot.stateChanges).toEqual([
      { at: 1000, state: 'connecting', reason: 'connect_started' },
      { at: 1250, state: 'reconnecting', reason: 'reconnect_scheduled' },
      { at: 1450, state: 'connecting', reason: 'connect_started' },
      { at: 1700, state: 'online', reason: 'ready_received' },
    ])

    diagnostics.recordClose(1000, 'ticket=secret-order-123')
    const safe = diagnostics.getSnapshot()
    expect(safe.lastCloseReason).toBe('redacted')
    expect(JSON.stringify(safe)).not.toContain('secret-order-123')
  })

  it('keeps the websocket timeout reason in the low-cardinality allowlists', () => {
    const diagnostics = createRealtimeDiagnostics()

    diagnostics.recordConnectionAttempt('initial')
    diagnostics.recordClose(1000, 'ws_timeout')
    diagnostics.recordConnectionAttempt('ws_timeout')

    expect(diagnostics.getSnapshot()).toMatchObject({
      lastCloseReason: 'ws_timeout',
      lastReconnectReason: 'ws_timeout',
    })
  })

  it('aggregates heartbeat/server activity and tracks environment state', () => {
    let monotonicNow = 1
    let wallClockNow = 1000
    const diagnostics = createRealtimeDiagnostics({
      clock: {
        monotonicNow: () => monotonicNow,
        wallClockNow: () => wallClockNow,
      },
    })

    diagnostics.recordServerActivity('heartbeat')
    monotonicNow = 20
    wallClockNow = 2000
    diagnostics.recordServerActivity('envelope')
    monotonicNow = 30
    wallClockNow = 3000
    diagnostics.recordServerActivity('heartbeat')
    diagnostics.recordNetworkStatus(false)
    diagnostics.recordAppState(true)

    expect(diagnostics.getSnapshot()).toMatchObject({
      heartbeatCount: 2,
      serverActivityCount: 3,
      lastServerActivityAt: 3000,
      currentServerActivityGapMs: 0,
      lastServerActivityGapMs: 10,
      serverActivityGapMs: 0,
      networkOnline: false,
      appBackgrounded: true,
    })
  })

  it('records reconciliation duration and failures', () => {
    let monotonicNow = 1000
    let wallClockNow = 10_000
    const diagnostics = createRealtimeDiagnostics({
      clock: {
        monotonicNow: () => monotonicNow,
        wallClockNow: () => wallClockNow,
      },
    })

    diagnostics.beginSnapshotReconciliation()
    monotonicNow = 1050
    wallClockNow = 10_050
    diagnostics.finishSnapshotReconciliation('success')
    monotonicNow = 1100
    wallClockNow = 10_100
    diagnostics.beginSnapshotReconciliation()
    monotonicNow = 1175
    wallClockNow = 10_175
    diagnostics.finishSnapshotReconciliation('failure')
    monotonicNow = 1200
    wallClockNow = 10_200
    diagnostics.beginSnapshotReconciliation()
    monotonicNow = 1220
    wallClockNow = 10_220
    diagnostics.finishSnapshotReconciliation('cancelled')

    expect(diagnostics.getSnapshot().snapshotReconciliation).toEqual({
      count: 1,
      failureCount: 1,
      cancelledCount: 1,
      lastDurationMs: 20,
      lastFailureAt: 10_175,
    })
  })

  it('normalizes network type and deep-copies state ring entries', () => {
    const diagnostics = createRealtimeDiagnostics({ debug: true })

    diagnostics.recordNetworkType('wifi')
    diagnostics.transition('connecting', 'connect_started')
    const snapshot = diagnostics.getSnapshot()
    const entry = snapshot.stateChanges[0] as { reason: string }
    entry.reason = 'mutated'

    expect(diagnostics.getSnapshot().stateChanges[0]?.reason).toBe(
      'connect_started',
    )
    expect(diagnostics.getSnapshot().networkType).toBe('wifi')

    diagnostics.recordNetworkType('private-network' as never)
    expect(diagnostics.getSnapshot().networkType).toBe('unknown')
  })

  it('keeps a bounded default ring and redacts arbitrary short reasons', () => {
    const diagnostics = createRealtimeDiagnostics()
    const states = ['connecting', 'online'] as const

    for (let index = 0; index < 40; index += 1) {
      diagnostics.transition(states[index % states.length], `x${index}`)
    }

    const stateChanges = diagnostics.getSnapshot().stateChanges
    expect(stateChanges).toHaveLength(32)
    expect(stateChanges.every((change) => change.reason === 'redacted')).toBe(
      true,
    )
  })

  it('does not retain a state ring in production mode', () => {
    const diagnostics = createRealtimeDiagnostics({ debug: false })

    diagnostics.transition('connecting', 'contains-token')
    diagnostics.transition('online', 'ready_received')

    expect(diagnostics.getSnapshot().stateChanges).toEqual([])
  })
})
