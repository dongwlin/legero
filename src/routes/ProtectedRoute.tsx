import { Button, Card, Spinner } from '@heroui/react'
import React from 'react'
import { Navigate, Outlet } from 'react-router'
import { useOrderWorkspaceSync } from '@/hooks/useOrderWorkspaceSync'
import { useAuthStore } from '@/store/auth'

type ProtectedRouteStateProps = {
  description: string
  isLoading?: boolean
  onRetry?: () => void
  title: string
}

const ProtectedRouteState: React.FC<ProtectedRouteStateProps> = ({
  description,
  isLoading = false,
  onRetry,
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
        {onRetry ? (
          <div className='flex justify-center'>
            <Button.Root variant='secondary' onPress={onRetry}>
              重试
            </Button.Root>
          </div>
        ) : null}
      </Card.Content>
    </Card.Root>
  </div>
)

const ProtectedRoute: React.FC = () => {
  const authStatus = useAuthStore((state) => state.status)
  const workspaceStatus = useAuthStore((state) => state.workspaceStatus)
  const { status, errorMessage, retrySync } = useOrderWorkspaceSync()

  if (authStatus === 'loading') {
    return (
      <ProtectedRouteState
        isLoading
        title='正在恢复登录状态'
        description='正在检查当前会话，请稍候。'
      />
    )
  }

  if (authStatus === 'anonymous') {
    return <Navigate to='/auth' replace />
  }

  if (workspaceStatus === 'loading' || workspaceStatus === 'idle') {
    return (
      <ProtectedRouteState
        title='正在解析工作区'
        description='正在确认当前账号可访问的工作区，请稍候。'
      />
    )
  }

  if (workspaceStatus === 'no_access' || workspaceStatus === 'error') {
    return <Navigate to='/auth' replace />
  }

  if (status === 'loading' || status === 'idle') {
    return (
      <ProtectedRouteState
        title='正在同步订单'
        description='正在同步当前工作区的订单快照与实时订阅。'
      />
    )
  }

  if (status === 'error') {
    return (
      <ProtectedRouteState
        title='订单同步失败'
        description={errorMessage ?? '当前工作区订单暂时不可用。'}
        onRetry={retrySync}
      />
    )
  }

  return <Outlet />
}

export default ProtectedRoute
