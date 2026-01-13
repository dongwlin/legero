import { useThemeStore } from '@/store/theme'
import React, { useEffect } from 'react'
import Header from './components/Header'
import ThemeSettings from './components/ThemeSettings'
import DataManagement from './components/DataManagement'

const Settings: React.FC = () => {
  const { theme, getEffectiveTheme } = useThemeStore()

  useEffect(() => {
    // 更新有效主题
    const updateTheme = () => {
      const effective = getEffectiveTheme()

      // 设置html元素的data-theme属性，用于DaisyUI主题切换
      document.documentElement.setAttribute("data-theme", effective)
    }

    // 初始化主题
    updateTheme()

    // 监听系统主题变化
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    mediaQuery.addEventListener("change", updateTheme)

    return () => {
      mediaQuery.removeEventListener("change", updateTheme)
    }
  }, [theme, getEffectiveTheme])

  return (
    <div className="min-h-screen bg-base-100 pb-20">
      {/* 顶部导航栏 */}
      <Header />

      {/* 主内容区 */}
      <div className="mt-20 px-4 md:px-8 max-w-4xl mx-auto">
        {/* 主题设置部分 */}
        <ThemeSettings />

        {/* 数据管理部分 */}
        <DataManagement />
      </div>
    </div>
  )
}

export default Settings
