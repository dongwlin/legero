import { create } from 'zustand'
import { Filter, type OrderRecord } from '@/types'
import dayjs from 'dayjs'
import { persist, createJSONStorage } from 'zustand/middleware'

const ORDER_STORE_SCHEMA_VERSION = 2 as const

export type PersistedOrderStoreV2 = {
  schemaVersion: typeof ORDER_STORE_SCHEMA_VERSION
  lastDisplayNoSeq: number
  lastDisplayNoDate: string | null
  updatedAt: string | null
  orders: OrderRecord[]
  filter: Filter
}

interface OrderState extends PersistedOrderStoreV2 {
  genDisplayNo: () => string
  addOrder: (item: OrderRecord) => void
  removeOrder: (id: string) => void
  updateOrder: (id: string, item: OrderRecord) => void
  clearOrders: () => void

  setFilter: (filter: Filter) => void

  updateTargetID: string
  setUpdateTargetID: (id: string) => void
  findOrder: (id: string) => OrderRecord
}

export const useOrderStore = create<OrderState>()(
  persist(
    (set, get) => ({
      schemaVersion: ORDER_STORE_SCHEMA_VERSION,
      lastDisplayNoSeq: 0,
      lastDisplayNoDate: null,
      updatedAt: null,
      genDisplayNo: (): string => {
        const now = dayjs()
        const state = get()

        const lastDisplayNoDate = state.lastDisplayNoDate
          ? dayjs(state.lastDisplayNoDate)
          : null
        const isSameDay = lastDisplayNoDate
          ? lastDisplayNoDate.isSame(now, 'date')
          : false

        const shouldReset = !state.lastDisplayNoDate || !isSameDay
        const baseSeq = shouldReset ? 0 : state.lastDisplayNoSeq

        const nextSeq = baseSeq + 1
        const nextSeqText = nextSeq.toString().padStart(4, '0')
        const displayNo = `${now.format('YYYYMMDD')}${nextSeqText}`

        set({
          lastDisplayNoSeq: nextSeq,
          lastDisplayNoDate: now.toISOString(),
        })

        return displayNo
      },
      orders: [],
      filter: 'all',
      addOrder: (item) =>
        set((state) => ({
          orders: [...state.orders, item],
          updatedAt: dayjs().toISOString(),
        })),
      removeOrder: (id) =>
        set((state) => ({
          orders: state.orders.filter((item) => item.id !== id),
          updatedAt: dayjs().toISOString(),
        })),
      updateOrder: (id: string, newItem: OrderRecord) =>
        set((state) => {
          const now = dayjs()

          const updatedOrders = state.orders.map((item) => {
            if (item.id === id) {
              return {
                ...newItem,
                id: item.id,
              }
            }
            return item
          })

          return {
            orders: updatedOrders,
            updatedAt: now.toISOString(),
          }
        }),
      clearOrders: () =>
        set({
          orders: [],
          updatedAt: dayjs().toISOString(),
          lastDisplayNoSeq: 0,
          lastDisplayNoDate: null,
        }),
      setFilter: (filter) => set({ filter }),
      updateTargetID: '',
      setUpdateTargetID: (id) => set({ updateTargetID: id }),
      findOrder: (id: string): OrderRecord => {
        const order = useOrderStore
          .getState()
          .orders.find((item) => item.id === id)
        if (!order) {
          throw new Error('Order not found')
        }
        return order
      },
    }),
    {
      name: 'order-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state): PersistedOrderStoreV2 => ({
        schemaVersion: state.schemaVersion,
        lastDisplayNoSeq: state.lastDisplayNoSeq,
        lastDisplayNoDate: state.lastDisplayNoDate,
        updatedAt: state.updatedAt,
        orders: state.orders,
        filter: state.filter,
      }),
    },
  ),
)
