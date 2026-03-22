import { usePasswordAuthStore } from '@/store/passwordAuth'
import { Switch } from '@heroui/react'
import React, { useState } from 'react'
import PasswordLockScreen from '@/components/PasswordLockScreen'
import SettingsSection from './SettingsSection'

const AuthSettings: React.FC = () => {
  const { enabled, toggleEnabled } = usePasswordAuthStore()
  const [showPasswordInput, setShowPasswordInput] = useState(false)
  const [pendingAction, setPendingAction] = useState<'disable' | null>(null)

  const handleToggle = (nextEnabled: boolean) => {
    if (enabled && !nextEnabled) {
      setPendingAction('disable')
      setShowPasswordInput(true)
      return
    }

    if (!enabled && nextEnabled) {
      toggleEnabled()
    }
  }

  const handlePasswordUnlock = () => {
    if (pendingAction === 'disable') {
      toggleEnabled()
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
        title='安全设置'
        description='为敏感页面增加访问保护，防止未授权查看统计数据。'
      >
        <Switch.Root
          aria-label='切换统计页面密码保护'
          className='w-full items-start justify-between rounded-2xl border border-border/60 bg-background-secondary/60 p-4 transition-colors duration-200 hover:bg-background-secondary data-[selected=true]:border-accent/40 data-[selected=true]:bg-accent-soft/45'
          isSelected={enabled}
          onChange={handleToggle}
        >
          <Switch.Content className='order-1 flex-1'>
            <div className='text-base font-medium text-foreground'>
              统计页面密码保护
            </div>
            <p className='mt-1 text-sm leading-6 text-muted'>
              开启后访问统计页面需要输入密码。
            </p>
          </Switch.Content>
          <Switch.Control className='order-2 mt-0.5 shrink-0'>
            <Switch.Thumb />
          </Switch.Control>
        </Switch.Root>
      </SettingsSection>

      {showPasswordInput && (
        <PasswordLockScreen
          onUnlock={handlePasswordUnlock}
          onCancel={handlePasswordCancel}
        />
      )}
    </>
  )
}

export default AuthSettings
