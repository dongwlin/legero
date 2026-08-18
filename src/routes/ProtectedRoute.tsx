import { Button, Card, Spinner } from '@heroui/react'
import React from 'react'
import { Link, Navigate, Outlet, useMatch } from 'react-router'
import { RealtimeDiagnosticsProvider } from '@/hooks/RealtimeDiagnosticsProvider'
import { cancelAuthenticationInitialization } from '@/hooks/useAuthSessionBootstrap'
import { useOrderWorkspaceSync } from '@/hooks/useOrderWorkspaceSync'
import { useAuthStore } from '@/store/auth'

type ProtectedRouteStateProps = {
  description: string
  isLoading?: boolean
  onCancel?: () => void
  onRetry?: () => void
  showDiagnosticsLink?: boolean
  title: string
}

const ProtectedRouteState: React.FC<ProtectedRouteStateProps> = ({
  description,
  isLoading = false,
  onCancel,
  onRetry,
  showDiagnosticsLink = false,
  title,
}) => (
  <div className='min-h-dvh bg-background px-6 py-10 text-foreground md:flex md:items-center md:justify-center md:px-8 md:py-12'>
    <Card.Root
      variant='secondary'
      className='mx-auto w-full max-w-2xl border border-border/70 p-0 shadow-surface'
    >
      <Card.Content className='space-y-4 px-6 py-10 text-center md:px-8 md:py-12'>
        <div className='space-y-2'>
          <h1 className='text-3xl font-semibold tracking-tight md:text-4xl'>
            {title}
          </h1>
          <p className='mx-auto max-w-xl text-sm leading-6 text-muted md:text-base'>
            {description}
          </p>
        </div>
        {isLoading ? (
          <div className='flex justify-center'>
            <Spinner size="lg" />
          </div>
        ) : null}
        {showDiagnosticsLink || onCancel || onRetry ? (
          <div className='flex flex-col items-center justify-center gap-3 sm:flex-row'>
            {onCancel ? (
              <Button.Root
                className='min-h-11 w-full sm:w-auto'
                variant='outline'
                onPress={onCancel}
              >
                取消
              </Button.Root>
            ) : null}
            {onRetry ? (
              <Button.Root
                className='min-h-11 w-full sm:w-auto'
                variant='secondary'
                onPress={onRetry}
              >
                重试
              </Button.Root>
            ) : null}
            {showDiagnosticsLink ? (
              <Link
                to='/settings/diagnostics'
                className='inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-border/70 bg-background-secondary/60 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-accent/40 hover:bg-background-secondary focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto'
              >
                查看连接诊断
              </Link>
            ) : null}
          </div>
        ) : null}
      </Card.Content>
    </Card.Root>
  </div>
)

const ProtectedRoute: React.FC = () => {
  const authStatus = useAuthStore((state) => state.status)
  const workspaceStatus = useAuthStore((state) => state.workspaceStatus)
  const { status, errorMessage, retrySync, getDiagnostics } =
    useOrderWorkspaceSync()
  const isDiagnosticsRoute = useMatch('/settings/diagnostics') !== null

  if (authStatus === 'loading' && workspaceStatus !== 'error') {
    return (
      <ProtectedRouteState
        isLoading
        title='正在恢复登录状态'
        description='正在检查当前会话，请稍候。'
        onCancel={cancelAuthenticationInitialization}
      />
    )
  }

  if (authStatus === 'anonymous') {
    return <Navigate to='/auth' replace />
  }

  if (workspaceStatus === 'loading' || workspaceStatus === 'idle') {
    return (
      <ProtectedRouteState
        isLoading
        title='正在解析工作区'
        description='正在确认当前账号可访问的工作区，请稍候。'
        onCancel={cancelAuthenticationInitialization}
      />
    )
  }

  if (workspaceStatus === 'no_access' || workspaceStatus === 'error') {
    return <Navigate to='/auth' replace />
  }

  // Diagnostics is intentionally available while the single workspace sync
  // owner is still connecting or has reached a terminal error. The provider
  // only exposes that owner's getter; it never creates another subscription.
  if (!isDiagnosticsRoute && (status === 'loading' || status === 'idle')) {
    return (
      <ProtectedRouteState
        title='正在同步订单'
        description='正在同步当前工作区的订单快照与实时订阅。'
        showDiagnosticsLink
      />
    )
  }

  if (!isDiagnosticsRoute && status === 'error') {
    return (
      <ProtectedRouteState
        title='订单同步失败'
        description={errorMessage ?? '当前工作区订单暂时不可用。'}
        onRetry={retrySync}
        showDiagnosticsLink
      />
    )
  }

  return (
    <RealtimeDiagnosticsProvider getDiagnostics={getDiagnostics}>
      <Outlet />
    </RealtimeDiagnosticsProvider>
  )
}

export default ProtectedRoute
