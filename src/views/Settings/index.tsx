import React from 'react'
import Header from '@/components/Header'
import ApiConnectionSettings from './components/ApiConnectionSettings'
import ThemeSettings from './components/ThemeSettings'
import OrderSettings from './components/OrderSettings'
import DataManagement from './components/DataManagement'
import AuthSettings from './components/AuthSettings'

const Settings: React.FC = () => {
  return (
    <div className='min-h-dvh bg-background pb-20 text-foreground'>
      <Header title='设置' />

      <main className='mx-auto max-w-4xl px-4 pt-[calc(5.25rem+env(safe-area-inset-top))] md:px-8'>
        <section className='mb-8'>
          <p className='text-xs font-medium uppercase tracking-[0.24em] text-muted md:text-sm'>
            Preferences
          </p>
          <h2 className='mt-3 text-3xl font-semibold tracking-tight md:text-4xl'>
            管理应用外观、安全与数据
          </h2>
          <p className='mt-3 max-w-2xl text-sm leading-6 text-muted md:text-base'>
            主题与偏好会保存在当前设备上，订单主数据会同步到当前工作区。
          </p>
        </section>

        <div className='space-y-6'>
          <ApiConnectionSettings />
          <AuthSettings />
          <ThemeSettings />
          <OrderSettings />
          <DataManagement />
        </div>
      </main>
    </div>
  )
}

export default Settings
