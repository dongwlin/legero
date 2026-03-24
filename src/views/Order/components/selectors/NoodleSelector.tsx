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
    <OrderField>
      <div className='flex flex-wrap items-center gap-3'>
        <div className='flex h-11 items-center md:h-12'>
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
        <ToggleButtonGroup
          className='flex flex-1 flex-wrap gap-3'
          options={NOODLE_TYPES}
          value={includeNoodles ? noodleType : undefined}
          isDisabled={!includeNoodles}
          onChange={onNoodleTypeChange}
        />
      </div>
    </OrderField>
  )
}
