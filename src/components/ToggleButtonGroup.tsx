import { Button } from '@heroui/react'

type ToggleButtonValue = string | number

export type ToggleButtonOption<T extends ToggleButtonValue> = Readonly<{
  value: T
  label: string
}>

interface ToggleButtonGroupProps<T extends ToggleButtonValue> {
  options: readonly (ToggleButtonOption<T> | T)[]
  value?: T | null
  onChange: (value: T) => void
  getDisplayValue?: (value: T) => string
  className?: string
  buttonClassName?: string
  isDisabled?: boolean
}

const isToggleButtonOption = <T extends ToggleButtonValue>(
  option: ToggleButtonOption<T> | T,
): option is ToggleButtonOption<T> =>
  typeof option === 'object' && option !== null && 'value' in option

const normalizeOptions = <T extends ToggleButtonValue>(
  options: readonly (ToggleButtonOption<T> | T)[],
  getDisplayValue?: (value: T) => string,
): readonly ToggleButtonOption<T>[] =>
  options.map((option) =>
    isToggleButtonOption(option)
      ? option
      : {
        value: option,
        label: getDisplayValue ? getDisplayValue(option) : String(option),
      },
  )

/**
 * 可复用的按钮组组件
 * 用于选择一组互斥的选项
 */
export const ToggleButtonGroup = <T extends ToggleButtonValue>({
  options,
  value,
  onChange,
  getDisplayValue,
  className = 'flex flex-wrap gap-3',
  buttonClassName = 'h-11 min-w-18 rounded-xl px-4 text-sm font-semibold touch-manipulation xs:min-w-20 md:h-12 md:text-base',
  isDisabled = false,
}: ToggleButtonGroupProps<T>) => {
  const normalizedOptions = normalizeOptions(options, getDisplayValue)

  return (
    <div className={className} role='group'>
      {normalizedOptions.map((option) => (
        <Button.Root
          key={String(option.value)}
          aria-pressed={value === option.value}
          className={buttonClassName}
          isDisabled={isDisabled}
          variant={value === option.value ? 'primary' : 'secondary'}
          onPress={() => onChange(option.value)}
        >
          {option.label}
        </Button.Root>
      ))}
    </div>
  )
}
