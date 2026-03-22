import React from 'react'
import { Checkbox, Label } from '@heroui/react'
import { MEAT_OPTIONS } from '../constants'
import { MeatType } from '@/types'
import OrderField from '../OrderField'

interface MeatSelectorProps {
  availableMeats: MeatType[]
  onMeatChange: (meat: MeatType, checked: boolean) => void
  showPorkKidney: boolean
}

/**
 * 肉类选择器组件
 */
export const MeatSelector: React.FC<MeatSelectorProps> = ({
  availableMeats,
  onMeatChange,
  showPorkKidney,
}) => {
  return (
    <OrderField>
      <div className='grid grid-cols-2 gap-2.5 sm:grid-cols-3'>
        {MEAT_OPTIONS.map((meat) => {
          // 猪腰只在非小份时显示
          if (meat === '猪腰' && !showPorkKidney) {
            return null
          }

          return (
            <Checkbox.Root
              key={meat}
              name={meat}
              value={meat}
              className='rounded-xl border border-border/60 bg-background px-3 py-2.5 transition-colors duration-200 hover:bg-background-secondary data-[selected=true]:border-accent/40 data-[selected=true]:bg-accent-soft/45'
              isSelected={availableMeats.includes(meat)}
              variant='secondary'
              onChange={(checked) => onMeatChange(meat, checked)}
            >
              <Checkbox.Control className='mt-0.5'>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Content>
                <Label className='text-sm font-medium text-foreground md:text-[15px]'>
                  {meat}
                </Label>
              </Checkbox.Content>
            </Checkbox.Root>
          )
        })}
      </div>
    </OrderField>
  )
}
