import React, { useMemo, useState } from 'react'
import { Button, Input } from '@heroui/react'
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
  const [customPriceInput, setCustomPriceInput] = useState(() =>
    customSizePrice > 0 ? String(customSizePrice) : '',
  )

  const getDisplayValue = useMemo(() => {
    return (s: Size) => getSizeDisplayValue(s, includeNoodles, noodleType)
  }, [includeNoodles, noodleType])

  return (
    <OrderField>
      <div className='flex flex-wrap gap-3'>
        {SIZES.filter((option) => option !== '自定义').map((option) => (
          <Button.Root
            key={option}
            aria-pressed={size === option}
            className='h-11 min-w-20 rounded-xl px-4 text-sm font-semibold touch-manipulation md:h-12 md:text-base'
            variant={size === option ? 'primary' : 'secondary'}
            onPress={() => onSizeChange(option)}
          >
            {getDisplayValue(option)}
          </Button.Root>
        ))}

        {showCustomPrice ? (
          <Input.Root
            autoFocus
            id='custom-size-price'
            aria-label='自定义价格'
            inputMode='numeric'
            min='0'
            placeholder='输入价格'
            step='1'
            type='number'
            value={customPriceInput}
            variant='secondary'
            className='w-28 min-h-11 rounded-xl md:min-h-12'
            onFocus={(event) => {
              event.target.select()
            }}
            onChange={(event) => {
              const nextValue = event.target.value
              const nextPrice = Number(nextValue)

              setCustomPriceInput(nextValue)
              onCustomSizePriceChange(Number.isNaN(nextPrice) ? 0 : nextPrice)
            }}
          />
        ) : (
          <Button.Root
            aria-pressed={false}
            className='h-11 min-w-20 rounded-xl px-4 text-sm font-semibold touch-manipulation md:h-12 md:text-base'
            variant='secondary'
            onPress={() => {
              setCustomPriceInput(customSizePrice > 0 ? String(customSizePrice) : '')
              onSizeChange('自定义')
            }}
          >
            自定义
          </Button.Root>
        )}
      </div>
    </OrderField>
  )
}
