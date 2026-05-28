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

type HydrationStateInput = {
  status: OrderStoreStatus
  errorMessage?: string | null
}

interface OrderState {
  orders: OrderRecord[]
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
      orders: [],
      filter: 'all',
      updateTargetID: '',
      isQuickCalcMode: false,
      quickCalcSelectedOrderIds: EMPTY_QUICK_CALC_SELECTION,
      lastHydratedAt: null,
      status: 'idle',
      errorMessage: null,
      setOrders: (orders) =>
        set((state) => {
          const nextOrders = sortOrdersByTimeline(orders)
          const nextSelectedOrderIds = pruneQuickCalcIds(
            state.quickCalcSelectedOrderIds,
            nextOrders.map((order) => order.id),
          )

          return {
            orders: nextOrders,
            lastHydratedAt: new Date().toISOString(),
            status: 'ready' as const,
            errorMessage: null,
            ...createQuickCalcState(nextSelectedOrderIds),
          }
        }),
      upsertOrder: (item) =>
        set((state) => {
          const existingIndex = state.orders.findIndex((order) => order.id === item.id)

          if (existingIndex === -1) {
            return {
              orders: sortOrdersByTimeline([...state.orders, item]),
              lastHydratedAt: new Date().toISOString(),
              status: 'ready' as const,
              errorMessage: null,
            }
          }

          const current = state.orders[existingIndex]
          const nextOrders = [...state.orders]
          nextOrders[existingIndex] = item

          return {
            orders: hasSameTimelinePosition(current, item)
              ? nextOrders
              : sortOrdersByTimeline(nextOrders),
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

          const byId = new Map(state.orders.map((order) => [order.id, order]))

          items.forEach((item) => {
            byId.set(item.id, item)
          })

          return {
            orders: sortOrdersByTimeline([...byId.values()]),
            lastHydratedAt: new Date().toISOString(),
            status: 'ready' as const,
            errorMessage: null,
          }
        }),
      removeOrder: (id) =>
                set((state) => {
                  const nextOrders = state.orders.filter((item) => item.id !== id)
                  const nextSelectedOrderIds = state.quickCalcSelectedOrderIds.filter(
                    (orderId) => orderId !== id,
                  )

                  return {
                    orders: nextOrders,
                    lastHydratedAt: new Date().toISOString(),
                    status: 'ready' as const,
                    errorMessage: null,
                    ...createQuickCalcState(nextSelectedOrderIds),
                  }
                }),
      clearOrders: () =>
        set({
          orders: [],
          lastHydratedAt: new Date().toISOString(),
          status: 'ready',
          errorMessage: null,
          updateTargetID: '',
                  ...createQuickCalcState(EMPTY_QUICK_CALC_SELECTION),
        }),
      resetSyncState: () =>
        set({
          orders: [],
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
        const order = get().orders.find((item) => item.id === id)

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
