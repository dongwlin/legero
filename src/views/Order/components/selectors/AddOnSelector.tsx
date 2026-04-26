import React from 'react'
import { Button } from '@heroui/react'
import OrderField from '../OrderField'

type AddOnCounterProps = {
  label: string
  ariaLabelPrefix: string
  count: number
  onCountChange: (count: number) => void
}

const AddOnCounter: React.FC<AddOnCounterProps> = ({
  label,
  ariaLabelPrefix,
  count,
  onCountChange,
}) => {
  return (
    <div className='bg-background'>
      <div className='mb-2 flex'>
        <div className='text-xs font-medium text-muted md:text-sm'>
          {label}
        </div>
      </div>

      <div className='flex items-center gap-2'>
        <Button.Root
          isIconOnly
          variant='secondary'
          className='size-11 rounded-xl text-xl touch-manipulation md:size-12'
          aria-label={`减少${ariaLabelPrefix}`}
          onPress={() => onCountChange(Math.max(count - 1, 0))}
        >
          -
        </Button.Root>
        <div className='min-w-14 text-center text-2xl font-semibold tabular-nums text-foreground md:min-w-16 md:text-[28px]'>
          {count}
        </div>
        <Button.Root
          isIconOnly
          variant='secondary'
          className='size-11 rounded-xl text-xl touch-manipulation md:size-12'
          aria-label={`增加${ariaLabelPrefix}`}
          onPress={() => onCountChange(count + 1)}
        >
          +
        </Button.Root>
      </div>
    </div>
  )
}

interface AddOnSelectorProps {
  friedEggCount: number
  tofuSkewerCount: number
  onFriedEggCountChange: (count: number) => void
  onTofuSkewerCountChange: (count: number) => void
}

export const AddOnSelector: React.FC<AddOnSelectorProps> = ({
  friedEggCount,
  tofuSkewerCount,
  onFriedEggCountChange,
  onTofuSkewerCountChange,
}) => {
  return (
    <OrderField>
      <div className='grid gap-2.5 grid-cols-2'>
        <AddOnCounter
          label='煎蛋'
          ariaLabelPrefix='煎蛋数量'
          count={friedEggCount}
          onCountChange={onFriedEggCountChange}
        />
        <AddOnCounter
          label='豆腐串'
          ariaLabelPrefix='豆腐串数量'
          count={tofuSkewerCount}
          onCountChange={onTofuSkewerCountChange}
        />
      </div>
    </OrderField>
  )
}
