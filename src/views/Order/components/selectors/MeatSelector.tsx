import React from 'react'
import { Checkbox, Label } from '@heroui/react'
import { type MeatCode } from '@/types'
import { MEAT_CHECKBOX_OPTIONS, PORK_KIDNEY_CODE } from '../constants'
import OrderField from '../OrderField'

interface MeatSelectorProps {
  selectedMeatCodes: MeatCode[]
  onSelectedMeatCodesChange: (codes: MeatCode[]) => void
  showPorkKidney: boolean
}

/**
 * 肉类选择器组件
 */
export const MeatSelector: React.FC<MeatSelectorProps> = ({
  selectedMeatCodes,
  onSelectedMeatCodesChange,
  showPorkKidney,
}) => {
  return (
    <OrderField label=''>
      <div className='grid grid-cols-2 gap-2.5 sm:grid-cols-3'>
        {MEAT_CHECKBOX_OPTIONS.map((meat) => {
          // 猪腰只在非小份时显示
          if (meat.value === PORK_KIDNEY_CODE && !showPorkKidney) {
            return null
          }

          const isSelected = selectedMeatCodes.includes(meat.value)

          return (
            <Checkbox.Root
              key={meat.value}
              name={String(meat.value)}
              value={String(meat.value)}
              className='rounded-xl border border-border/60 bg-background px-3 py-2.5 transition-colors duration-200 hover:bg-background-secondary data-[selected=true]:border-accent/40 data-[selected=true]:bg-accent-soft/45'
              isSelected={isSelected}
              variant='secondary'
              onChange={(checked) =>
                onSelectedMeatCodesChange(
                  checked
                    ? [...selectedMeatCodes, meat.value]
                    : selectedMeatCodes.filter((code) => code !== meat.value),
                )
              }
            >
              <Checkbox.Control className='mt-0.5'>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Content>
                <Label className='text-sm font-medium text-foreground md:text-[15px]'>
                  {meat.label}
                </Label>
              </Checkbox.Content>
            </Checkbox.Root>
          )
        })}
      </div>
    </OrderField>
  )
}
