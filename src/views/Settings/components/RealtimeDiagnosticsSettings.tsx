import React from 'react'
import { Link } from 'react-router'
import SettingsSection from './SettingsSection'

const RealtimeDiagnosticsSettings: React.FC = () => {
  return (
    <SettingsSection
      title='实时连接诊断'
      description='查看实时连接、重连、网络状态和数据同步情况。'
    >
      <Link
        to='/settings/diagnostics'
        className='group flex w-full items-center justify-between gap-4 rounded-2xl border border-border/60 bg-background-secondary/60 p-4 text-left transition-colors duration-200 hover:border-accent/40 hover:bg-background-secondary focus:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background'
      >
        <span className='min-w-0'>
          <span className='block text-base font-medium text-foreground'>
            查看实时连接诊断
          </span>
          <span className='mt-1 block text-sm leading-6 text-muted'>
            了解当前连接是否健康，以及最近一次断线和恢复原因。
          </span>
        </span>
        <span className='shrink-0 text-sm font-medium text-accent transition-transform duration-200 group-hover:translate-x-0.5'>
          查看
        </span>
      </Link>
    </SettingsSection>
  )
}

export default RealtimeDiagnosticsSettings
