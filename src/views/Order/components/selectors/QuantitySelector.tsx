import { Button } from '@heroui/react'
import React from 'react'
import OrderField from '../OrderField'

interface QuantitySelectorProps {
  num: number
  setNum: (num: number) => void
}

/**
 * 数量选择器组件
 */
export const QuantitySelector: React.FC<QuantitySelectorProps> = ({
  num,
  setNum,
}) => {
  return (
    <OrderField label='数量' contentClassName='flex flex-1 flex-col justify-center'>
      <div className='flex items-center gap-2'>
        <Button.Root
          isIconOnly
          variant='secondary'
          className='size-11 rounded-xl text-xl touch-manipulation md:size-12'
          aria-label='减少数量'
          onPress={() => setNum(Math.max(num - 1, 1))}
        >
          -
        </Button.Root>
        <div className='min-w-14 text-center text-2xl font-semibold tabular-nums text-foreground md:min-w-16 md:text-[28px]'>
          {num}
        </div>
        <Button.Root
          isIconOnly
          variant='secondary'
          className='size-11 rounded-xl text-xl touch-manipulation md:size-12'
          aria-label='增加数量'
          onPress={() => setNum(num + 1)}
        >
          +
        </Button.Root>
      </div>
    </OrderField>
  )
}
