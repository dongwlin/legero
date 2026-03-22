import { ListBox, Select } from '@heroui/react'

interface OrderCompactSelectProps<T extends string> {
  className?: string
  isDisabled?: boolean
  label?: string
  options: readonly T[]
  placeholder?: string
  value: T
  onChange: (value: T) => void
}

export const OrderCompactSelect = <T extends string>({
  className = '',
  isDisabled = false,
  label,
  onChange,
  options,
  placeholder = '请选择',
  value,
}: OrderCompactSelectProps<T>) => {
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
        value={value}
        variant='secondary'
        onChange={(nextValue) => {
          if (typeof nextValue === 'string') {
            onChange(nextValue as T)
          }
        }}
      >
        <Select.Trigger className='min-h-11 rounded-xl border border-border/60 bg-background px-3 text-sm font-medium md:min-h-12 md:text-base'>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover className='rounded-xl border border-border/70 bg-background shadow-xl'>
          <ListBox className='p-2'>
            {options.map((option) => (
              <ListBox.Item
                key={option}
                id={option}
                textValue={option}
                className='rounded-lg px-3 py-2 text-sm md:text-base'
              >
                <div className='flex items-center justify-between gap-3'>
                  <span>{option}</span>
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
