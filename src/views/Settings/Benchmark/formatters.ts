import type { OrderBenchmarkAction } from '@/services/orderBenchmark'

export const benchmarkActions: OrderBenchmarkAction[] = ['meat', 'staple', 'served']

export const benchmarkActionLabel: Record<OrderBenchmarkAction, string> = {
  meat: '肉',
  staple: '主食',
  served: '出餐',
}

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
