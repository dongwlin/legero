import React from 'react'

interface OrderFieldProps {
  children: React.ReactNode
  className?: string
  contentClassName?: string
  description?: string
  label?: string
}

const OrderField: React.FC<OrderFieldProps> = ({
  children,
  className = '',
  contentClassName = '',
  description,
  label,
}) => {
  const hasHeader = Boolean(label || description)
  const contentClasses = `min-h-0 ${contentClassName}`.trim()

  return (
    <section className={`flex h-full min-w-0 flex-col ${className}`.trim()}>
      {hasHeader ? (
        <div className={description ? 'mb-2' : 'mb-1.5'}>
          {label ? (
            <h3 className='text-sm font-semibold text-foreground md:text-[15px]'>
              {label}
            </h3>
          ) : null}
          {description ? (
            <p className='mt-1 text-xs leading-4 text-muted md:text-[13px]'>
              {description}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className={contentClasses}>{children}</div>
    </section>
  )
}

export default OrderField
