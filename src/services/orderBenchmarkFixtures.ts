import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { DEFAULT_ORDER_FORM_VALUE, STEP_STATUS, type OrderRecord } from '@/types'
import type { OrderBenchmarkProfile } from '@/services/orderBenchmarkTypes'

dayjs.extend(utc)
dayjs.extend(timezone)

export const ORDER_BENCHMARK_REFERENCE_TIME = '2026-10-15T12:00:00+08:00'
export const ORDER_BENCHMARK_FIXTURES: Record<OrderBenchmarkProfile, { totalOrders: number; todayOrders: number }[]> = {
  default: [130, 520, 1820].map((totalOrders) => ({ totalOrders, todayOrders: 130 })),
  history: [10000, 50000].map((totalOrders) => ({ totalOrders, todayOrders: 130 })),
  today: [130, 260, 520].map((todayOrders) => ({ totalOrders: 1820, todayOrders })),
  batch: [{ totalOrders: 1820, todayOrders: 130 }],
}

export const throwIfBenchmarkAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) throw new DOMException('Benchmark cancelled', 'AbortError')
}
export const yieldBenchmark = async (signal?: AbortSignal): Promise<void> => {
  throwIfBenchmarkAborted(signal)
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  throwIfBenchmarkAborted(signal)
}

export const makeBenchmarkOrders = async (
  total: number,
  todayOrders: number,
  signal?: AbortSignal,
): Promise<OrderRecord[]> => {
  const start = dayjs(ORDER_BENCHMARK_REFERENCE_TIME).tz('Asia/Shanghai').startOf('day').add(9, 'hour')
  const orders: OrderRecord[] = []
  for (let index = 0; index < total; index += 1) {
    if (index % 130 === 0) await yieldBenchmark(signal)
    const daysAgo = index < todayOrders ? 0 : Math.floor((index - todayOrders) / 130) + 1
    const dailyIndex = index < todayOrders ? index : (index - todayOrders) % 130
    const createdAt = start.subtract(daysAgo, 'day').add(dailyIndex, 'minute').toISOString()
    const completed = index % 3 === 0
    orders.push({
      ...DEFAULT_ORDER_FORM_VALUE,
      selectedMeatCodes: [...DEFAULT_ORDER_FORM_VALUE.selectedMeatCodes],
      id: `benchmark-order-${String(index).padStart(6, '0')}`,
      displayNo: String(dailyIndex + 1).padStart(4, '0'),
      version: 1,
      totalPriceCents: 1000,
      stapleStepStatusCode: completed || index === 4 ? STEP_STATUS.completed : STEP_STATUS.notStarted,
      meatStepStatusCode: completed || index === 4 ? STEP_STATUS.completed : STEP_STATUS.notStarted,
      createdAt,
      updatedAt: createdAt,
      completedAt: completed ? createdAt : null,
    })
  }
  return orders
}
