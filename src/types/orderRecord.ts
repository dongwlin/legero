import type {
  OrderFormValue,
} from './orderForm'
import type {
  StepStatusCode,
} from './codes'

export type OrderRecord = OrderFormValue & {
  id: string
  /**
   * Monotonic version issued by the server. It is the only authority for
   * ordering authoritative states of an order: a higher version is newer,
   * an equal version is the same server state, a lower version is stale.
   * The client never generates or increments it — every authoritative
   * record (snapshot, mutation response, realtime upsert) carries the
   * server's value.
   */
  version: number
  displayNo: string | null
  totalPriceCents: number
  stapleStepStatusCode: StepStatusCode
  meatStepStatusCode: StepStatusCode
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export type OrderStepKey = 'staple' | 'meat'
