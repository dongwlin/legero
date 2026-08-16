/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startRealtimeRecoverySignals } from './realtimeRecovery'
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
    const stop = startRealtimeRecoverySignals(handlers)

    window.dispatchEvent(new Event('offline'))
    expect(handlers.onNetworkOffline).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new Event('online'))
    expect(handlers.onNetworkOnline).toHaveBeenCalledTimes(1)

    stop()
    window.dispatchEvent(new Event('offline'))
    window.dispatchEvent(new Event('online'))
    expect(handlers.onNetworkOffline).toHaveBeenCalledTimes(1)
    expect(handlers.onNetworkOnline).toHaveBeenCalledTimes(1)
  })

  it('maps visibilitychange to app background and foreground', () => {
    const handlers = makeHandlers()
    const stop = startRealtimeRecoverySignals(handlers)

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

    stop()
  })

  it('reports the initial network state when the browser is offline', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, 'onLine')
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false,
    })

    try {
      const handlers = makeHandlers()
      const stop = startRealtimeRecoverySignals(handlers)

      expect(handlers.onNetworkOffline).toHaveBeenCalledTimes(1)

      stop()
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
    const stop = startRealtimeRecoverySignals(handlers)

    expect(handlers.onNetworkOffline).not.toHaveBeenCalled()

    stop()
  })

  it('reports background when the page starts hidden', () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    })

    const handlers = makeHandlers()
    const stop = startRealtimeRecoverySignals(handlers)

    expect(handlers.onAppBackground).toHaveBeenCalledTimes(1)

    stop()
  })

  it('does not report background when the page starts visible', () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })

    const handlers = makeHandlers()
    const stop = startRealtimeRecoverySignals(handlers)

    expect(handlers.onAppBackground).not.toHaveBeenCalled()

    stop()
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
    const stop = startRealtimeRecoverySignals(handlers)

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
    networkCallback({ connected: true, connectionType: 'cellular' })
    expect(handlers.onNetworkOnline).toHaveBeenCalledTimes(1)

    const appCallback = mocks.appAddListener.mock.calls[0]?.[1] as (
      state: { isActive: boolean },
    ) => void
    appCallback({ isActive: false })
    expect(handlers.onAppBackground).toHaveBeenCalledTimes(1)
    appCallback({ isActive: true })
    expect(handlers.onAppForeground).toHaveBeenCalledTimes(1)

    stop()
  })

  it('reports offline when the native app starts without connectivity', async () => {
    mocks.networkGetStatus.mockResolvedValue({ connected: false, connectionType: 'none' })

    const handlers = makeHandlers()
    const stop = startRealtimeRecoverySignals(handlers)

    await flushAsync()
    expect(handlers.onNetworkOffline).toHaveBeenCalledTimes(1)

    stop()
  })

  it('removes native listeners on stop', async () => {
    const removeNetwork = vi.fn()
    const removeApp = vi.fn()
    mocks.networkAddListener.mockResolvedValue({ remove: removeNetwork })
    mocks.appAddListener.mockResolvedValue({ remove: removeApp })

    const stop = startRealtimeRecoverySignals(makeHandlers())

    await flushAsync()
    stop()
    await flushAsync()

    expect(removeNetwork).toHaveBeenCalledTimes(1)
    expect(removeApp).toHaveBeenCalledTimes(1)
  })

  it('reports background when the app starts backgrounded', async () => {
    mocks.appGetState.mockResolvedValue({ isActive: false })

    const handlers = makeHandlers()
    const stop = startRealtimeRecoverySignals(handlers)

    await flushAsync()
    expect(handlers.onAppBackground).toHaveBeenCalledTimes(1)

    stop()
  })

  it('does not report background when the app starts in the foreground', async () => {
    const handlers = makeHandlers()
    const stop = startRealtimeRecoverySignals(handlers)

    await flushAsync()
    expect(handlers.onAppBackground).not.toHaveBeenCalled()

    stop()
  })

  it('keeps cleanup idempotent when stopped before listeners are registered', async () => {
    mocks.networkAddListener.mockImplementation(
      () => new Promise(() => {}),
    )

    const stop = startRealtimeRecoverySignals(makeHandlers())
    stop()
    await flushAsync()

    expect(mocks.networkAddListener).toHaveBeenCalledTimes(1)
  })
})
