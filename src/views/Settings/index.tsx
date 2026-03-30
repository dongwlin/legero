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
