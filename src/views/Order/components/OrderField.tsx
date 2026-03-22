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

  return (
    <section
      className={`flex h-full flex-col rounded-xl border border-border/60 bg-background-secondary/50 p-3 ${className}`.trim()}
    >
      {hasHeader ? (
        <div className={description ? 'mb-2.5' : 'mb-2'}>
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
      <div className={contentClassName}>{children}</div>
    </section>
  )
}

export default OrderField
