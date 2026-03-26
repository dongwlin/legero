import React, { useMemo, useState } from 'react'
import { Button, Input } from '@heroui/react'
import { SIZE, STAPLE_TYPE, type SizeCode, type StapleTypeCode } from '@/types'
import { SIZE_BUTTON_OPTIONS } from '../constants'
import { getSizeDisplayValue } from '../utils'
import OrderField from '../OrderField'

interface SizeSelectorProps {
  sizeCode: SizeCode
  stapleTypeCode: StapleTypeCode | null
  customSizePriceCents: number | null
  onSizeCodeChange: (sizeCode: SizeCode) => void
  onCustomSizePriceCentsChange: (priceCents: number | null) => void
  showCustomPrice: boolean
}

/**
 * 规格选择器组件
 */
export const SizeSelector: React.FC<SizeSelectorProps> = ({
  sizeCode,
  stapleTypeCode,
  customSizePriceCents,
  onSizeCodeChange,
  onCustomSizePriceCentsChange,
  showCustomPrice,
}) => {
  const [customPriceInput, setCustomPriceInput] = useState(() =>
    customSizePriceCents != null && customSizePriceCents > 0
      ? String(customSizePriceCents / 100)
      : '',
  )

  const getDisplayValue = useMemo(() => {
    return (nextSizeCode: SizeCode) =>
      getSizeDisplayValue(nextSizeCode, stapleTypeCode)
  }, [stapleTypeCode])
  const presetSizeOptions = useMemo(
    () =>
      SIZE_BUTTON_OPTIONS.filter(
        (option) =>
          option.value !== SIZE.custom &&
          (stapleTypeCode !== STAPLE_TYPE.rice || option.value !== SIZE.small),
      ),
    [stapleTypeCode],
  )

  return (
    <OrderField
      label=''
      contentClassName='flex flex-1 flex-col justify-center'
    >
      <div className='flex flex-wrap gap-2.5'>
        {presetSizeOptions.map((option) => (
          <Button.Root
            key={option.value}
            aria-pressed={sizeCode === option.value}
            className='h-11 min-w-20 rounded-xl px-4 text-sm font-semibold touch-manipulation md:h-12 md:text-base'
            variant={sizeCode === option.value ? 'primary' : 'secondary'}
            onPress={() => onSizeCodeChange(option.value)}
          >
            {getDisplayValue(option.value)}
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
              onCustomSizePriceCentsChange(
                nextValue === '' || Number.isNaN(nextPrice)
                  ? null
                  : Math.max(0, Math.round(nextPrice * 100)),
              )
            }}
          />
        ) : (
          <Button.Root
            aria-pressed={false}
            className='h-11 min-w-20 rounded-xl px-4 text-sm font-semibold touch-manipulation md:h-12 md:text-base'
            variant='secondary'
            onPress={() => {
              setCustomPriceInput(
                customSizePriceCents != null && customSizePriceCents > 0
                  ? String(customSizePriceCents / 100)
                  : '',
              )
              onSizeCodeChange(SIZE.custom)
            }}
          >
            自定义
          </Button.Root>
        )}
      </div>
    </OrderField>
  )
}
