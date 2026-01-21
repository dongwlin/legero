import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

interface OrderSettingsState {
  // 等待时间阈值(分钟),超过此时间后时间显示为红色
  waitTimeThresholdMinutes: number
  setWaitTimeThresholdMinutes: (minutes: number) => void
}

export const useOrderSettingsStore = create<OrderSettingsState>()(
  persist(
    (set) => ({
      waitTimeThresholdMinutes: 10, // 默认10分钟
      setWaitTimeThresholdMinutes: (minutes) => set({ waitTimeThresholdMinutes: minutes }),
    }),
    {
      name: "order-settings-storage",
      storage: createJSONStorage(() => localStorage),
    }
  )
)
