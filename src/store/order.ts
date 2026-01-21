import { create } from 'zustand'
import { Filter, OrderItem } from '@/types'
import dayjs from 'dayjs'
import { persist, createJSONStorage } from 'zustand/middleware'

interface OrderState {
  lastIDNum: number
  lastGenDate: string | null
  genID: () => string
  updatedAt: string | null
  orders: OrderItem[]
  filter: Filter
  addOrder: (item: OrderItem) => void
  removeOrder: (id: string) => void
  updateOrder: (id: string, item: OrderItem) => void
  clearOrders: () => void

  setFilter: (filter: Filter) => void

  updateTargetID: string
  setUpdateTargetID: (id: string) => void
  findOrder: (id: string) => OrderItem
}

export const useOrderStore = create<OrderState>()(
  persist(
    (set, get) => ({
      lastIDNum: 0,
      lastGenDate: null,
      updatedAt: null,
      genID: (): string => {
        const now = dayjs()
        const state = get()

        const lastGenDate = state.lastGenDate ? dayjs(state.lastGenDate) : null
        const isSameDay = lastGenDate ? lastGenDate.isSame(now, 'date') : false

        const shouldReset = !state.lastGenDate || !isSameDay
        const baseNum = shouldReset ? 0 : state.lastIDNum

        const idNum = baseNum + 1
        const idNumStr = idNum.toString().padStart(4, '0')
        const id = `${now.format('YYYYMMDD')}${idNumStr}`

        set({
          lastIDNum: idNum,
          lastGenDate: now.toISOString(),
        })

        return id
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
      updateOrder: (id: string, newItem: OrderItem) =>
        set((state) => {
          const now = dayjs()

          const updatedOrders = state.orders.map((item) => {
            if (item.id === id) {
              return {
                ...item,
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
          lastIDNum: 0,
          lastGenDate: null,
        }),
      setFilter: (filter) => set({ filter }),
      updateTargetID: '',
      setUpdateTargetID: (id) => set({ updateTargetID: id }),
      findOrder: (id: string): OrderItem => {
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
    },
  ),
)
