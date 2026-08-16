import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { Network } from '@capacitor/network'

// Recovery signals for the realtime channel. On native platforms (Capacitor)
// the OS-level Network plugin and App lifecycle events are the source of
// truth; in a plain browser the window online/offline events and
// visibilitychange provide the same signals. Feeding both through one entry
// point lets the realtime state machine treat recovery uniformly.
export type RealtimeRecoveryHandlers = {
  onNetworkOffline: () => void
  onNetworkOnline: () => void
  onAppBackground: () => void
  onAppForeground: () => void
}

const startWebRecoverySignals = (
  handlers: RealtimeRecoveryHandlers,
): (() => void) => {
  const handleOnline = () => {
    handlers.onNetworkOnline()
  }

  const handleOffline = () => {
    handlers.onNetworkOffline()
  }

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      handlers.onAppForeground()
    } else {
      handlers.onAppBackground()
    }
  }

  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)
  document.addEventListener('visibilitychange', handleVisibilityChange)

  // The page may have loaded while the network was already down; report the
  // current status so the state machine defers retries until recovery.
  if (!navigator.onLine) {
    handlers.onNetworkOffline()
  }

  return () => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }
}

const startNativeRecoverySignals = (
  handlers: RealtimeRecoveryHandlers,
): (() => void) => {
  let removeNetworkListener: (() => Promise<void>) | null = null
  let removeAppListener: (() => Promise<void>) | null = null
  let isActive = true

  const register = async () => {
    const networkListener = await Network.addListener(
      'networkStatusChange',
      (status) => {
        if (status.connected) {
          handlers.onNetworkOnline()
        } else {
          handlers.onNetworkOffline()
        }
      },
    )

    if (!isActive) {
      await networkListener.remove()
      return
    }

    removeNetworkListener = () => networkListener.remove()

    const appListener = await CapacitorApp.addListener(
      'appStateChange',
      ({ isActive: appIsActive }) => {
        if (appIsActive) {
          handlers.onAppForeground()
        } else {
          handlers.onAppBackground()
        }
      },
    )

    if (!isActive) {
      await appListener.remove()
      return
    }

    removeAppListener = () => appListener.remove()

    // Report the initial network state (the app may start while offline).
    const status = await Network.getStatus()

    if (isActive && !status.connected) {
      handlers.onNetworkOffline()
    }
  }

  void register()

  return () => {
    isActive = false

    if (removeNetworkListener) {
      void removeNetworkListener()
    }

    if (removeAppListener) {
      void removeAppListener()
    }
  }
}

export const startRealtimeRecoverySignals = (
  handlers: RealtimeRecoveryHandlers,
): (() => void) => {
  if (Capacitor.isNativePlatform()) {
    return startNativeRecoverySignals(handlers)
  }

  return startWebRecoverySignals(handlers)
}
