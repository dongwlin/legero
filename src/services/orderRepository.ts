import type {
  Filter,
  OrderFormValue,
  OrderRecord,
  OrderStepKey,
} from '@/types'
import { normalizeOrderFormValue } from './orderFactories'
import { orderRecordToOrderFormValue } from './orderFormAdapter'
import { apiRequest } from './apiClient'
import type {
  ClearWorkspaceMode,
  ClearOrdersResponse,
  OrderItemResponse,
  OrderItemsResponse,
  OrderListResponse,
} from './apiTypes'
import { orderDtoToOrderRecord } from './orderRecordMapper'
import { sortOrdersByTimeline } from './orderSorting'

const PAGE_SIZE = 200

const toFilterStatus = (filter: Filter): 'all' | 'completed' | 'uncompleted' => {
  switch (filter) {
    case 'completed':
      return 'completed'
    case 'uncompleted':
      return 'uncompleted'
    default:
      return 'all'
  }
}

const buildOrderQueryString = (filter: Filter, cursor?: string): string => {
  const params = new URLSearchParams({
    status: toFilterStatus(filter),
    limit: String(PAGE_SIZE),
  })

  if (cursor) {
    params.set('cursor', cursor)
  }

  return params.toString()
}

const listOrders = async (filter: Filter): Promise<OrderRecord[]> => {
  const byId = new Map<string, OrderRecord>()
  let nextCursor: string | null | undefined

  do {
    const response = await apiRequest<OrderListResponse>({
      path: `/api/orders?${buildOrderQueryString(filter, nextCursor ?? undefined)}`,
      auth: true,
    })

    response.items
      .map(orderDtoToOrderRecord)
      .forEach((order) => byId.set(order.id, order))

    nextCursor = response.nextCursor ?? null
  } while (nextCursor)

  return sortOrdersByTimeline([...byId.values()])
}

export const orderRepository = {
  async list(filter: Filter = 'all'): Promise<OrderRecord[]> {
    return listOrders(filter)
  },

  async createMany(
    formValue: OrderFormValue,
    quantity: number,
  ): Promise<OrderRecord[]> {
    if (quantity <= 0) {
      return []
    }

    const response = await apiRequest<OrderItemsResponse>({
      path: '/api/orders',
      method: 'POST',
      auth: true,
      body: {
        quantity,
        form: normalizeOrderFormValue(formValue),
      },
    })

    return sortOrdersByTimeline(response.items.map(orderDtoToOrderRecord))
  },

  async update(id: string, record: OrderRecord): Promise<OrderRecord> {
    const response = await apiRequest<OrderItemResponse>({
      path: `/api/orders/${id}`,
      method: 'PUT',
      auth: true,
      body: {
        form: normalizeOrderFormValue(orderRecordToOrderFormValue(record)),
      },
    })

    return orderDtoToOrderRecord(response.item)
  },

  async toggleStep(id: string, step: OrderStepKey, _record: OrderRecord): Promise<OrderRecord> {
    void _record

    const response = await apiRequest<OrderItemResponse>({
      path: `/api/orders/${id}/actions/toggle-step`,
      method: 'POST',
      auth: true,
      body: {
        step,
      },
    })

    return orderDtoToOrderRecord(response.item)
  },

  async toggleServed(id: string, _record: OrderRecord): Promise<OrderRecord> {
    void _record

    const response = await apiRequest<OrderItemResponse>({
      path: `/api/orders/${id}/actions/toggle-served`,
      method: 'POST',
      auth: true,
      body: {},
    })

    return orderDtoToOrderRecord(response.item)
  },

  async remove(id: string): Promise<void> {
    await apiRequest<void>({
      path: `/api/orders/${id}`,
      method: 'DELETE',
      auth: true,
      responseType: 'none',
    })
  },

  async clearWorkspace(mode: ClearWorkspaceMode = 'all'): Promise<number> {
    const response = await apiRequest<ClearOrdersResponse>({
      path: '/api/orders/actions/clear',
      method: 'POST',
      auth: true,
      body: {
        confirm: true,
        mode,
      },
    })

    return response.clearedCount
  },
}
