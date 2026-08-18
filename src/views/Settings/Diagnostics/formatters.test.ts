import { describe, expect, it } from 'vitest'
import {
  appBackgroundedLabel,
  closeCodeLabel,
  closeReasonLabel,
  connectionStateLabel,
  failureStageLabel,
  formatActivityGap,
  formatDuration,
  formatTimestamp,
  networkOnlineLabel,
  networkTypeLabel,
  reconnectReasonLabel,
  stateChangeReasonLabel,
} from './formatters'

describe('realtime diagnostics formatters', () => {
  it('formats durations into compact, readable units', () => {
    expect(formatDuration(183)).toBe('183 ms')
    expect(formatDuration(1200)).toBe('1.2 s')
    expect(formatDuration(60_000)).toBe('1 min')
    expect(formatDuration(null)).toBe('—')
    expect(formatDuration(Number.NaN)).toBe('—')
  })

  it('formats server activity gaps without inventing a health threshold', () => {
    expect(formatActivityGap(250)).toBe('刚刚')
    expect(formatActivityGap(3200)).toBe('3.2 秒')
    expect(formatActivityGap(21_000)).toBe('21 秒')
    expect(formatActivityGap(null)).toBe('—')
  })

  it('maps connection, failure, reconnect, and environment labels', () => {
    expect(connectionStateLabel('online')).toBe('在线')
    expect(connectionStateLabel('reconnecting')).toBe('正在重连')
    expect(failureStageLabel('ready')).toBe('握手确认')
    expect(failureStageLabel(null)).toBe('—')
    expect(reconnectReasonLabel('network_recovery')).toBe('网络恢复')
    expect(reconnectReasonLabel('redacted')).toBe('详细原因已隐藏')
    expect(reconnectReasonLabel('unexpected')).toBe('其他原因')
    expect(stateChangeReasonLabel('ready_received')).toBe('收到握手确认')
    expect(networkTypeLabel('cellular')).toBe('移动网络')
    expect(networkOnlineLabel(false)).toBe('离线')
    expect(appBackgroundedLabel(false)).toBe('前台')
    expect(closeCodeLabel(1006)).toBe('1006')
    expect(closeReasonLabel('network_offline')).toBe('网络断开')
  })

  it('formats timestamps as a short wall-clock time', () => {
    expect(formatTimestamp(Date.UTC(2026, 7, 18, 1, 31, 42))).toBe('09:31:42')
    expect(formatTimestamp(null)).toBe('—')
  })
})
