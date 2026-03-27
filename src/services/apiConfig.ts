const API_BASE_URL_STORAGE_KEY = 'legero.api-base-url:v1'
const API_BASE_URL_CHANGE_EVENT = 'legero:api-base-url-change'

export const API_CONFIGURATION_ERROR =
  'Missing API configuration. Set API base URL before signing in.'

let cachedApiBaseUrl: string | null | undefined

const getStorage = (): Storage | null => {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage
}

const normalizeApiBaseUrl = (value: string): string => value.trim().replace(/\/+$/, '')

const dispatchApiBaseUrlChange = () => {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new Event(API_BASE_URL_CHANGE_EVENT))
}

export const validateApiBaseUrl = (value: string): string => {
  const normalized = normalizeApiBaseUrl(value)

  if (!normalized) {
    throw new Error('请输入 API base URL。')
  }

  let parsed: URL

  try {
    parsed = new URL(normalized)
  } catch {
    throw new Error('API base URL 必须是完整的 http(s) 地址。')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('API base URL 仅支持 http:// 或 https://。')
  }

  if (parsed.search || parsed.hash) {
    throw new Error('API base URL 不能包含查询参数或 hash。')
  }

  return normalizeApiBaseUrl(`${parsed.origin}${parsed.pathname}`)
}

export const getStoredApiBaseUrl = (): string | null => {
  if (cachedApiBaseUrl !== undefined) {
    return cachedApiBaseUrl
  }

  const storage = getStorage()

  if (!storage) {
    cachedApiBaseUrl = null
    return cachedApiBaseUrl
  }

  try {
    const rawValue = storage.getItem(API_BASE_URL_STORAGE_KEY)

    if (!rawValue) {
      cachedApiBaseUrl = null
      return cachedApiBaseUrl
    }

    const normalized = validateApiBaseUrl(rawValue)

    if (normalized !== rawValue) {
      storage.setItem(API_BASE_URL_STORAGE_KEY, normalized)
    }

    cachedApiBaseUrl = normalized
    return cachedApiBaseUrl
  } catch {
    try {
      storage.removeItem(API_BASE_URL_STORAGE_KEY)
    } catch {
      // Ignore storage failures and fall back to in-memory state.
    }

    cachedApiBaseUrl = null
    return cachedApiBaseUrl
  }
}

export const hasApiConfig = (): boolean => getStoredApiBaseUrl() !== null

export const getApiBaseUrl = (): string => {
  const apiBaseUrl = getStoredApiBaseUrl()

  if (!apiBaseUrl) {
    throw new Error(API_CONFIGURATION_ERROR)
  }

  return apiBaseUrl
}

export const setStoredApiBaseUrl = (value: string): string => {
  const normalized = validateApiBaseUrl(value)
  const storage = getStorage()

  if (storage) {
    try {
      storage.setItem(API_BASE_URL_STORAGE_KEY, normalized)
    } catch {
      // Persist best effort only; keep the in-memory copy for this session.
    }
  }

  cachedApiBaseUrl = normalized
  dispatchApiBaseUrlChange()
  return normalized
}

export const subscribeToApiBaseUrlChanges = (listener: () => void): (() => void) => {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const handleCustomChange = () => {
    cachedApiBaseUrl = undefined
    listener()
  }

  const handleStorageChange = (event: StorageEvent) => {
    if (event.key !== API_BASE_URL_STORAGE_KEY) {
      return
    }

    cachedApiBaseUrl = undefined
    listener()
  }

  window.addEventListener(API_BASE_URL_CHANGE_EVENT, handleCustomChange)
  window.addEventListener('storage', handleStorageChange)

  return () => {
    window.removeEventListener(API_BASE_URL_CHANGE_EVENT, handleCustomChange)
    window.removeEventListener('storage', handleStorageChange)
  }
}
