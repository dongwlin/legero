import { Theme, useThemeStore } from '@/store/theme'
import React from 'react'

const ThemeSettings: React.FC = () => {
  const { theme, setTheme } = useThemeStore()

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme)
  }

  return (
    <div className="card bg-base-200 shadow-lg rounded-xl mb-6">
      <div className="card-body p-6">
        <h2 className="card-title text-lg md:text-xl mb-4">外观设置</h2>

        <div className="form-control">
          <label className="label cursor-pointer justify-start gap-3">
            <input 
              type="radio" 
              name="theme" 
              className="radio radio-primary" 
              checked={theme === "light"}
              onChange={() => handleThemeChange("light")}
            />
            <span className="label-text">浅色模式</span>
          </label>
        </div>

        <div className="form-control">
          <label className="label cursor-pointer justify-start gap-3">
            <input 
              type="radio" 
              name="theme" 
              className="radio radio-primary" 
              checked={theme === "dark"}
              onChange={() => handleThemeChange("dark")}
            />
            <span className="label-text">深色模式</span>
          </label>
        </div>

        <div className="form-control">
          <label className="label cursor-pointer justify-start gap-3">
            <input 
              type="radio" 
              name="theme" 
              className="radio radio-primary" 
              checked={theme === "system"}
              onChange={() => handleThemeChange("system")}
            />
            <span className="label-text">跟随系统</span>
          </label>
        </div>
      </div>
    </div>
  )
}

export default ThemeSettings
