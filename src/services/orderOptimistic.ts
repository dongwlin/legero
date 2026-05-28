import type { OrderRecord } from '@/types'

type PendingMutation = {
  generation: number
  snapshot: OrderRecord
}

const pendingMutations = new Map<string, PendingMutation>()

export const orderOptimistic = {
  beginMutation(orderId: string, snapshot: OrderRecord): number {
    const existing = pendingMutations.get(orderId)
    const generation = (existing?.generation ?? 0) + 1

    pendingMutations.set(orderId, { generation, snapshot })

    return generation
  },

  endMutation(orderId: string, generation: number): boolean {
    const existing = pendingMutations.get(orderId)

    if (!existing || existing.generation !== generation) {
      return false
    }

    pendingMutations.delete(orderId)

    return true
  },

  hasPending(orderId: string): boolean {
    return pendingMutations.has(orderId)
  },
}
