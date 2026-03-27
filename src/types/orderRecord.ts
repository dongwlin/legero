import type {
  OrderFormValue,
} from './orderForm'
import type {
  StepStatusCode,
} from './codes'

export type OrderRecord = OrderFormValue & {
  id: string
  displayNo: string | null
  totalPriceCents: number
  stapleStepStatusCode: StepStatusCode
  meatStepStatusCode: StepStatusCode
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export type OrderStepKey = 'staple' | 'meat'
