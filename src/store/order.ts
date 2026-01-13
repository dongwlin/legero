import { create } from "zustand"
import { Filter, OrderItem } from "@/types"
import dayjs from "dayjs"
import { persist, createJSONStorage } from "zustand/middleware"

interface OrderState {
  lastIDNum: number
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
    (set) => ({
      lastIDNum: 0,
      updatedAt: null,
      genID: (): string => {
        const now = dayjs()
        let idNum: number

        set((state) => {
          const updatedAt = state.updatedAt ? dayjs(state.updatedAt) : null
          const isSameDay = updatedAt ? updatedAt?.isSame(now, "date") : false

          const shouldReset = !state.updatedAt || !isSameDay
          const baseNum = shouldReset ? 0 : state.lastIDNum

          idNum = baseNum + 1
          return { lastIDNum: idNum }
        })

        const idNumStr = idNum!.toString().padStart(4, "0")
        const id = `${now.format("YYYYMMDD")}${idNumStr}`
        return id
      },
      orders: [],
      filter: "all",
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
        }),
      setFilter: (filter) => set({ filter }),
      updateTargetID: "",
      setUpdateTargetID: (id) => set({ updateTargetID: id }),
      findOrder: (id: string): OrderItem => {
        const order = useOrderStore
          .getState()
          .orders.find((item) => item.id === id)
        if (!order) {
          throw new Error("Order not found")
        }
        return order
      },
    }),
    {
      name: "order-store",
      storage: createJSONStorage(() => localStorage),
    }
  )
)
