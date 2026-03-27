import React from 'react'
import { ToggleButtonGroup } from '@/components/ToggleButtonGroup'
import { Switch } from '@heroui/react'
import { type StapleTypeCode } from '@/types'
import { STAPLE_TYPE_OPTIONS } from '../constants'
import OrderField from '../OrderField'

interface NoodleSelectorProps {
  stapleTypeCode: StapleTypeCode | null
  onStapleEnabledChange: (checked: boolean) => void
  onStapleTypeCodeChange: (code: StapleTypeCode) => void
}

/**
 * 主食选择器组件
 */
export const NoodleSelector: React.FC<NoodleSelectorProps> = ({
  stapleTypeCode,
  onStapleEnabledChange,
  onStapleTypeCodeChange,
}) => {
  const includeNoodles = stapleTypeCode !== null

  return (
    <OrderField contentClassName='flex flex-1 flex-col'>
      <div className='mb-1.5 flex items-center gap-2'>
        <h3 className='text-sm font-semibold text-foreground md:text-[15px]'>
          主食
        </h3>
        <Switch.Root
          aria-label='是否带主食'
          className='shrink-0'
          isSelected={includeNoodles}
          onChange={onStapleEnabledChange}
        >
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch.Root>
      </div>
      <div className='flex flex-1 items-center'>
        <ToggleButtonGroup
          className='flex flex-1 flex-wrap gap-2'
          options={STAPLE_TYPE_OPTIONS}
          value={stapleTypeCode}
          isDisabled={!includeNoodles}
          onChange={onStapleTypeCodeChange}
        />
      </div>
    </OrderField>
  )
}
