import { Button } from '@heroui/react'

interface ToggleButtonGroupProps<T extends string> {
  options: readonly T[]
  value: T
  onChange: (value: T) => void
  getDisplayValue?: (value: T) => string
  className?: string
  buttonClassName?: string
  isDisabled?: boolean
}

/**
 * 可复用的按钮组组件
 * 用于选择一组互斥的选项
 */
export const ToggleButtonGroup = <T extends string>({
  options,
  value,
  onChange,
  getDisplayValue,
  className = 'flex flex-wrap gap-3',
  buttonClassName = 'h-11 min-w-20 rounded-xl px-4 text-sm font-semibold touch-manipulation md:h-12 md:text-base',
  isDisabled = false,
}: ToggleButtonGroupProps<T>) => {
  return (
    <div className={className} role='group'>
      {options.map((option) => (
        <Button.Root
          key={option}
          aria-pressed={value === option}
          className={buttonClassName}
          isDisabled={isDisabled}
          variant={value === option ? 'primary' : 'secondary'}
          onPress={() => onChange(option)}
        >
          {getDisplayValue ? getDisplayValue(option) : option}
        </Button.Root>
      ))}
    </div>
  )
}
