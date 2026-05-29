import { validateApiBaseUrl } from '@/services/apiConfig'

const SAVED_SERVERS_STORAGE_KEY = 'legero.saved-servers:v1'
const SAVED_SERVERS_LIMIT = 10
const SAVED_SERVERS_CHANGE_EVENT = 'legero:saved-servers-change'

let cachedSavedServers: SavedServerRecord[] | undefined
let cachedSavedServersRawValue: string | null | undefined

export type SavedServerRecord = Readonly<{
  baseUrl: string
  phone: string | null
}>

type SavedServerInput = {
  baseUrl: string
  phone?: string | null
}

const getStorage = (): Storage | null => {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage
}

const dispatchSavedServersChange = () => {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new Event(SAVED_SERVERS_CHANGE_EVENT))
}

const normalizePhone = (value: string | null | undefined): string | null => {
  const normalized = value?.trim() ?? ''

  return normalized === '' ? null : normalized
}

const parseSavedServers = (rawValue: string | null): SavedServerRecord[] => {
  if (!rawValue) {
    return []
  }

  try {
    const parsed = JSON.parse(rawValue) as Array<Partial<SavedServerRecord>>

    return parsed.flatMap((entry) => {
      if (typeof entry.baseUrl !== 'string') {
        return []
      }

      try {
        return [
          {
            baseUrl: validateApiBaseUrl(entry.baseUrl),
            phone: normalizePhone(entry.phone ?? null),
          },
        ]
      } catch {
        return []
      }
    })
  } catch {
    return []
  }
}

const writeSavedServers = (servers: SavedServerRecord[]): SavedServerRecord[] => {
  const storage = getStorage()
  const rawValue = JSON.stringify(servers)

  cachedSavedServers = servers
  cachedSavedServersRawValue = rawValue

  if (storage) {
    storage.setItem(SAVED_SERVERS_STORAGE_KEY, rawValue)
  }

  dispatchSavedServersChange()
  return servers
}

export const getSavedServers = (): SavedServerRecord[] => {
  const storage = getStorage()
  const rawValue = storage?.getItem(SAVED_SERVERS_STORAGE_KEY) ?? null

  if (
    cachedSavedServers !== undefined &&
    cachedSavedServersRawValue === rawValue
  ) {
    return cachedSavedServers
  }

  cachedSavedServers = parseSavedServers(rawValue)
  cachedSavedServersRawValue = rawValue

  return cachedSavedServers
}

export const findSavedServer = (baseUrl: string | null | undefined): SavedServerRecord | null => {
  if (!baseUrl) {
    return null
  }

  try {
    const normalizedBaseUrl = validateApiBaseUrl(baseUrl)

    return (
      getSavedServers().find((server) => server.baseUrl === normalizedBaseUrl) ?? null
    )
  } catch {
    return null
  }
}

export const upsertSavedServer = (input: SavedServerInput): SavedServerRecord[] => {
  const normalizedBaseUrl = validateApiBaseUrl(input.baseUrl)
  const existingServers = getSavedServers()
  const existingRecord = existingServers.find(
    (server) => server.baseUrl === normalizedBaseUrl,
  )
  const nextRecord: SavedServerRecord = {
    baseUrl: normalizedBaseUrl,
    phone: normalizePhone(input.phone) ?? existingRecord?.phone ?? null,
  }
  return writeSavedServers([
    nextRecord,
    ...existingServers.filter((server) => server.baseUrl !== nextRecord.baseUrl),
  ].slice(0, SAVED_SERVERS_LIMIT))
}

export const removeSavedServer = (baseUrl: string): SavedServerRecord[] => {
  const normalizedBaseUrl = validateApiBaseUrl(baseUrl)
  return writeSavedServers(getSavedServers().filter(
    (server) => server.baseUrl !== normalizedBaseUrl,
  ))
}

export const subscribeToSavedServersChanges = (
  listener: () => void,
): (() => void) => {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const handleCustomChange = () => {
    cachedSavedServers = undefined
    cachedSavedServersRawValue = undefined
    listener()
  }

  const handleStorageChange = (event: StorageEvent) => {
    if (event.key !== SAVED_SERVERS_STORAGE_KEY) {
      return
    }

    cachedSavedServers = undefined
    cachedSavedServersRawValue = undefined
    listener()
  }

  window.addEventListener(SAVED_SERVERS_CHANGE_EVENT, handleCustomChange)
  window.addEventListener('storage', handleStorageChange)

  return () => {
    window.removeEventListener(SAVED_SERVERS_CHANGE_EVENT, handleCustomChange)
    window.removeEventListener('storage', handleStorageChange)
  }
}