import { Button, Card, Disclosure, Separator, Spinner } from '@heroui/react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import Header from '@/components/Header'
import { useRealtimeDiagnostics } from '@/hooks/useRealtimeDiagnostics'
import type {
  RealtimeConnectionState,
  RealtimeDiagnosticsSnapshot,
  RealtimeStateChange,
} from '@/services/realtimeDiagnostics'
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

const EMPTY_GET_DIAGNOSTICS = (): RealtimeDiagnosticsSnapshot | null => null

type StatusMeta = {
  dotClassName: string
}

const STATUS_META: Record<RealtimeConnectionState, StatusMeta> = {
  idle: { dotClassName: 'bg-muted' },
  connecting: { dotClassName: 'bg-accent' },
  online: { dotClassName: 'bg-success' },
  reconnecting: { dotClassName: 'bg-warning' },
  failed: { dotClassName: 'bg-danger' },
  closed: { dotClassName: 'bg-muted' },
}

const isTransientState = (state: RealtimeConnectionState): boolean =>
  state === 'connecting' || state === 'reconnecting'

type MetricProps = {
  label: string
  value: ReactNode
}

const Metric: React.FC<MetricProps> = ({ label, value }) => (
  <div className='min-w-0'>
    <dt className='text-sm text-muted'>{label}</dt>
    <dd className='mt-1 break-words text-base font-medium tabular-nums text-foreground'>
      {value}
    </dd>
  </div>
)

type DiagnosticsSectionProps = {
  children: ReactNode
  description?: string
  title: string
}

const DiagnosticsSection: React.FC<DiagnosticsSectionProps> = ({
  children,
  description,
  title,
}) => (
  <Card.Root
    variant='secondary'
    className='border border-border/70 p-0 shadow-surface'
  >
    <Card.Header className='gap-1 px-5 pt-5 md:px-6 md:pt-6'>
      <Card.Title className='text-lg md:text-xl'>{title}</Card.Title>
      {description ? (
        <Card.Description className='leading-6'>{description}</Card.Description>
      ) : null}
    </Card.Header>
    <Card.Content className='px-5 pb-5 md:px-6 md:pb-6'>
      {children}
    </Card.Content>
  </Card.Root>
)

const StateChangeDot: React.FC<{ state: RealtimeConnectionState }> = ({
  state,
}) => (
  <span
    aria-hidden='true'
    className={`relative z-1 mt-1.5 size-2.5 shrink-0 rounded-full ${STATUS_META[state].dotClassName}`}
  />
)

const StateChangeItem: React.FC<{
  change: RealtimeStateChange
  isLast: boolean
}> = ({ change, isLast }) => (
  <li className='relative flex gap-3 pb-5 last:pb-0'>
    <span className='relative flex w-2.5 justify-center'>
      <StateChangeDot state={change.state} />
      {!isLast ? (
        <span
          aria-hidden='true'
          className='absolute top-4 bottom-0 w-px bg-border-secondary'
        />
      ) : null}
    </span>
    <div className='min-w-0 flex-1'>
      <div className='flex flex-wrap items-baseline gap-x-2 gap-y-0.5'>
        <time className='font-mono text-xs tabular-nums text-muted'>
          {formatTimestamp(change.at)}
        </time>
        <span className='text-sm font-medium text-foreground'>
          {connectionStateLabel(change.state)}
        </span>
      </div>
      <p className='mt-1 text-sm leading-5 text-muted'>
        {stateChangeReasonLabel(change.reason)}
      </p>
    </div>
  </li>
)

const copyText = async (text: string): Promise<boolean> => {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Continue with the legacy textarea fallback when clipboard permission
      // is unavailable in an embedded browser or older Android WebView.
    }
  }

  if (
    typeof document === 'undefined' ||
    typeof document.execCommand !== 'function'
  ) {
    return false
  }

  const textArea = document.createElement('textarea')
  textArea.value = text
  textArea.setAttribute('readonly', '')
  textArea.style.position = 'fixed'
  textArea.style.opacity = '0'
  document.body.appendChild(textArea)

  try {
    textArea.focus()
    textArea.select()
    textArea.setSelectionRange(0, textArea.value.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    textArea.remove()
  }
}

const UnavailableDiagnostics: React.FC = () => (
  <Card.Root
    variant='secondary'
    className='border border-border/70 p-0 shadow-surface'
  >
    <Card.Content className='space-y-2 px-5 py-8 md:px-6'>
      <h2 className='text-lg font-semibold text-foreground'>实时诊断暂不可用</h2>
      <p className='text-sm leading-6 text-muted'>
        当前没有可读取的工作区实时会话。请返回设置页稍后重试，连接建立后诊断数据会自动出现。
      </p>
    </Card.Content>
  </Card.Root>
)

const RealtimeDiagnostics: React.FC = () => {
  const diagnosticsAccess = useRealtimeDiagnostics()
  const getDiagnostics =
    diagnosticsAccess?.getDiagnostics ?? EMPTY_GET_DIAGNOSTICS
  const [snapshot, setSnapshot] = useState<RealtimeDiagnosticsSnapshot | null>(
    () => getDiagnostics(),
  )
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const copyResetTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    const updateSnapshot = () => {
      setSnapshot(getDiagnostics())
    }

    updateSnapshot()
    const intervalId = window.setInterval(updateSnapshot, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [getDiagnostics])

  useEffect(
    () => () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current)
      }
    },
    [],
  )

  const handleCopy = useCallback(async () => {
    if (!snapshot) {
      return
    }

    const copied = await copyText(JSON.stringify(snapshot, null, 2))
    setCopyState(copied ? 'copied' : 'error')

    if (copyResetTimeoutRef.current !== null) {
      window.clearTimeout(copyResetTimeoutRef.current)
    }

    copyResetTimeoutRef.current = window.setTimeout(() => {
      setCopyState('idle')
      copyResetTimeoutRef.current = null
    }, 1800)
  }, [snapshot])

  return (
    <div className='min-h-dvh bg-background pb-20 text-foreground'>
      <Header
        title='实时连接诊断'
        backLabel='返回设置'
        backPath='/settings'
      />

      <main className='mx-auto max-w-4xl px-4 pt-[calc(5.25rem+env(safe-area-inset-top))] md:px-8'>
        <div className='space-y-6'>
          {snapshot ? (
            <>
              <Card.Root
                variant='secondary'
                className='border border-border/70 p-0 shadow-surface'
              >
                <Card.Content className='px-5 py-5 md:px-6 md:py-6'>
                  <div className='min-w-0'>
                    <p className='text-sm text-muted'>当前连接状态</p>
                    <div className='mt-2 flex items-center gap-2.5'>
                      {isTransientState(snapshot.state) ? (
                        <Spinner
                          aria-label='连接状态更新中'
                          size='sm'
                          color={
                            snapshot.state === 'reconnecting'
                              ? 'warning'
                              : 'accent'
                          }
                        />
                      ) : (
                        <span
                          aria-hidden='true'
                          className={`size-2.5 rounded-full ${STATUS_META[snapshot.state].dotClassName}`}
                        />
                      )}
                      <h2 className='truncate text-2xl font-semibold tracking-tight md:text-3xl'>
                        {connectionStateLabel(snapshot.state)}
                      </h2>
                    </div>
                  </div>

                  <Separator className='my-5' />

                  <dl className='grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3'>
                    <Metric
                      label='网络'
                      value={networkOnlineLabel(snapshot.networkOnline)}
                    />
                    <Metric
                      label='网络类型'
                      value={networkTypeLabel(snapshot.networkType)}
                    />
                    <Metric
                      label='应用状态'
                      value={appBackgroundedLabel(snapshot.appBackgrounded)}
                    />
                  </dl>
                </Card.Content>
              </Card.Root>

              <DiagnosticsSection
                title='最近连接情况'
                description='帮助定位最近一次断线、重连和恢复过程。'
              >
                <dl className='grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3'>
                  <Metric
                    label='最近故障阶段'
                    value={failureStageLabel(snapshot.failureStage)}
                  />
                  <Metric label='重连次数' value={snapshot.reconnectCount} />
                  <Metric
                    label='最近重连原因'
                    value={reconnectReasonLabel(snapshot.lastReconnectReason)}
                  />
                  <Metric
                    label='最近恢复耗时'
                    value={formatDuration(snapshot.lastRecoveryDurationMs)}
                  />
                  <Metric label='恢复次数' value={snapshot.recoveryCount} />
                  <Metric
                    label='最近连接耗时'
                    value={formatDuration(snapshot.lastConnectDurationMs)}
                  />
                  <Metric label='失活次数' value={snapshot.staleCount} />
                </dl>
              </DiagnosticsSection>

              <DiagnosticsSection
                title='实时通道'
                description='展示 WebSocket 连接尝试和服务端活动计数，不改变现有记录频率。'
              >
                <dl className='grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3'>
                  <Metric
                    label='连接尝试'
                    value={snapshot.connectionAttemptCount}
                  />
                  <Metric label='最近关闭码' value={closeCodeLabel(snapshot.lastCloseCode)} />
                  <Metric
                    label='最近关闭原因'
                    value={closeReasonLabel(snapshot.lastCloseReason)}
                  />
                  <Metric label='心跳次数' value={snapshot.heartbeatCount} />
                  <Metric
                    label='服务端活动次数'
                    value={snapshot.serverActivityCount}
                  />
                  <Metric
                    label='当前活动间隔'
                    value={formatActivityGap(snapshot.currentServerActivityGapMs)}
                  />
                  <Metric
                    label='上次活动间隔'
                    value={formatActivityGap(snapshot.lastServerActivityGapMs)}
                  />
                  <Metric
                    label='最近服务端活动'
                    value={formatTimestamp(snapshot.lastServerActivityAt)}
                  />
                </dl>
              </DiagnosticsSection>

              <DiagnosticsSection
                title='数据同步'
                description='订单快照与实时事件的对账结果。'
              >
                <dl className='grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3'>
                  <Metric
                    label='成功对账次数'
                    value={snapshot.snapshotReconciliation.count}
                  />
                  <Metric
                    label='对账失败次数'
                    value={snapshot.snapshotReconciliation.failureCount}
                  />
                  <Metric
                    label='对账取消次数'
                    value={snapshot.snapshotReconciliation.cancelledCount}
                  />
                  <Metric
                    label='最近对账耗时'
                    value={formatDuration(
                      snapshot.snapshotReconciliation.lastDurationMs,
                    )}
                  />
                  <Metric
                    label='最近失败时间'
                    value={formatTimestamp(
                      snapshot.snapshotReconciliation.lastFailureAt,
                    )}
                  />
                </dl>
              </DiagnosticsSection>

              <DiagnosticsSection
                title='最近状态变化'
                description='按时间倒序展示 recorder 保留的最近状态变化。'
              >
                {snapshot.stateChanges.length > 0 ? (
                  <ol aria-label='最近状态变化列表' className='pt-1'>
                    {[...snapshot.stateChanges]
                      .reverse()
                      .map((change, index, changes) => (
                        <StateChangeItem
                          key={`${change.at}-${change.state}-${index}`}
                          change={change}
                          isLast={index === changes.length - 1}
                        />
                      ))}
                  </ol>
                ) : (
                  <div className='rounded-2xl border border-dashed border-border/70 bg-background-secondary/45 px-4 py-6 text-center'>
                    <p className='text-sm font-medium text-foreground'>
                      暂无连接状态记录
                    </p>
                    <p className='mt-1 text-sm leading-6 text-muted'>
                      连接状态发生变化后，最近记录会显示在这里。
                    </p>
                  </div>
                )}
              </DiagnosticsSection>

              <div className='space-y-3'>
                <Button.Root
                  className='w-full md:w-auto'
                  variant='outline'
                  onPress={() => {
                    void handleCopy()
                  }}
                >
                  {copyState === 'copied' ? '已复制' : '复制诊断信息'}
                </Button.Root>
                <p
                  aria-live='polite'
                  className={`min-h-5 text-sm ${copyState === 'error' ? 'text-danger' : 'text-muted'}`}
                >
                  {copyState === 'error'
                    ? '复制失败，请检查浏览器剪贴板权限。'
                    : copyState === 'copied'
                      ? '诊断信息已复制，可粘贴给现场支持人员。'
                      : '复制内容只包含当前诊断快照中的低基数字段。'}
                </p>
              </div>

              <Disclosure.Root className='rounded-2xl border border-border/70 bg-background-secondary/35'>
                <Disclosure.Heading>
                  <Disclosure.Trigger className='flex w-full items-center gap-3 rounded-2xl px-4 py-4 text-left text-sm font-medium text-foreground'>
                    <span>原始诊断数据</span>
                    <Disclosure.Indicator />
                  </Disclosure.Trigger>
                </Disclosure.Heading>
                <Disclosure.Content>
                  <Disclosure.Body className='border-t border-border/60 px-4 py-4'>
                    <pre className='max-w-full overflow-x-auto whitespace-pre-wrap wrap-break-word font-mono text-xs leading-5 text-muted'>
                      {JSON.stringify(snapshot, null, 2)}
                    </pre>
                  </Disclosure.Body>
                </Disclosure.Content>
              </Disclosure.Root>
            </>
          ) : (
            <UnavailableDiagnostics />
          )}
        </div>
      </main>
    </div>
  )
}

export default RealtimeDiagnostics
