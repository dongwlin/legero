import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { Filter, type OrderRecord } from '@/types'
import {
  compareOrderRecordsByTimeline,
  sortOrdersByTimeline,
} from '@/services/orderSorting'

export type OrderStoreStatus = 'idle' | 'loading' | 'ready' | 'error'

const EMPTY_QUICK_CALC_SELECTION: string[] = []

const pruneQuickCalcIds = (
  selectedOrderIds: string[],
  availableOrderIds: Iterable<string>,
): string[] => {
  const availableOrderIdSet = new Set(availableOrderIds)

  return selectedOrderIds.filter((orderId) => availableOrderIdSet.has(orderId))
}

const createQuickCalcState = (selectedOrderIds: string[]) => ({
  isQuickCalcMode: selectedOrderIds.length > 0,
  quickCalcSelectedOrderIds: selectedOrderIds,
})

const hasSameTimelinePosition = (
  current: OrderRecord,
  next: OrderRecord,
): boolean => compareOrderRecordsByTimeline(current, next) === 0

const insertSorted = (
  ids: string[],
  newOrder: OrderRecord,
  ordersById: Record<string, OrderRecord>,
): string[] => {
  let low = 0
  let high = ids.length

  while (low < high) {
    const mid = (low + high) >>> 1

    if (compareOrderRecordsByTimeline(ordersById[ids[mid]], newOrder) < 0) {
      low = mid + 1
    } else {
      high = mid
    }
  }

  const next = [...ids]
  next.splice(low, 0, newOrder.id)

  return next
}

const buildOrdersById = (
  orders: OrderRecord[],
): Record<string, OrderRecord> => {
  const result: Record<string, OrderRecord> = {}

  for (const order of orders) {
    result[order.id] = order
  }

  return result
}

type HydrationStateInput = {
  status: OrderStoreStatus
  errorMessage?: string | null
}

interface OrderState {
  ordersById: Record<string, OrderRecord>
  orderDisplayIds: string[]
  filter: Filter
  updateTargetID: string
  isQuickCalcMode: boolean
  quickCalcSelectedOrderIds: string[]
  lastHydratedAt: string | null
  status: OrderStoreStatus
  errorMessage: string | null
  setOrders: (orders: OrderRecord[]) => void
  upsertOrder: (item: OrderRecord) => void
  upsertOrders: (items: OrderRecord[]) => void
  removeOrder: (id: string) => void
  clearOrders: () => void
  resetSyncState: () => void
  setFilter: (filter: Filter) => void
  setUpdateTargetID: (id: string) => void
  enterQuickCalcWith: (id: string) => void
  toggleQuickCalcSelection: (id: string) => void
  exitQuickCalc: () => void
  pruneQuickCalcSelection: (availableOrderIds: Iterable<string>) => void
  setHydrationState: (input: HydrationStateInput) => void
  findOrder: (id: string) => OrderRecord
}

export const useOrderStore = create<OrderState>()(
  persist(
    (set, get) => ({
      ordersById: {},
      orderDisplayIds: [],
      filter: 'all',
      updateTargetID: '',
      isQuickCalcMode: false,
      quickCalcSelectedOrderIds: EMPTY_QUICK_CALC_SELECTION,
      lastHydratedAt: null,
      status: 'idle',
      errorMessage: null,
      setOrders: (orders) =>
        set((state) => {
          const sorted = sortOrdersByTimeline(orders)
          const nextSelectedOrderIds = pruneQuickCalcIds(
            state.quickCalcSelectedOrderIds,
            sorted.map((order) => order.id),
          )

          return {
            ordersById: buildOrdersById(sorted),
            orderDisplayIds: sorted.map((order) => order.id),
            lastHydratedAt: new Date().toISOString(),
            status: 'ready' as const,
            errorMessage: null,
            ...createQuickCalcState(nextSelectedOrderIds),
          }
        }),
      upsertOrder: (item) =>
        set((state) => {
          const existing = state.ordersById[item.id]
          const newOrdersById = { ...state.ordersById, [item.id]: item }

          if (!existing) {
            return {
              ordersById: newOrdersById,
              orderDisplayIds: insertSorted(state.orderDisplayIds, item, newOrdersById),
              lastHydratedAt: new Date().toISOString(),
              status: 'ready' as const,
              errorMessage: null,
            }
          }

          if (hasSameTimelinePosition(existing, item)) {
            return {
              ordersById: newOrdersById,
              lastHydratedAt: new Date().toISOString(),
              status: 'ready' as const,
              errorMessage: null,
            }
          }

          const newOrderDisplayIds = [...state.orderDisplayIds].sort(
            (a, b) => compareOrderRecordsByTimeline(newOrdersById[a], newOrdersById[b]),
          )

          return {
            ordersById: newOrdersById,
            orderDisplayIds: newOrderDisplayIds,
            lastHydratedAt: new Date().toISOString(),
            status: 'ready' as const,
            errorMessage: null,
          }
        }),
      upsertOrders: (items) =>
        set((state) => {
          if (items.length === 0) {
            return state
          }

          const newOrdersById = { ...state.ordersById }

          for (const item of items) {
            newOrdersById[item.id] = item
          }

          const newOrderDisplayIds = sortOrdersByTimeline(
            Object.values(newOrdersById),
          ).map((order) => order.id)

          return {
            ordersById: newOrdersById,
            orderDisplayIds: newOrderDisplayIds,
            lastHydratedAt: new Date().toISOString(),
            status: 'ready' as const,
            errorMessage: null,
          }
        }),
      removeOrder: (id) =>
        set((state) => {
          const newOrdersById = { ...state.ordersById }
          delete newOrdersById[id]
          const nextSelectedOrderIds = state.quickCalcSelectedOrderIds.filter(
            (orderId) => orderId !== id,
          )

          return {
            ordersById: newOrdersById,
            orderDisplayIds: state.orderDisplayIds.filter((orderId) => orderId !== id),
            lastHydratedAt: new Date().toISOString(),
            status: 'ready' as const,
            errorMessage: null,
            ...createQuickCalcState(nextSelectedOrderIds),
          }
        }),
      clearOrders: () =>
        set({
          ordersById: {},
          orderDisplayIds: [],
          lastHydratedAt: new Date().toISOString(),
          status: 'ready',
          errorMessage: null,
          updateTargetID: '',
          ...createQuickCalcState(EMPTY_QUICK_CALC_SELECTION),
        }),
      resetSyncState: () =>
        set({
          ordersById: {},
          orderDisplayIds: [],
          lastHydratedAt: null,
          status: 'idle',
          errorMessage: null,
          updateTargetID: '',
          ...createQuickCalcState(EMPTY_QUICK_CALC_SELECTION),
        }),
      setFilter: (filter) => set({ filter }),
      setUpdateTargetID: (id) => set({ updateTargetID: id }),
      enterQuickCalcWith: (id) =>
        set({
          ...createQuickCalcState([id]),
        }),
      toggleQuickCalcSelection: (id) =>
        set((state) => {
          const hasSelectedOrder = state.quickCalcSelectedOrderIds.includes(id)
          const nextSelectedOrderIds = hasSelectedOrder
            ? state.quickCalcSelectedOrderIds.filter((orderId) => orderId !== id)
            : [...state.quickCalcSelectedOrderIds, id]

          return createQuickCalcState(nextSelectedOrderIds)
        }),
      exitQuickCalc: () =>
        set({
          ...createQuickCalcState(EMPTY_QUICK_CALC_SELECTION),
        }),
      pruneQuickCalcSelection: (availableOrderIds) =>
        set((state) => {
          const nextSelectedOrderIds = pruneQuickCalcIds(
            state.quickCalcSelectedOrderIds,
            availableOrderIds,
          )

          if (
            nextSelectedOrderIds.length === state.quickCalcSelectedOrderIds.length &&
            nextSelectedOrderIds.every(
              (orderId, index) => orderId === state.quickCalcSelectedOrderIds[index],
            )
          ) {
            return state
          }

          return createQuickCalcState(nextSelectedOrderIds)
        }),
      setHydrationState: ({ status, errorMessage = null }) =>
        set(() => ({
          status,
          errorMessage,
        })),
      findOrder: (id: string): OrderRecord => {
        const order = get().ordersById[id]

        if (!order) {
          throw new Error('Order not found')
        }

        return order
      },
    }),
    {
      name: 'order-store-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        filter: state.filter,
      }),
    },
  ),
)
