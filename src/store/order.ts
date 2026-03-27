import { create } from 'zustand'
import { Filter, type OrderRecord } from '@/types'

export type OrderStoreStatus = 'idle' | 'loading' | 'ready' | 'error'

type HydrationStateInput = {
  status: OrderStoreStatus
  errorMessage?: string | null
}

interface OrderState {
  orders: OrderRecord[]
  filter: Filter
  updateTargetID: string
  lastHydratedAt: string | null
  status: OrderStoreStatus
  errorMessage: string | null
  setOrders: (orders: OrderRecord[]) => void
  upsertOrder: (item: OrderRecord) => void
  removeOrder: (id: string) => void
  clearOrders: () => void
  resetSyncState: () => void
  setFilter: (filter: Filter) => void
  setUpdateTargetID: (id: string) => void
  setHydrationState: (input: HydrationStateInput) => void
  findOrder: (id: string) => OrderRecord
}

const sortOrdersByCreatedAt = (orders: OrderRecord[]): OrderRecord[] =>
  [...orders].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  )

export const useOrderStore = create<OrderState>()((set, get) => ({
  orders: [],
  filter: 'all',
  updateTargetID: '',
  lastHydratedAt: null,
  status: 'idle',
  errorMessage: null,
  setOrders: (orders) =>
    set({
      orders: sortOrdersByCreatedAt(orders),
      lastHydratedAt: new Date().toISOString(),
      status: 'ready',
      errorMessage: null,
    }),
  upsertOrder: (item) =>
    set((state) => {
      const existingIndex = state.orders.findIndex((order) => order.id === item.id)

      if (existingIndex === -1) {
        return {
          orders: sortOrdersByCreatedAt([...state.orders, item]),
          lastHydratedAt: new Date().toISOString(),
          status: 'ready' as const,
          errorMessage: null,
        }
      }

      const nextOrders = state.orders.map((order) =>
        order.id === item.id ? item : order,
      )

      return {
        orders: sortOrdersByCreatedAt(nextOrders),
        lastHydratedAt: new Date().toISOString(),
        status: 'ready' as const,
        errorMessage: null,
      }
    }),
  removeOrder: (id) =>
    set((state) => ({
      orders: state.orders.filter((item) => item.id !== id),
      lastHydratedAt: new Date().toISOString(),
      status: 'ready',
      errorMessage: null,
    })),
  clearOrders: () =>
    set({
      orders: [],
      lastHydratedAt: new Date().toISOString(),
      status: 'ready',
      errorMessage: null,
      updateTargetID: '',
    }),
  resetSyncState: () =>
    set({
      orders: [],
      lastHydratedAt: null,
      status: 'idle',
      errorMessage: null,
      updateTargetID: '',
    }),
  setFilter: (filter) => set({ filter }),
  setUpdateTargetID: (id) => set({ updateTargetID: id }),
  setHydrationState: ({ status, errorMessage = null }) =>
    set(() => ({
      status,
      errorMessage,
    })),
  findOrder: (id: string): OrderRecord => {
    const order = get().orders.find((item) => item.id === id)

    if (!order) {
      throw new Error('Order not found')
    }

    return order
  },
}))
