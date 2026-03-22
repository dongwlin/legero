import React, { useMemo } from 'react'
import { ToggleButtonGroup } from '@/components/ToggleButtonGroup'
import { Input } from '@heroui/react'
import { SIZES } from '../constants'
import { NoodleType, Size } from '@/types'
import { getSizeDisplayValue } from '../utils'
import OrderField from '../OrderField'

interface SizeSelectorProps {
  size: Size
  includeNoodles: boolean
  noodleType: NoodleType
  customSizePrice: number
  onSizeChange: (size: Size) => void
  onCustomSizePriceChange: (price: number) => void
  showCustomPrice: boolean
}

/**
 * 规格选择器组件
 */
export const SizeSelector: React.FC<SizeSelectorProps> = ({
  size,
  includeNoodles,
  noodleType,
  customSizePrice,
  onSizeChange,
  onCustomSizePriceChange,
  showCustomPrice,
}) => {
  const getDisplayValue = useMemo(() => {
    return (s: Size) => getSizeDisplayValue(s, includeNoodles, noodleType)
  }, [includeNoodles, noodleType])

  return (
    <OrderField>
      <div className='space-y-3'>
        <ToggleButtonGroup
          options={SIZES}
          value={size}
          onChange={onSizeChange}
          getDisplayValue={getDisplayValue}
        />

        {showCustomPrice ? (
          <div className='space-y-1.5 md:max-w-44'>
            <label
              htmlFor='custom-size-price'
              className='text-xs font-medium text-muted md:text-sm'
            >
              自定义价格
            </label>
            <Input.Root
              fullWidth
              id='custom-size-price'
              inputMode='numeric'
              min='0'
              step='1'
              type='number'
              value={customSizePrice}
              variant='secondary'
              className='min-h-11 rounded-xl md:min-h-12'
              onChange={(e) => {
                const nextPrice = Number(e.target.value)
                onCustomSizePriceChange(Number.isNaN(nextPrice) ? 0 : nextPrice)
              }}
            />
          </div>
        ) : null}
      </div>
    </OrderField>
  )
}
