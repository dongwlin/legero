import React from 'react'
import { Button } from '@heroui/react'
import {
  STAPLE_TYPE,
  type AdjustmentCode,
  type StapleTypeCode,
} from '@/types'
import { STAPLE_AMOUNT_LEVELS, getStapleAmountLabel } from '../constants'
import OrderField from '../OrderField'

interface NoodleAmountSelectorProps {
  stapleTypeCode: StapleTypeCode | null
  stapleAmountCode: AdjustmentCode
  extraStapleUnits: number
  onStapleAmountCodeChange: (amountCode: AdjustmentCode) => void
  onExtraStapleUnitsChange: (units: number) => void
}

/**
 * 主食数量选择器组件
 * 根据主食类型显示不同的选择器
 */
export const NoodleAmountSelector: React.FC<NoodleAmountSelectorProps> = ({
  stapleTypeCode,
  stapleAmountCode,
  extraStapleUnits,
  onStapleAmountCodeChange,
  onExtraStapleUnitsChange,
}) => {
  const includeNoodles = stapleTypeCode !== null

  if (stapleTypeCode === STAPLE_TYPE.yiNoodle) {
    return (
      <OrderField label='面饼' contentClassName='flex flex-1 flex-col justify-center'>
        <div className='flex items-center gap-2'>
          <Button.Root
            isIconOnly
            variant='secondary'
            className='size-11 rounded-xl text-xl touch-manipulation md:size-12'
            aria-label='减少面饼'
            onPress={() =>
              onExtraStapleUnitsChange(Math.max(extraStapleUnits - 1, 0))
            }
          >
            -
          </Button.Root>
          <div className='min-w-14 text-center text-2xl font-semibold tabular-nums text-foreground md:min-w-16 md:text-[28px]'>
            {extraStapleUnits + 1}
          </div>
          <Button.Root
            isIconOnly
            variant='secondary'
            className='size-11 rounded-xl text-xl touch-manipulation md:size-12'
            aria-label='增加面饼'
            onPress={() => onExtraStapleUnitsChange(extraStapleUnits + 1)}
          >
            +
          </Button.Root>
        </div>
      </OrderField>
    )
  }

  const currentLevelIndex = (
    STAPLE_AMOUNT_LEVELS as readonly AdjustmentCode[]
  ).indexOf(stapleAmountCode)
  const safeLevelIndex = currentLevelIndex === -1 ? 1 : currentLevelIndex
  const isDecreaseDisabled = !includeNoodles || safeLevelIndex === 0
  const isIncreaseDisabled =
    !includeNoodles || safeLevelIndex === STAPLE_AMOUNT_LEVELS.length - 1

  const handleDecrease = () => {
    if (isDecreaseDisabled) {
      return
    }

    onStapleAmountCodeChange(STAPLE_AMOUNT_LEVELS[safeLevelIndex - 1])
  }

  const handleIncrease = () => {
    if (isIncreaseDisabled) {
      return
    }

    onStapleAmountCodeChange(STAPLE_AMOUNT_LEVELS[safeLevelIndex + 1])
  }

  return (
    <OrderField label='主食量' contentClassName='flex flex-1 flex-col justify-center'>
      <div className='flex items-center gap-2'>
        <Button.Root
          isIconOnly
          isDisabled={isDecreaseDisabled}
          variant='secondary'
          className='size-11 rounded-xl text-xl touch-manipulation md:size-12'
          aria-label='减少主食量'
          onPress={handleDecrease}
        >
          -
        </Button.Root>
        <div className='min-w-14 text-center text-xl font-semibold text-foreground md:min-w-16 md:text-2xl'>
          {getStapleAmountLabel(STAPLE_AMOUNT_LEVELS[safeLevelIndex])}
        </div>
        <Button.Root
          isIconOnly
          isDisabled={isIncreaseDisabled}
          variant='secondary'
          className='size-11 rounded-xl text-xl touch-manipulation md:size-12'
          aria-label='增加主食量'
          onPress={handleIncrease}
        >
          +
        </Button.Root>
      </div>
    </OrderField>
  )
}
