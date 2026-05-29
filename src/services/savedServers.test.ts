import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  getSavedServers,
  removeSavedServer,
  upsertSavedServer,
} from '@/services/savedServers'

class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>()

  get length(): number {
    return this.map.size
  }

  clear(): void {
    this.map.clear()
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null
  }

  removeItem(key: string): void {
    this.map.delete(key)
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }
}

const originalWindow = globalThis.window

describe('savedServers', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: {
        localStorage: new MemoryStorage(),
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => true,
      },
      configurable: true,
      writable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      configurable: true,
      writable: true,
    })
  })

  it('stores a saved server together with its phone number', () => {
    upsertSavedServer({
      baseUrl: ' https://demo.legero.local/ ',
      phone: ' 13800001234 ',
    })

    expect(getSavedServers()).toEqual([
      {
        baseUrl: 'https://demo.legero.local',
        phone: '13800001234',
      },
    ])
  })

  it('keeps only the 10 most recent saved servers', () => {
    for (let index = 1; index <= 11; index += 1) {
      upsertSavedServer({
        baseUrl: `https://demo-${index}.legero.local`,
        phone: `138000000${index.toString().padStart(2, '0')}`,
      })
    }

    expect(getSavedServers()).toHaveLength(10)
    expect(getSavedServers()[0]?.baseUrl).toBe('https://demo-11.legero.local')
    expect(getSavedServers()[getSavedServers().length - 1]?.baseUrl).toBe(
      'https://demo-2.legero.local',
    )
  })

  it('preserves the existing phone when re-saving a server without a new phone', () => {
    upsertSavedServer({
      baseUrl: 'https://demo.legero.local',
      phone: '13800001234',
    })

    upsertSavedServer({
      baseUrl: 'https://demo.legero.local',
    })

    expect(getSavedServers()).toEqual([
      {
        baseUrl: 'https://demo.legero.local',
        phone: '13800001234',
      },
    ])
  })

  it('removes a saved server by base url', () => {
    upsertSavedServer({
      baseUrl: 'https://alpha.legero.local',
      phone: '13800001234',
    })
    upsertSavedServer({
      baseUrl: 'https://beta.legero.local',
      phone: '13900001234',
    })

    removeSavedServer('https://alpha.legero.local')

    expect(getSavedServers()).toEqual([
      {
        baseUrl: 'https://beta.legero.local',
        phone: '13900001234',
      },
    ])
  })
})