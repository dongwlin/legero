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

export type RealtimeRecoveryController = {
  // Resolves once the initial network and app lifecycle state has been
  // captured (or is unreachable). On web the snapshot is read synchronously,
  // so this is already resolved; on native the Capacitor plugin calls are
  // asynchronous, and the realtime channel must defer its first connect until
  // this resolves or a subscription created while offline/backgrounded would
  // still burn an auth/session request before the gate is known.
  ready: Promise<void>
  stop: () => void
}

// Native plugin calls (listener registration plus the initial status reads)
// can in principle never settle on a broken bridge; without a bound the first
// connect would be deferred forever. After this safety window readiness is
// declared with the default (online, foreground) state, and the timer-based
// reconnect machine remains the fallback.
export const NATIVE_READY_TIMEOUT_MS = 5_000

const startWebRecoverySignals = (
  handlers: RealtimeRecoveryHandlers,
): RealtimeRecoveryController => {
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

  // The page may have loaded while the network was already down or the
  // page was already hidden; report the current status so the state machine
  // defers retries until recovery.
  if (!navigator.onLine) {
    handlers.onNetworkOffline()
  }

  if (document.visibilityState !== 'visible') {
    handlers.onAppBackground()
  }

  return {
    // The web initial state was read synchronously above.
    ready: Promise.resolve(),
    stop: () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    },
  }
}

const startNativeRecoverySignals = (
  handlers: RealtimeRecoveryHandlers,
): RealtimeRecoveryController => {
  let removeNetworkListener: (() => Promise<void>) | null = null
  let removeAppListener: (() => Promise<void>) | null = null
  let isActive = true

  let markReady: (() => void) | null = null
  const ready = new Promise<void>((resolve) => {
    markReady = resolve
  })

  const register = async () => {
    try {
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

      // Report the initial network and lifecycle state (the app may start
      // while offline or already backgrounded). Each snapshot is fetched
      // independently: a rejection from one plugin must not prevent the
      // other from being captured.
      const [networkStatus, appState] = await Promise.allSettled([
        Network.getStatus(),
        CapacitorApp.getState(),
      ])

      if (
        isActive &&
        networkStatus.status === 'fulfilled' &&
        !networkStatus.value.connected
      ) {
        handlers.onNetworkOffline()
      }

      if (
        isActive &&
        appState.status === 'fulfilled' &&
        !appState.value.isActive
      ) {
        handlers.onAppBackground()
      }
    } catch {
      // A plugin registration failure (e.g. a broken native bridge) must not
      // surface as an unhandled rejection: the recovery signals stay silent
      // and the timer-based reconnect state machine remains the fallback.
    } finally {
      // The initial snapshot is determined (or unreachable): release the
      // first connect.
      markReady?.()
    }
  }

  void register()

  // Safety net for a hung plugin bridge: a never-settling plugin call would
  // otherwise defer the first connect forever.
  const readinessFallback = window.setTimeout(() => {
    markReady?.()
  }, NATIVE_READY_TIMEOUT_MS)

  return {
    ready,
    stop: () => {
      isActive = false
      window.clearTimeout(readinessFallback)

      if (removeNetworkListener) {
        void removeNetworkListener()
      }

      if (removeAppListener) {
        void removeAppListener()
      }
    },
  }
}

export const startRealtimeRecoverySignals = (
  handlers: RealtimeRecoveryHandlers,
): RealtimeRecoveryController => {
  if (Capacitor.isNativePlatform()) {
    return startNativeRecoverySignals(handlers)
  }

  return startWebRecoverySignals(handlers)
}
