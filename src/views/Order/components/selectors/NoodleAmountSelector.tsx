import React from 'react'
import { Button } from '@heroui/react'
import { Adjustment, NoodleType } from '@/types'
import OrderField from '../OrderField'

const NOODLE_AMOUNT_LEVELS: readonly Adjustment[] = ['少', '正常', '多']

const getNoodleAmountLabel = (amount: Adjustment) =>
  amount === '正常' ? '标' : amount

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
        <div className='flex items-center gap-2'>
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

  const currentLevelIndex = NOODLE_AMOUNT_LEVELS.indexOf(noodleAmount)
  const safeLevelIndex = currentLevelIndex === -1 ? 1 : currentLevelIndex
  const isDecreaseDisabled = !includeNoodles || safeLevelIndex === 0
  const isIncreaseDisabled =
    !includeNoodles || safeLevelIndex === NOODLE_AMOUNT_LEVELS.length - 1

  const handleDecrease = () => {
    if (isDecreaseDisabled) {
      return
    }

    onNoodleAmountChange(NOODLE_AMOUNT_LEVELS[safeLevelIndex - 1])
  }

  const handleIncrease = () => {
    if (isIncreaseDisabled) {
      return
    }

    onNoodleAmountChange(NOODLE_AMOUNT_LEVELS[safeLevelIndex + 1])
  }

  return (
    <OrderField label='粉量' contentClassName='flex flex-1 flex-col justify-center'>
      <div className='flex items-center gap-2'>
        <Button.Root
          isIconOnly
          isDisabled={isDecreaseDisabled}
          variant='secondary'
          className='size-11 rounded-xl text-xl touch-manipulation md:size-12'
          aria-label='减少粉量'
          onPress={handleDecrease}
        >
          -
        </Button.Root>
        <div className='min-w-14 text-center text-xl font-semibold text-foreground md:min-w-16 md:text-2xl'>
          {getNoodleAmountLabel(NOODLE_AMOUNT_LEVELS[safeLevelIndex])}
        </div>
        <Button.Root
          isIconOnly
          isDisabled={isIncreaseDisabled}
          variant='secondary'
          className='size-11 rounded-xl text-xl touch-manipulation md:size-12'
          aria-label='增加粉量'
          onPress={handleIncrease}
        >
          +
        </Button.Root>
      </div>
    </OrderField>
  )
}
