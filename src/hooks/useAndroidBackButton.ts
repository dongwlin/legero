import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useEffect } from 'react'
import router from '@/routes'

type BrowserHistoryState = {
  idx?: number
}

const hasHistoryEntry = (): boolean => {
  const historyState = window.history.state as BrowserHistoryState | null

  return typeof historyState?.idx === 'number' && historyState.idx > 0
}

const canExitAppFromPath = (pathname: string): boolean =>
  pathname === '/' || pathname === '/auth'

const useAndroidBackButton = () => {
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      return
    }

    let removeListener: (() => Promise<void>) | null = null
    let isActive = true

    const registerBackButtonListener = async () => {
      const listener = await CapacitorApp.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack || hasHistoryEntry()) {
          void router.navigate(-1)
          return
        }

        if (!canExitAppFromPath(router.state.location.pathname)) {
          void router.navigate('/', {
            replace: true,
          })
          return
        }

        void CapacitorApp.exitApp()
      })

      if (!isActive) {
        await listener.remove()
        return
      }

      removeListener = () => listener.remove()
    }

    void registerBackButtonListener()

    return () => {
      isActive = false

      if (removeListener) {
        void removeListener()
      }
    }
  }, [])
}

export default useAndroidBackButton
