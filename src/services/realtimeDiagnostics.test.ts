import { describe, expect, it } from 'vitest'
import { createRealtimeDiagnostics } from './realtimeDiagnostics'

describe('realtime diagnostics', () => {
  it('keeps lifecycle facts, close data, and recovery duration without payloads', () => {
    let now = 100
    const diagnostics = createRealtimeDiagnostics({
      clock: { now: () => now },
      debug: true,
      maxStateChanges: 4,
    })

    diagnostics.transition('connecting', 'connect_started')
    diagnostics.recordConnectionAttempt('initial')
    diagnostics.recordFailure('session')
    now = 250
    diagnostics.transition('reconnecting', 'reconnect_scheduled')
    diagnostics.recordClose(1006, 'server_restart')
    now = 450
    diagnostics.transition('connecting', 'connect_started')
    diagnostics.recordConnectionAttempt('timer')
    diagnostics.beginConnectSession()
    now = 700
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
    expect(snapshot.lastRecoveryDurationMs).toBe(600)
    expect(snapshot.recoveryCount).toBe(1)
    expect(snapshot.stateChanges).toHaveLength(4)
    expect(snapshot.stateChanges.at(-1)).toMatchObject({
      state: 'online',
      reason: 'ready_received',
    })

    diagnostics.recordClose(1000, 'ticket=secret-order-123')
    const safe = diagnostics.getSnapshot()
    expect(safe.lastCloseReason).toBe('redacted')
    expect(JSON.stringify(safe)).not.toContain('secret-order-123')
  })

  it('aggregates heartbeat/server activity and tracks environment state', () => {
    let now = 1
    const diagnostics = createRealtimeDiagnostics({ clock: { now: () => now } })

    diagnostics.recordServerActivity('heartbeat')
    now = 20
    diagnostics.recordServerActivity('envelope')
    now = 30
    diagnostics.recordServerActivity('heartbeat')
    diagnostics.recordNetworkStatus(false)
    diagnostics.recordAppState(true)

    expect(diagnostics.getSnapshot()).toMatchObject({
      heartbeatCount: 2,
      serverActivityCount: 3,
      lastServerActivityAt: 30,
      currentServerActivityGapMs: 0,
      lastServerActivityGapMs: 10,
      serverActivityGapMs: 0,
      networkOnline: false,
      appBackgrounded: true,
    })
  })

  it('records reconciliation duration and failures', () => {
    let now = 1000
    const diagnostics = createRealtimeDiagnostics({ clock: { now: () => now } })

    diagnostics.beginSnapshotReconciliation()
    now = 1050
    diagnostics.finishSnapshotReconciliation('success')
    now = 1100
    diagnostics.beginSnapshotReconciliation()
    now = 1175
    diagnostics.finishSnapshotReconciliation('failure')
    now = 1200
    diagnostics.beginSnapshotReconciliation()
    now = 1220
    diagnostics.finishSnapshotReconciliation('cancelled')

    expect(diagnostics.getSnapshot().snapshotReconciliation).toEqual({
      count: 1,
      failureCount: 1,
      cancelledCount: 1,
      lastDurationMs: 20,
      lastFailureAt: 1175,
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

  it('does not retain a state ring in production mode', () => {
    const diagnostics = createRealtimeDiagnostics({ debug: false })

    diagnostics.transition('connecting', 'contains-token')
    diagnostics.transition('online', 'ready_received')

    expect(diagnostics.getSnapshot().stateChanges).toEqual([])
  })
})
