import React from 'react'
import { apiBaseUrlInputClassName } from '@/components/apiBaseUrlFieldStyles'
import { useApiBaseUrl } from '@/hooks/useApiBaseUrl'
import SettingsSection from './SettingsSection'

const ApiConnectionSettings: React.FC = () => {
  const apiBaseUrl = useApiBaseUrl()

  return (
    <SettingsSection
      title='当前服务器'
    >
      <input
        readOnly
        aria-label='服务器地址'
        autoCapitalize='none'
        autoCorrect='off'
        className={apiBaseUrlInputClassName}
        placeholder='https://example.com'
        spellCheck={false}
        type='url'
        value={apiBaseUrl ?? ''}
      />
    </SettingsSection>
  )
}

export default ApiConnectionSettings
