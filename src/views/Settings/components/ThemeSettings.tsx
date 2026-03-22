import { Theme, useThemeStore } from '@/store/theme'
import { Radio, RadioGroup } from '@heroui/react'
import React from 'react'
import SettingsSection from './SettingsSection'

const THEME_OPTIONS: Array<{
  description: string
  label: string
  value: Theme
}> = [
  {
    value: 'light',
    label: '浅色模式',
    description: '始终使用明亮配色，适合白天或高亮环境。',
  },
  {
    value: 'dark',
    label: '深色模式',
    description: '降低夜间使用时的眩光，视觉更聚焦。',
  },
  {
    value: 'system',
    label: '跟随系统',
    description: '自动匹配当前设备的浅色或深色主题。',
  },
]

const ThemeSettings: React.FC = () => {
  const { theme, setTheme } = useThemeStore()

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme)
  }

  return (
    <SettingsSection
      title='外观设置'
      description='选择应用的显示模式，便于在不同环境下使用。'
    >
      <RadioGroup.Root
        aria-label='主题模式'
        className='-mt-4'
        value={theme}
        onChange={(value) => handleThemeChange(value as Theme)}
      >
        {THEME_OPTIONS.map(({ description, label, value }) => (
          <Radio.Root
            key={value}
            value={value}
            className='rounded-2xl border border-border/60 bg-background-secondary/60 p-4 transition-colors duration-200 hover:bg-background-secondary data-[selected=true]:border-accent/50 data-[selected=true]:bg-accent-soft/50'
          >
            <Radio.Control className='mt-1'>
              <Radio.Indicator />
            </Radio.Control>
            <Radio.Content>
              <div
                data-slot='label'
                className='text-base font-medium text-foreground'
              >
                {label}
              </div>
              <p
                data-slot='description'
                className='mt-1 text-sm leading-6 text-muted'
              >
                {description}
              </p>
            </Radio.Content>
          </Radio.Root>
        ))}
      </RadioGroup.Root>
    </SettingsSection>
  )
}

export default ThemeSettings
