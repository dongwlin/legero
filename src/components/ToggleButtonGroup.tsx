import React from 'react'

interface ToggleButtonGroupProps<T extends string> {
  options: readonly T[]
  value: T
  onChange: (value: T) => void
  getDisplayValue?: (value: T) => string
  className?: string
  buttonClassName?: string
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
  className = 'flex flex-row gap-3',
  buttonClassName = 'btn text-xl',
}: ToggleButtonGroupProps<T>) => {
  return (
    <div className={className}>
      {options.map((option) => (
        <button
          key={option}
          className={`${buttonClassName} ${
            value === option ? 'btn-primary' : ''
          }`}
          onClick={() => onChange(option)}
        >
          {getDisplayValue ? getDisplayValue(option) : option}
        </button>
      ))}
    </div>
  )
}
