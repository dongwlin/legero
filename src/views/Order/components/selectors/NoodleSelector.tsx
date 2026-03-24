import React from 'react'
import { ToggleButtonGroup } from '@/components/ToggleButtonGroup'
import { Switch } from '@heroui/react'
import { NOODLE_TYPES } from '../constants'
import { NoodleType } from '@/types'
import OrderField from '../OrderField'

interface NoodleSelectorProps {
  includeNoodles: boolean
  noodleType: NoodleType
  onIncludeNoodlesChange: (checked: boolean) => void
  onNoodleTypeChange: (type: NoodleType) => void
}

/**
 * 粉类选择器组件
 */
export const NoodleSelector: React.FC<NoodleSelectorProps> = ({
  includeNoodles,
  noodleType,
  onIncludeNoodlesChange,
  onNoodleTypeChange,
}) => {
  return (
    <OrderField contentClassName='flex flex-1 flex-col'>
      <div className='mb-1.5 flex items-center gap-2.5'>
        <h3 className='text-sm font-semibold text-foreground md:text-[15px]'>
          粉类
        </h3>
        <Switch.Root
          aria-label='是否带粉'
          className='shrink-0'
          isSelected={includeNoodles}
          onChange={onIncludeNoodlesChange}
        >
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch.Root>
      </div>
      <div className='flex flex-1 items-center'>
        <ToggleButtonGroup
          className='flex flex-1 flex-wrap gap-2.5'
          options={NOODLE_TYPES}
          value={includeNoodles ? noodleType : undefined}
          isDisabled={!includeNoodles}
          onChange={onNoodleTypeChange}
        />
      </div>
    </OrderField>
  )
}
