import './App.css'
import AppBootstrap from '@/components/AppBootstrap'
import { useThemeStore } from '@/store/theme'
import { RouterProvider } from 'react-router/dom'
import { useEffect } from 'react'
import router from './routes'

function App() {
  const { theme, getEffectiveTheme } = useThemeStore()

  useEffect(() => {
    // 更新有效主题
    const updateTheme = () => {
      const effective = getEffectiveTheme()
      const root = document.documentElement

      root.setAttribute('data-theme', effective)
      root.classList.remove('light', 'dark')
      root.classList.add(effective)
    }

    // 初始化主题
    updateTheme()

    // 监听系统主题变化
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', updateTheme)

    return () => {
      mediaQuery.removeEventListener('change', updateTheme)
    }
  }, [theme, getEffectiveTheme])

  return (
    <AppBootstrap>
      <RouterProvider router={router} />
    </AppBootstrap>
  )
}

export default App
