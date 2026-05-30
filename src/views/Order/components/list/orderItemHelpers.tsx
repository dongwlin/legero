import React from 'react'
import { STEP_STATUS, type StepStatusCode } from '@/types'

export const QUICK_CALC_DOUBLE_TAP_THRESHOLD_MS = 280

export const isQuickCalcIgnoredTarget = (target: EventTarget | null): boolean =>
  target instanceof Element &&
  target.closest('[data-quick-calc-ignore="true"]') !== null

export const getStepButtonProps = (stepStatusCode: StepStatusCode) => {
  switch (stepStatusCode) {
    case STEP_STATUS.notStarted:
      return {
        className:
          'border-border/60 text-foreground hover:bg-background-secondary',
        variant: 'outline' as const,
      }
    case STEP_STATUS.completed:
      return {
        className:
          'border-success/40 bg-success/24 text-success hover:bg-success/18',
        variant: 'secondary' as const,
      }
    default:
      return {
        className:
          'border-border/60 text-foreground hover:bg-background-secondary',
        variant: 'outline' as const,
      }
  }
}

export const getServeMealButtonProps = ({
  completedAt,
  isDisabled,
}: {
  completedAt: string | null
  isDisabled: boolean
}) => {
  if (isDisabled) {
    return {
      className:
        'rounded-2xl border-dashed border-border/80 bg-background-secondary/80 font-bold text-muted shadow-none',
      variant: 'outline' as const,
    }
  }

  if (!completedAt) {
    return {
      className: 'rounded-2xl font-bold',
      variant: 'primary' as const,
    }
  }

  return {
    className:
      'rounded-2xl border-success/40 bg-success/12 font-bold text-success hover:bg-success/18',
    variant: 'secondary' as const,
  }
}

export const renderHighlightedForbiddenText = (
  text: string,
): React.ReactNode => {
  if (!text.includes('不要')) {
    return text
  }

  return text.split('不要').map((part, index) => (
    <React.Fragment key={`${part}-${index}`}>
      {index > 0 && (
        <span className='mx-0.5 inline-block rounded bg-red-100 px-1 text-red-700'>
          不要
        </span>
      )}
      {part}
    </React.Fragment>
  ))
}

export const getMutationErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '订单同步失败，请稍后重试。'
