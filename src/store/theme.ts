import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

export type Theme = "light" | "dark" | "system"

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
  getEffectiveTheme: () => "light" | "dark"
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: "system",
      setTheme: (theme) => set({ theme }),
      getEffectiveTheme: () => {
        const { theme } = get()
        if (theme !== "system") {
          return theme
        }
        // 检测系统主题
        if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
          return "dark"
        }
        return "light"
      },
    }),
    {
      name: "theme-storage",
      storage: createJSONStorage(() => localStorage),
    }
  )
)
