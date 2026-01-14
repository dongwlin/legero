import './App.css'
import { RouterProvider } from 'react-router/dom'
import router from './routes'
import { useThemeStore } from '@/store/theme'
import { useEffect } from 'react'

function App() {
  const { theme, getEffectiveTheme } = useThemeStore()

  useEffect(() => {
    // 更新有效主题
    const updateTheme = () => {
      const effective = getEffectiveTheme()
      document.documentElement.setAttribute('data-theme', effective)
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

  return <RouterProvider router={router} />
}

export default App
