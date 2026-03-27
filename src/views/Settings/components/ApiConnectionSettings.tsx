import React from 'react'
import ApiBaseUrlForm from '@/components/ApiBaseUrlForm'
import SettingsSection from './SettingsSection'

const ApiConnectionSettings: React.FC = () => {
  return (
    <SettingsSection
      title='服务器设置'
      description='为当前设备配置服务器地址，登录、同步与统计都会使用这里保存的地址。'
    >
      <ApiBaseUrlForm />
    </SettingsSection>
  )
}

export default ApiConnectionSettings
