import React from 'react'
import Header from '@/components/Header'
import ThemeSettings from './components/ThemeSettings'
import DataManagement from './components/DataManagement'

const Settings: React.FC = () => {
  return (
    <div className='min-h-screen bg-base-100 pb-20'>
      {/* 顶部导航栏 */}
      <Header title='设置' />

      {/* 主内容区 */}
      <div className='pt-[calc(5rem+env(safe-area-inset-top))] px-4 md:px-8 max-w-4xl mx-auto'>
        {/* 主题设置部分 */}
        <ThemeSettings />

        {/* 数据管理部分 */}
        <DataManagement />
      </div>
    </div>
  )
}

export default Settings
