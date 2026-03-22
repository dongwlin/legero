import React from 'react'
import { ADJUSTMENT_OPTIONS } from '../constants'
import { Adjustment } from '@/types'
import OrderField from '../OrderField'
import { OrderCompactSelect } from '../OrderCompactSelect'

interface IngredientSelectorProps {
  greens: Adjustment
  scallion: Adjustment
  pepper: Adjustment
  onGreensChange: (value: Adjustment) => void
  onScallionChange: (value: Adjustment) => void
  onPepperChange: (value: Adjustment) => void
}

/**
 * 配料选择器组件
 */
export const IngredientSelector: React.FC<IngredientSelectorProps> = ({
  greens,
  scallion,
  pepper,
  onGreensChange,
  onScallionChange,
  onPepperChange,
}) => {
  return (
    <OrderField>
      <div className='grid gap-3 sm:grid-cols-3'>
        <OrderCompactSelect
          label='青菜'
          value={greens}
          options={ADJUSTMENT_OPTIONS}
          onChange={onGreensChange}
        />
        <OrderCompactSelect
          label='葱花'
          value={scallion}
          options={ADJUSTMENT_OPTIONS}
          onChange={onScallionChange}
        />
        <OrderCompactSelect
          label='胡椒'
          value={pepper}
          options={ADJUSTMENT_OPTIONS}
          onChange={onPepperChange}
        />
      </div>
    </OrderField>
  )
}
