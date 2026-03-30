const REMEMBERED_PHONE_STORAGE_KEY = 'legero.auth.phone:v1'

let cachedRememberedPhone: string | null | undefined

const getStorage = (): Storage | null => {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage
}

const normalizeRememberedPhone = (value: string | null): string | null => {
  const normalized = value?.trim() ?? ''

  return normalized === '' ? null : normalized
}

export const getRememberedPhone = (): string => {
  if (cachedRememberedPhone !== undefined) {
    return cachedRememberedPhone ?? ''
  }

  const storage = getStorage()

  if (!storage) {
    cachedRememberedPhone = null
    return ''
  }

  try {
    cachedRememberedPhone = normalizeRememberedPhone(
      storage.getItem(REMEMBERED_PHONE_STORAGE_KEY),
    )
  } catch {
    cachedRememberedPhone = null
  }

  return cachedRememberedPhone ?? ''
}

export const rememberPhone = (value: string) => {
  const normalized = normalizeRememberedPhone(value)
  const storage = getStorage()

  cachedRememberedPhone = normalized

  if (!storage) {
    return
  }

  try {
    if (normalized) {
      storage.setItem(REMEMBERED_PHONE_STORAGE_KEY, normalized)
      return
    }

    storage.removeItem(REMEMBERED_PHONE_STORAGE_KEY)
  } catch {
    // Persist best effort only; keep the in-memory copy for this session.
  }
}
