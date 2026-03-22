import { useOrderSettingsStore } from '@/store/orderSettings'
import { Input } from '@heroui/react'
import React from 'react'
import SettingsSection from './SettingsSection'

const OrderSettings: React.FC = () => {
  const { waitTimeThresholdMinutes, setWaitTimeThresholdMinutes } =
    useOrderSettingsStore()

  const handleThresholdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10)
    if (!isNaN(value) && value >= 0) {
      setWaitTimeThresholdMinutes(value)
    }
  }

  return (
    <SettingsSection
      title='订单设置'
      description='调整订单等待超时的提醒阈值。'
    >
      <div className='space-y-3'>
        <label
          htmlFor='wait-time-threshold'
          className='text-sm font-medium text-foreground'
        >
          等待时间超时警告（分钟）
        </label>
        <Input.Root
          fullWidth
          id='wait-time-threshold'
          inputMode='numeric'
          min='0'
          placeholder='请输入分钟数，设置为 0 时不显示警告'
          step='1'
          type='number'
          value={waitTimeThresholdMinutes}
          variant='secondary'
          onChange={handleThresholdChange}
        />
        <p className='text-sm leading-6 text-muted'>
          超过该时长的订单会被标记为超时，设置为 `0` 时关闭提醒。
        </p>
      </div>
    </SettingsSection>
  )
}

export default OrderSettings
