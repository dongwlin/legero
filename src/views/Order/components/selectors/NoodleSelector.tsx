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
      <div className='space-y-3'>
        <div className='flex items-center justify-between rounded-xl border border-border/60 bg-background px-3 py-2.5'>
          <div className='text-sm font-medium text-foreground md:text-base'>带粉</div>
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
          options={NOODLE_TYPES}
          value={noodleType}
          onChange={onNoodleTypeChange}
        />
      </div>
    </OrderField>
  )
}
