import OrderField from './OrderField'
import { OrderCompactSelect } from './OrderCompactSelect'

type OrderSelectFieldValue = string | number

interface OrderSelectFieldProps<T extends OrderSelectFieldValue> {
  className?: string
  description?: string
  isDisabled?: boolean
  label: string
  options: readonly T[] | readonly { value: T; label: string }[]
  placeholder?: string
  value?: T | null
  onChange: (value: T) => void
}

export const OrderSelectField = <T extends OrderSelectFieldValue>({
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
