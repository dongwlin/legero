import PasswordLockScreen from '@/components/PasswordLockScreen'
import { authService } from '@/services/authService'
import { useAuthStore } from '@/store/auth'
import { useOrderStore } from '@/store/order'
import { usePasswordAuthStore } from '@/store/passwordAuth'
import { Button, Switch } from '@heroui/react'
import React, { useState } from 'react'
import SettingsSection from './SettingsSection'

const AuthSettings: React.FC = () => {
  const user = useAuthStore((state) => state.user)
  const activeWorkspace = useAuthStore((state) => state.activeWorkspace)
  const setAnonymous = useAuthStore((state) => state.setAnonymous)
  const resetSyncState = useOrderStore((state) => state.resetSyncState)
  const passwordProtectionEnabled = usePasswordAuthStore(
    (state) => state.enabled,
  )
  const togglePasswordProtection = usePasswordAuthStore(
    (state) => state.toggleEnabled,
  )
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const [showPasswordInput, setShowPasswordInput] = useState(false)
  const [pendingAction, setPendingAction] = useState<'disable' | null>(null)

  const handleSignOut = async () => {
    setIsSigningOut(true)
    setSignOutError(null)

    try {
      await authService.signOut()
      setAnonymous()
      resetSyncState()
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : '退出登录失败。')
    } finally {
      setIsSigningOut(false)
    }
  }

  const handleToggle = (nextEnabled: boolean) => {
    if (passwordProtectionEnabled && !nextEnabled) {
      setPendingAction('disable')
      setShowPasswordInput(true)
      return
    }

    if (!passwordProtectionEnabled && nextEnabled) {
      togglePasswordProtection()
    }
  }

  const handlePasswordUnlock = () => {
    if (pendingAction === 'disable') {
      togglePasswordProtection()
    }

    setShowPasswordInput(false)
    setPendingAction(null)
  }

  const handlePasswordCancel = () => {
    setShowPasswordInput(false)
    setPendingAction(null)
  }

  return (
    <>
      <SettingsSection
        title='账号与工作区'
        description='应用访问由后端令牌与工作区成员关系控制，统计页可额外启用本地密码保护。'
      >
        <div className='space-y-4'>
          <div className='rounded-2xl border border-border/60 bg-background-secondary/60 p-4'>
            <div className='text-sm text-muted'>当前手机号</div>
            <div className='mt-1 text-base font-medium text-foreground'>
              {user?.phone ?? '未知'}
            </div>
          </div>

          <div className='rounded-2xl border border-border/60 bg-background-secondary/60 p-4'>
            <div className='text-sm text-muted'>当前工作区</div>
            <div className='mt-1 text-base font-medium text-foreground'>
              {activeWorkspace?.name ?? '未解析'}
            </div>
            <p className='mt-1 text-sm leading-6 text-muted'>
              角色：{activeWorkspace?.role ?? '未知'}
            </p>
          </div>

          <Switch.Root
            aria-label='切换统计页面密码保护'
            className='w-full items-start justify-between rounded-2xl border border-border/60 bg-background-secondary/60 p-4 transition-colors duration-200 hover:bg-background-secondary data-[selected=true]:border-accent/40 data-[selected=true]:bg-accent-soft/45'
            isSelected={passwordProtectionEnabled}
            onChange={handleToggle}
          >
            <Switch.Content className='order-1 flex-1'>
              <div className='text-base font-medium text-foreground'>
                统计页面密码保护
              </div>
              <p className='mt-1 text-sm leading-6 text-muted'>
                开启后访问统计页面需要输入 6 位本地密码。
              </p>
            </Switch.Content>
            <Switch.Control className='order-2 mt-0.5 shrink-0'>
              <Switch.Thumb />
            </Switch.Control>
          </Switch.Root>

          {signOutError ? (
            <p className='text-sm text-danger'>{signOutError}</p>
          ) : null}

          <Button.Root
            className='w-full md:w-auto'
            isDisabled={isSigningOut}
            variant='outline'
            onPress={() => {
              void handleSignOut()
            }}
          >
            {isSigningOut ? '退出中...' : '退出登录'}
          </Button.Root>
        </div>
      </SettingsSection>

      {showPasswordInput ? (
        <PasswordLockScreen
          onUnlock={handlePasswordUnlock}
          onCancel={handlePasswordCancel}
        />
      ) : null}
    </>
  )
}

export default AuthSettings
