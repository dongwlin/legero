import React from 'react'
import { ADJUSTMENT_OPTIONS } from '../constants'
import { type AdjustmentCode } from '@/types'
import OrderField from '../OrderField'
import { OrderCompactSelect } from '../OrderCompactSelect'

interface IngredientSelectorProps {
  greensCode: AdjustmentCode
  scallionCode: AdjustmentCode
  pepperCode: AdjustmentCode
  onGreensCodeChange: (value: AdjustmentCode) => void
  onScallionCodeChange: (value: AdjustmentCode) => void
  onPepperCodeChange: (value: AdjustmentCode) => void
}

/**
 * 配料选择器组件
 */
export const IngredientSelector: React.FC<IngredientSelectorProps> = ({
  greensCode,
  scallionCode,
  pepperCode,
  onGreensCodeChange,
  onScallionCodeChange,
  onPepperCodeChange,
}) => {
  return (
    <OrderField label=''>
      <div className='grid gap-2 grid-cols-3'>
        <OrderCompactSelect
          label='青菜'
          value={greensCode}
          options={ADJUSTMENT_OPTIONS}
          onChange={onGreensCodeChange}
        />
        <OrderCompactSelect
          label='葱花'
          value={scallionCode}
          options={ADJUSTMENT_OPTIONS}
          onChange={onScallionCodeChange}
        />
        <OrderCompactSelect
          label='胡椒'
          value={pepperCode}
          options={ADJUSTMENT_OPTIONS}
          onChange={onPepperCodeChange}
        />
      </div>
    </OrderField>
  )
}
