import OrderField from './OrderField'
import { OrderCompactSelect } from './OrderCompactSelect'

interface OrderSelectFieldProps<T extends string> {
  className?: string
  description?: string
  isDisabled?: boolean
  label: string
  options: readonly T[]
  placeholder?: string
  value: T
  onChange: (value: T) => void
}

export const OrderSelectField = <T extends string>({
  className = '',
  description,
  isDisabled = false,
  label,
  onChange,
  options,
  placeholder = '请选择',
  value,
}: OrderSelectFieldProps<T>) => {
  return (
    <OrderField label={label} description={description} className={className}>
      <OrderCompactSelect
        isDisabled={isDisabled}
        options={options}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
    </OrderField>
  )
}
