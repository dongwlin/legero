import React from 'react'
import { Button } from '@heroui/react'
import { ADJUSTMENT_OPTIONS } from '../constants'
import { Adjustment, NoodleType } from '@/types'
import OrderField from '../OrderField'
import { OrderCompactSelect } from '../OrderCompactSelect'

interface NoodleAmountSelectorProps {
  noodleType: NoodleType
  noodleAmount: Adjustment
  extraNoodleBlocks: number
  includeNoodles: boolean
  onNoodleAmountChange: (amount: Adjustment) => void
  onExtraNoodleBlocksChange: (blocks: number) => void
}

/**
 * 面条数量选择器组件
 * 根据面条类型显示不同的选择器
 */
export const NoodleAmountSelector: React.FC<NoodleAmountSelectorProps> = ({
  noodleType,
  noodleAmount,
  extraNoodleBlocks,
  includeNoodles,
  onNoodleAmountChange,
  onExtraNoodleBlocksChange,
}) => {
  if (noodleType === '伊面') {
    return (
      <OrderField label='面饼' contentClassName='flex flex-1 flex-col justify-center'>
        <div className='flex items-center gap-3'>
          <Button.Root
            isIconOnly
            variant='secondary'
            className='size-11 rounded-xl text-xl touch-manipulation md:size-12'
            aria-label='减少面饼'
            onPress={() =>
              onExtraNoodleBlocksChange(Math.max(extraNoodleBlocks - 1, 0))
            }
          >
            -
          </Button.Root>
          <div className='min-w-14 text-center text-2xl font-semibold tabular-nums text-foreground md:min-w-16 md:text-[28px]'>
            {extraNoodleBlocks + 1}
          </div>
          <Button.Root
            isIconOnly
            variant='secondary'
            className='size-11 rounded-xl text-xl touch-manipulation md:size-12'
            aria-label='增加面饼'
            onPress={() => onExtraNoodleBlocksChange(extraNoodleBlocks + 1)}
          >
            +
          </Button.Root>
        </div>
      </OrderField>
    )
  }

  return (
    <OrderField label='粉量' contentClassName='flex flex-1 flex-col justify-center'>
      <OrderCompactSelect
        isDisabled={!includeNoodles}
        options={ADJUSTMENT_OPTIONS.slice(0, 3)}
        value={noodleAmount}
        onChange={onNoodleAmountChange}
      />
    </OrderField>
  )
}
