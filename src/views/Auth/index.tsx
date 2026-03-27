import { Button, Card } from '@heroui/react'
import React, { useState } from 'react'
import ApiBaseUrlForm from '@/components/ApiBaseUrlForm'
import { useApiBaseUrl } from '@/hooks/useApiBaseUrl'
import { useRefreshWorkspaceAccess } from '@/hooks/useAuthSessionBootstrap'
import { authService } from '@/services/authService'
import { API_CONFIGURATION_ERROR } from '@/services/apiClient'
import { orderDtoToOrderRecord } from '@/services/orderRecordMapper'
import { useAuthStore } from '@/store/auth'
import { useOrderStore } from '@/store/order'

type AuthSurfaceProps = {
  children: React.ReactNode
}

const AuthSurface: React.FC<AuthSurfaceProps> = ({ children }) => (
  <div className='min-h-dvh bg-background px-6 py-10 text-foreground md:flex md:items-center md:justify-center md:px-8 md:py-12'>
    <div className='mx-auto w-full max-w-md'>
      <Card.Root
        variant='secondary'
        className='border border-border/70 p-0 shadow-surface'
      >
        <Card.Content className='px-6 py-8 md:px-8 md:py-10'>{children}</Card.Content>
      </Card.Root>
    </div>
  </div>
)

type StatusPanelProps = {
  actions?: React.ReactNode
  description: string
  title: string
}

const StatusPanel: React.FC<StatusPanelProps> = ({
  actions,
  description,
  title,
}) => (
  <div className='space-y-6'>
    <div className='space-y-2'>
      <h2 className='text-2xl font-semibold tracking-tight'>{title}</h2>
      <p className='text-sm leading-6 text-muted'>{description}</p>
    </div>
    {actions ? <div className='space-y-3'>{actions}</div> : null}
  </div>
)

const inputClassName =
  'w-full rounded-2xl border border-border/60 bg-background px-4 py-3 text-sm text-foreground outline-none transition-colors duration-200 placeholder:text-muted focus:border-accent/50'

const Auth: React.FC = () => {
  const authStatus = useAuthStore((state) => state.status)
  const workspaceStatus = useAuthStore((state) => state.workspaceStatus)
  const errorMessage = useAuthStore((state) => state.errorMessage)
  const user = useAuthStore((state) => state.user)
  const apiBaseUrl = useApiBaseUrl()
  const setAuthenticatedContext = useAuthStore(
    (state) => state.setAuthenticatedContext,
  )
  const setAnonymous = useAuthStore((state) => state.setAnonymous)
  const refreshWorkspaceAccess = useRefreshWorkspaceAccess()
  const resetSyncState = useOrderStore((state) => state.resetSyncState)
  const setOrders = useOrderStore((state) => state.setOrders)
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [formInfo, setFormInfo] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)

  const isApiConfigured = apiBaseUrl !== null
  const isApiConfigurationMissing = errorMessage === API_CONFIGURATION_ERROR
  const canSubmit =
    isApiConfigured && phone.trim() !== '' && password.trim() !== ''

  const handleSignOut = async () => {
    setIsSigningOut(true)
    setFormError(null)
    setFormInfo(null)

    try {
      await authService.signOut()
      setAnonymous()
      resetSyncState()
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '退出登录失败。')
    } finally {
      setIsSigningOut(false)
    }
  }

  const handleSubmit = async () => {
    setFormError(null)
    setFormInfo(null)
    setIsSubmitting(true)

    try {
      const result = await authService.signInWithPassword(phone.trim(), password)
      setAuthenticatedContext(result)
      setOrders(result.activeOrders.map(orderDtoToOrderRecord))
      setFormInfo('登录成功，正在进入工作区。')
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '登录失败，请稍后重试。')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (
    authStatus === 'loading' ||
    (authStatus === 'authenticated' &&
      (workspaceStatus === 'loading' || workspaceStatus === 'idle'))
  ) {
    return (
      <AuthSurface>
        <StatusPanel
          title='正在恢复登录状态'
          description='正在检查当前会话并解析可访问的工作区，请稍候。'
        />
      </AuthSurface>
    )
  }

  if (authStatus === 'authenticated' && workspaceStatus === 'no_access') {
    return (
      <AuthSurface>
        <StatusPanel
          title='当前账号尚未加入工作区'
          description='请在后端为当前手机号创建账号并加入工作区，然后返回此页重新检查。'
          actions={
            <>
              <div className='rounded-2xl border border-border/60 bg-background px-4 py-4 text-sm leading-7 text-muted'>
                <div>
                  <span className='font-medium text-foreground'>手机号：</span>
                  {user?.phone ?? '未知'}
                </div>
                <div>
                  <span className='font-medium text-foreground'>用户 ID：</span>
                  {user?.id ?? '未知'}
                </div>
              </div>
              {errorMessage ? (
                <p className='text-sm text-danger'>{errorMessage}</p>
              ) : null}
              <div className='flex flex-col gap-3 sm:flex-row'>
                <Button.Root
                  variant='secondary'
                  className='sm:flex-1'
                  onPress={() => {
                    void refreshWorkspaceAccess()
                  }}
                >
                  重新检查权限
                </Button.Root>
                <Button.Root
                  variant='outline'
                  className='sm:flex-1'
                  isDisabled={isSigningOut}
                  onPress={() => {
                    void handleSignOut()
                  }}
                >
                  {isSigningOut ? '退出中...' : '退出登录'}
                </Button.Root>
              </div>
            </>
          }
        />
      </AuthSurface>
    )
  }

  if (workspaceStatus === 'error' && !isApiConfigurationMissing) {
    return (
      <AuthSurface>
        <StatusPanel
          title='无法完成认证初始化'
          description={errorMessage ?? '请检查后端 API 配置或网络状态。'}
          actions={
            <div className='space-y-4'>
              <ApiBaseUrlForm
                submitLabel='更新 API 地址'
              />
              <Button.Root
                variant='secondary'
                onPress={() => {
                  if (authStatus === 'authenticated') {
                    void refreshWorkspaceAccess()
                  }
                }}
              >
                重新检查
              </Button.Root>
            </div>
          }
        />
      </AuthSurface>
    )
  }

  return (
    <AuthSurface>
      <div className='space-y-6'>
        <h2 className='text-2xl font-semibold tracking-tight'>账号认证</h2>

        <div className='rounded-2xl border border-border/60 bg-background px-4 py-4 md:px-5'>
          <div className='mt-4'>
            <ApiBaseUrlForm />
          </div>
        </div>

        <div className='space-y-4'>
          <label className='block space-y-2'>
            <span className='text-sm font-medium text-foreground'>手机号</span>
            <input
              autoComplete='tel'
              className={inputClassName}
              inputMode='tel'
              placeholder='请输入手机号'
              type='tel'
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>

          <label className='block space-y-2'>
            <span className='text-sm font-medium text-foreground'>密码</span>
            <input
              autoComplete='current-password'
              className={inputClassName}
              placeholder='请输入密码'
              type='password'
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
        </div>

        {!isApiConfigured ? (
          <p className='text-sm text-warning'>
            请先保存 API base URL，然后再使用手机号和密码登录。
          </p>
        ) : null}
        {formError ? <p className='text-sm text-danger'>{formError}</p> : null}
        {formInfo ? <p className='text-sm text-success'>{formInfo}</p> : null}

        <Button.Root
          className='w-full'
          isDisabled={!canSubmit || isSubmitting}
          variant='primary'
          onPress={() => {
            void handleSubmit()
          }}
        >
          {isSubmitting ? '登录中...' : isApiConfigured ? '登录' : '请先配置 API 地址'}
        </Button.Root>
      </div>
    </AuthSurface>
  )
}

export default Auth
