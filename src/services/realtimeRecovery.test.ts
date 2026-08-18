/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NATIVE_READY_TIMEOUT_MS, startRealtimeRecoverySignals } from './realtimeRecovery'
import type { RealtimeRecoveryHandlers } from './realtimeRecovery'

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  networkAddListener: vi.fn(),
  networkGetStatus: vi.fn(),
  appAddListener: vi.fn(),
  appGetState: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mocks.isNativePlatform },
}))

vi.mock('@capacitor/network', () => ({
  Network: {
    addListener: mocks.networkAddListener,
    getStatus: mocks.networkGetStatus,
  },
}))

vi.mock('@capacitor/app', () => ({
  App: { addListener: mocks.appAddListener, getState: mocks.appGetState },
}))

const makeHandlers = (): RealtimeRecoveryHandlers => ({
  onNetworkOffline: vi.fn(),
  onNetworkOnline: vi.fn(),
  onNetworkType: vi.fn(),
  onAppBackground: vi.fn(),
  onAppForeground: vi.fn(),
})

const flushAsync = async () => {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve()
  }
}

describe('realtimeRecovery (web fallback)', () => {
  beforeEach(() => {
    mocks.isNativePlatform.mockReset().mockReturnValue(false)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('wires window online/offline events and stops on cleanup', () => {
    const handlers = makeHandlers()
    const controller = startRealtimeRecoverySignals(handlers)

    window.dispatchEvent(new Event('offline'))
    expect(handlers.onNetworkOffline).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new Event('online'))
    expect(handlers.onNetworkOnline).toHaveBeenCalledTimes(1)

    controller.stop()
    window.dispatchEvent(new Event('offline'))
    window.dispatchEvent(new Event('online'))
    expect(handlers.onNetworkOffline).toHaveBeenCalledTimes(1)
    expect(handlers.onNetworkOnline).toHaveBeenCalledTimes(1)
  })

  it('maps visibilitychange to app background and foreground', () => {
    const handlers = makeHandlers()
    const controller = startRealtimeRecoverySignals(handlers)

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(handlers.onAppBackground).toHaveBeenCalledTimes(1)

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(handlers.onAppForeground).toHaveBeenCalledTimes(1)

    controller.stop()
  })

  it('reports the initial network state when the browser is offline', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'onLine')
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false,
    })

    try {
      const handlers = makeHandlers()
      const controller = startRealtimeRecoverySignals(handlers)

      expect(handlers.onNetworkOffline).toHaveBeenCalledTimes(1)

      controller.stop()
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(navigator, 'onLine', originalDescriptor)
      } else {
        delete (navigator as unknown as Record<string, unknown>).onLine
      }
    }
  })

  it('does not report offline when the browser starts online', () => {
    const handlers = makeHandlers()
    const controller = startRealtimeRecoverySignals(handlers)

    expect(handlers.onNetworkOffline).not.toHaveBeenCalled()

    controller.stop()
  })

  it('reports background when the page starts hidden', () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    })

    const handlers = makeHandlers()
    const controller = startRealtimeRecoverySignals(handlers)

    expect(handlers.onAppBackground).toHaveBeenCalledTimes(1)

    controller.stop()
  })

  it('does not report background when the page starts visible', () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })

    const handlers = makeHandlers()
    const controller = startRealtimeRecoverySignals(handlers)

    expect(handlers.onAppBackground).not.toHaveBeenCalled()

    controller.stop()
  })

  it('resolves ready immediately on web', async () => {
    const controller = startRealtimeRecoverySignals(makeHandlers())

    // The web initial state is read synchronously, so the first connect must
    // not be deferred.
    await expect(controller.ready).resolves.toBeUndefined()

    controller.stop()
  })
})

describe('realtimeRecovery (native)', () => {
  beforeEach(() => {
    mocks.isNativePlatform.mockReset().mockReturnValue(true)
    mocks.networkAddListener.mockReset().mockResolvedValue({ remove: vi.fn() })
    mocks.networkGetStatus
      .mockReset()
      .mockResolvedValue({ connected: true, connectionType: 'wifi' })
    mocks.appAddListener.mockReset().mockResolvedValue({ remove: vi.fn() })
    mocks.appGetState.mockReset().mockResolvedValue({ isActive: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('wires native network and app lifecycle listeners', async () => {
    const handlers = makeHandlers()
    const controller = startRealtimeRecoverySignals(handlers)

    await flushAsync()

    expect(mocks.networkAddListener).toHaveBeenCalledWith(
      'networkStatusChange',
      expect.any(Function),
    )
    expect(mocks.appAddListener).toHaveBeenCalledWith(
      'appStateChange',
      expect.any(Function),
    )

    const networkCallback = mocks.networkAddListener.mock.calls[0]?.[1] as (
      status: { connected: boolean; connectionType?: string },
    ) => void
    networkCallback({ connected: false, connectionType: 'none' })
    expect(handlers.onNetworkOffline).toHaveBeenCalledTimes(1)
    expect(handlers.onNetworkType).toHaveBeenNthCalledWith(2, 'none')
    networkCallback({ connected: true, connectionType: 'cellular' })
    expect(handlers.onNetworkOnline).toHaveBeenCalledTimes(1)
    expect(handlers.onNetworkType).toHaveBeenNthCalledWith(3, 'cellular')

    const appCallback = mocks.appAddListener.mock.calls[0]?.[1] as (
      state: { isActive: boolean },
    ) => void
    appCallback({ isActive: false })
    expect(handlers.onAppBackground).toHaveBeenCalledTimes(1)
    appCallback({ isActive: true })
    expect(handlers.onAppForeground).toHaveBeenCalledTimes(1)

    controller.stop()
  })

  it('reports the initial connection type without emitting an extra online signal', async () => {
    const handlers = makeHandlers()
    const controller = startRealtimeRecoverySignals(handlers)

    await flushAsync()

    expect(handlers.onNetworkType).toHaveBeenCalledWith('wifi')
    expect(handlers.onNetworkOnline).not.toHaveBeenCalled()

    mocks.networkGetStatus.mockResolvedValue({
      connected: true,
      connectionType: 'vpn',
    })

    // A fresh controller proves an unknown plugin value is normalized instead
    // of being retained as arbitrary text.
    controller.stop()
    const nextHandlers = makeHandlers()
    const nextController = startRealtimeRecoverySignals(nextHandlers)
    await flushAsync()
    expect(nextHandlers.onNetworkType).toHaveBeenCalledWith('unknown')
    expect(nextHandlers.onNetworkOnline).not.toHaveBeenCalled()
    nextController.stop()
  })

  it('reports offline when the native app starts without connectivity', async () => {
    mocks.networkGetStatus.mockResolvedValue({ connected: false, connectionType: 'none' })

    const handlers = makeHandlers()
    const controller = startRealtimeRecoverySignals(handlers)

    await flushAsync()
    expect(handlers.onNetworkOffline).toHaveBeenCalledTimes(1)

    controller.stop()
  })

  it('removes native listeners on stop', async () => {
    const removeNetwork = vi.fn()
    const removeApp = vi.fn()
    mocks.networkAddListener.mockResolvedValue({ remove: removeNetwork })
    mocks.appAddListener.mockResolvedValue({ remove: removeApp })

    const controller = startRealtimeRecoverySignals(makeHandlers())

    await flushAsync()
    controller.stop()
    await flushAsync()

    expect(removeNetwork).toHaveBeenCalledTimes(1)
    expect(removeApp).toHaveBeenCalledTimes(1)
  })

  it('ignores captured native callbacks after stop', async () => {
    const handlers = makeHandlers()
    const controller = startRealtimeRecoverySignals(handlers)

    await flushAsync()

    const networkCallback = mocks.networkAddListener.mock.calls[0]?.[1] as (
      status: { connected: boolean; connectionType?: string }
    ) => void
    const appCallback = mocks.appAddListener.mock.calls[0]?.[1] as (
      state: { isActive: boolean }
    ) => void

    expect(handlers.onNetworkType).toHaveBeenCalledTimes(1)
    controller.stop()

    networkCallback({ connected: false, connectionType: 'none' })
    networkCallback({ connected: true, connectionType: 'cellular' })
    appCallback({ isActive: false })
    appCallback({ isActive: true })

    expect(handlers.onNetworkOffline).not.toHaveBeenCalled()
    expect(handlers.onNetworkOnline).not.toHaveBeenCalled()
    expect(handlers.onAppBackground).not.toHaveBeenCalled()
    expect(handlers.onAppForeground).not.toHaveBeenCalled()
    expect(handlers.onNetworkType).toHaveBeenCalledTimes(1)
  })

  it('reports background when the app starts backgrounded', async () => {
    mocks.appGetState.mockResolvedValue({ isActive: false })

    const handlers = makeHandlers()
    const controller = startRealtimeRecoverySignals(handlers)

    await flushAsync()
    expect(handlers.onAppBackground).toHaveBeenCalledTimes(1)

    controller.stop()
  })

  it('does not report background when the app starts in the foreground', async () => {
    const handlers = makeHandlers()
    const controller = startRealtimeRecoverySignals(handlers)

    await flushAsync()
    expect(handlers.onAppBackground).not.toHaveBeenCalled()

    controller.stop()
  })

  it('keeps cleanup idempotent when stopped before listeners are registered', async () => {
    mocks.networkAddListener.mockImplementation(
      () => new Promise(() => {}),
    )

    const controller = startRealtimeRecoverySignals(makeHandlers())
    controller.stop()
    await flushAsync()

    expect(mocks.networkAddListener).toHaveBeenCalledTimes(1)
  })

  it('swallows a network listener registration rejection', async () => {
    mocks.networkAddListener.mockRejectedValue(new Error('bridge broken'))

    const controller = startRealtimeRecoverySignals(makeHandlers())
    await flushAsync()
    controller.stop()
  })

  it('swallows an app listener registration rejection and still removes the network listener', async () => {
    const removeNetwork = vi.fn()
    mocks.networkAddListener.mockResolvedValue({ remove: removeNetwork })
    mocks.appAddListener.mockRejectedValue(new Error('bridge broken'))

    const controller = startRealtimeRecoverySignals(makeHandlers())
    await flushAsync()
    controller.stop()
    await flushAsync()

    expect(removeNetwork).toHaveBeenCalledTimes(1)
  })

  it('swallows an initial status read rejection', async () => {
    mocks.networkGetStatus.mockRejectedValue(new Error('bridge broken'))

    const controller = startRealtimeRecoverySignals(makeHandlers())
    await flushAsync()
    controller.stop()
  })

  it('still captures the app snapshot when the network status read rejects', async () => {
    mocks.networkGetStatus.mockRejectedValue(new Error('bridge broken'))
    mocks.appGetState.mockResolvedValue({ isActive: false })

    const handlers = makeHandlers()
    const controller = startRealtimeRecoverySignals(handlers)

    await flushAsync()
    expect(mocks.appGetState).toHaveBeenCalledTimes(1)
    expect(handlers.onAppBackground).toHaveBeenCalledTimes(1)
    expect(handlers.onNetworkOffline).not.toHaveBeenCalled()

    controller.stop()
  })

  it('still captures the network snapshot when the app state read rejects', async () => {
    mocks.appGetState.mockRejectedValue(new Error('bridge broken'))
    mocks.networkGetStatus.mockResolvedValue({
      connected: false,
      connectionType: 'none',
    })

    const handlers = makeHandlers()
    const controller = startRealtimeRecoverySignals(handlers)

    await flushAsync()
    expect(mocks.networkGetStatus).toHaveBeenCalledTimes(1)
    expect(handlers.onNetworkOffline).toHaveBeenCalledTimes(1)
    expect(handlers.onAppBackground).not.toHaveBeenCalled()

    controller.stop()
  })

  it('applies the app snapshot immediately while the network status read hangs', async () => {
    vi.useFakeTimers()

    try {
      mocks.networkGetStatus.mockImplementation(() => new Promise(() => {}))
      mocks.appGetState.mockResolvedValue({ isActive: false })

      const handlers = makeHandlers()
      const controller = startRealtimeRecoverySignals(handlers)

      await flushAsync()

      // The settled snapshot must be applied without waiting for the hung
      // plugin call (or the 5 s readiness safety window).
      expect(handlers.onAppBackground).toHaveBeenCalledTimes(1)

      // Readiness still waits for both snapshots, not just the settled one.
      let readySettled = false
      void controller.ready.then(() => {
        readySettled = true
      })
      await flushAsync()
      expect(readySettled).toBe(false)

      controller.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('applies the network snapshot immediately while the app state read hangs', async () => {
    vi.useFakeTimers()

    try {
      mocks.appGetState.mockImplementation(() => new Promise(() => {}))
      mocks.networkGetStatus.mockResolvedValue({
        connected: false,
        connectionType: 'none',
      })

      const handlers = makeHandlers()
      const controller = startRealtimeRecoverySignals(handlers)

      await flushAsync()

      expect(handlers.onNetworkOffline).toHaveBeenCalledTimes(1)

      let readySettled = false
      void controller.ready.then(() => {
        readySettled = true
      })
      await flushAsync()
      expect(readySettled).toBe(false)

      controller.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports the initial snapshot before ready resolves', async () => {
    mocks.networkGetStatus.mockResolvedValue({
      connected: false,
      connectionType: 'none',
    })

    const handlers = makeHandlers()
    const order: string[] = []
    vi.mocked(handlers.onNetworkOffline).mockImplementation(() => {
      order.push('snapshot')
    })

    const controller = startRealtimeRecoverySignals(handlers)
    void controller.ready.then(() => {
      order.push('ready')
    })

    await flushAsync()

    // The realtime channel gates its first connect on ready, so the snapshot
    // must be reported before ready resolves — otherwise the gate is useless.
    expect(order).toEqual(['snapshot', 'ready'])

    controller.stop()
  })

  it('resolves ready when listener registration fails', async () => {
    mocks.networkAddListener.mockRejectedValue(new Error('bridge broken'))

    const controller = startRealtimeRecoverySignals(makeHandlers())
    await expect(controller.ready).resolves.toBeUndefined()

    controller.stop()
  })

  it('resolves ready through the safety window when the bridge hangs', async () => {
    vi.useFakeTimers()

    try {
      mocks.networkAddListener.mockImplementation(() => new Promise(() => {}))

      const controller = startRealtimeRecoverySignals(makeHandlers())
      let readySettled = false
      void controller.ready.then(() => {
        readySettled = true
      })

      expect(readySettled).toBe(false)

      await vi.advanceTimersByTimeAsync(NATIVE_READY_TIMEOUT_MS - 1)
      expect(readySettled).toBe(false)

      // A hung plugin bridge must not defer the first connect forever.
      await vi.advanceTimersByTimeAsync(1)
      expect(readySettled).toBe(true)

      controller.stop()
    } finally {
      vi.useRealTimers()
    }
  })
})
