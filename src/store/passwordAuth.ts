import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface PasswordAuthState {
  enabled: boolean;
  isAuthenticated: boolean;
  authenticate: () => void;
  reset: () => void;
  toggleEnabled: () => void;
}

export const usePasswordAuthStore = create<PasswordAuthState>()(
  persist(
    (set) => ({
      enabled: true,
      isAuthenticated: false,
      authenticate: () => set({ isAuthenticated: true }),
      reset: () => set({ isAuthenticated: false }),
      toggleEnabled: () => set((state) => ({ enabled: !state.enabled, isAuthenticated: false })),
    }),
    {
      name: 'password-auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ enabled: state.enabled }),
    }
  )
);
