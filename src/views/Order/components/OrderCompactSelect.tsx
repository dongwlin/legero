import { ListBox, Select } from '@heroui/react'

type OrderCompactSelectValue = string | number

export type OrderCompactSelectOption<T extends OrderCompactSelectValue> =
  Readonly<{
    value: T
    label: string
  }>

interface OrderCompactSelectProps<T extends OrderCompactSelectValue> {
  className?: string
  isDisabled?: boolean
  label?: string
  options: readonly (OrderCompactSelectOption<T> | T)[]
  placeholder?: string
  value?: T | null
  onChange: (value: T) => void
}

const isOrderCompactSelectOption = <T extends OrderCompactSelectValue>(
  option: OrderCompactSelectOption<T> | T,
): option is OrderCompactSelectOption<T> =>
  typeof option === 'object' && option !== null && 'value' in option

const normalizeOptions = <T extends OrderCompactSelectValue>(
  options: readonly (OrderCompactSelectOption<T> | T)[],
): readonly OrderCompactSelectOption<T>[] =>
  options.map((option) =>
    isOrderCompactSelectOption(option)
      ? option
      : {
          value: option,
          label: String(option),
        },
  )

export const OrderCompactSelect = <T extends OrderCompactSelectValue>({
  className = '',
  isDisabled = false,
  label,
  onChange,
  options,
  placeholder = '请选择',
  value,
}: OrderCompactSelectProps<T>) => {
  const normalizedOptions = normalizeOptions(options)

  return (
    <div className={label ? `space-y-1.5 ${className}`.trim() : className}>
      {label ? (
        <div className='text-xs font-medium text-muted md:text-sm'>{label}</div>
      ) : null}
      <Select.Root
        aria-label={label ?? placeholder}
        className='w-full'
        fullWidth
        isDisabled={isDisabled}
        placeholder={placeholder}
        value={value == null ? undefined : String(value)}
        variant='secondary'
        onChange={(nextValue) => {
          if (typeof nextValue === 'string') {
            const nextOption = normalizedOptions.find(
              (option) => String(option.value) === nextValue,
            )

            if (nextOption) {
              onChange(nextOption.value)
            }
          }
        }}
      >
        <Select.Trigger className='min-h-11 rounded-xl border border-border/60 bg-background px-3 text-sm font-medium md:min-h-12 md:text-base'>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover className='rounded-xl border border-border/70 bg-background shadow-xl'>
          <ListBox className='p-2'>
            {normalizedOptions.map((option) => (
              <ListBox.Item
                key={String(option.value)}
                id={String(option.value)}
                textValue={option.label}
                className='rounded-lg px-3 py-2 text-sm md:text-base'
              >
                <div className='flex items-center justify-between gap-3'>
                  <span>{option.label}</span>
                  <ListBox.ItemIndicator />
                </div>
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select.Root>
    </div>
  )
}
