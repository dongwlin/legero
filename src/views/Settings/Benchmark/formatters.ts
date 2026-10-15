import {
  OrderBenchmarkError,
  type OrderBenchmarkAction,
  type OrderBenchmarkErrorCode,
} from '@/services/orderBenchmark'

export type OrderBenchmarkFailureCode = OrderBenchmarkErrorCode | 'UNEXPECTED_FAILURE'

export type OrderBenchmarkFailure = {
  code: OrderBenchmarkFailureCode
  occurredAt: string
}

export const benchmarkActions: OrderBenchmarkAction[] = ['meat', 'staple', 'served']

export const benchmarkActionLabel: Record<OrderBenchmarkAction, string> = {
  meat: '肉',
  staple: '主食',
  served: '出餐',
}

export const benchmarkFailureLabel: Record<OrderBenchmarkFailureCode, string> = {
  INVALID_FIXTURE: '模拟订单数据校验失败',
  INVALID_ACTION_TARGET: '模拟订单操作校验失败',
  INVALID_TRIAL_COUNT: '测试轮次数量不正确',
  INVALID_TIMING: '测试耗时结果无效',
  UNEXPECTED_FAILURE: '设备运行时发生错误',
}

export const getBenchmarkFailureCode = (error: unknown): OrderBenchmarkFailureCode =>
  error instanceof OrderBenchmarkError ? error.code : 'UNEXPECTED_FAILURE'

export const formatBenchmarkFailureReport = (failure: OrderBenchmarkFailure): string =>
  JSON.stringify({
    schemaVersion: 1,
    kind: 'order-benchmark-failure',
    ...failure,
  }, null, 2)

export const formatBenchmarkMs = (value: number): string => `${value.toFixed(2)} ms`

export const copyBenchmarkText = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // HTTP pages and some Android WebViews require the legacy copy path.
  }

  if (typeof document.execCommand !== 'function') {
    return false
  }

  const textArea = document.createElement('textarea')
  textArea.value = text
  textArea.setAttribute('readonly', '')
  textArea.style.position = 'fixed'
  textArea.style.opacity = '0'
  document.body.appendChild(textArea)

  try {
    textArea.focus()
    textArea.select()
    textArea.setSelectionRange(0, textArea.value.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    textArea.remove()
  }
}
