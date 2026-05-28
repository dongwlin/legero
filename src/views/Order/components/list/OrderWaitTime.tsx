import React from 'react'
import { useNow } from './NowContext'

const SEVERE_TIMEOUT_SECONDS = 60 * 60

type OrderWaitTimeProps = {
  createdAt: string
  completedAt: string | null
  waitTimeThresholdMinutes: number
}

const formatWaitTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

const OrderWaitTime: React.FC<OrderWaitTimeProps> = ({
  createdAt,
  completedAt,
  waitTimeThresholdMinutes,
}) => {
  const now = useNow()

  if (completedAt !== null) {
    return null
  }

  const waitTime = Math.floor(
    (now - new Date(createdAt).getTime()) / 1000,
  )

  if (waitTime >= SEVERE_TIMEOUT_SECONDS) {
    return (
      <span className='inline-flex items-center gap-2 whitespace-nowrap'>
        <span
          aria-hidden='true'
          className='inline-block h-[1em] w-px shrink-0 rounded-full bg-current opacity-60'
        />
        <span className='font-mono tabular-nums text-danger'>--:--</span>
      </span>
    )
  }

  const isOverThreshold =
    waitTimeThresholdMinutes > 0 &&
    waitTime / 60 >= waitTimeThresholdMinutes

  return (
    <span className='inline-flex items-center gap-2 whitespace-nowrap'>
      <span
        aria-hidden='true'
        className='inline-block h-[1em] w-px shrink-0 rounded-full bg-current opacity-60'
      />
      <span
        className={`font-mono tabular-nums ${isOverThreshold ? 'text-danger' : 'text-warning'}`}
      >
        {formatWaitTime(waitTime)}
      </span>
    </span>
  )
}

export default React.memo(OrderWaitTime)
