import React from 'react'

interface ReportMetricItemProps {
  description?: string
  label: string
  value: React.ReactNode
}

const ReportMetricItem: React.FC<ReportMetricItemProps> = ({
  description,
  label,
  value,
}) => (
  <div className='min-w-0 border-b border-border/50 py-3 last:border-b-0'>
    <dt className='text-sm text-foreground-secondary'>{label}</dt>
    <dd className='mt-1 break-words text-base font-semibold tabular-nums text-foreground'>
      {value}
    </dd>
    {description ? (
      <dd className='mt-1 break-words text-xs leading-5 text-foreground-secondary'>
        {description}
      </dd>
    ) : null}
  </div>
)

export default ReportMetricItem
