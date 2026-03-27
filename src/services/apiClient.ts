import { getApiBaseUrl } from './apiConfig'
import type {
  AuthTokens,
  RefreshResponse,
} from './apiTypes'

export { API_CONFIGURATION_ERROR, getApiBaseUrl, hasApiConfig } from './apiConfig'

const AUTH_STORAGE_KEY = 'legero.auth.tokens'
const ACCESS_TOKEN_REFRESH_BUFFER_MS = 30_000

type ApiErrorBody = {
  error?: {
    code?: string
    message?: string
  }
}

type ResponseType = 'json' | 'text' | 'none'

type ApiRequestOptions = {
  path: string
  method?: string
  body?: BodyInit | object
  headers?: HeadersInit
  auth?: boolean
  responseType?: ResponseType
  retry?: boolean
  signal?: AbortSignal
}

export class ApiError extends Error {
  code: string
  status: number

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

const getStorage = (): Storage | null => {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage
}

const isFormData = (value: unknown): value is FormData =>
  typeof FormData !== 'undefined' && value instanceof FormData

const isBodyInit = (value: unknown): value is BodyInit =>
  typeof value === 'string' ||
  value instanceof Blob ||
  value instanceof URLSearchParams ||
  value instanceof ArrayBuffer ||
  ArrayBuffer.isView(value) ||
  isFormData(value)

const parseErrorBody = (payload: string): ApiErrorBody | null => {
  if (payload.trim() === '') {
    return null
  }

  try {
    return JSON.parse(payload) as ApiErrorBody
  } catch {
    return null
  }
}

const buildApiError = (status: number, payload: string): ApiError => {
  const parsed = parseErrorBody(payload)
  const code = parsed?.error?.code?.trim() || `http_${status}`
  const message =
    parsed?.error?.message?.trim() ||
    payload.trim() ||
    `Request failed with status ${status}.`

  return new ApiError(status, code, message)
}

const tokensNeedRefresh = (tokens: AuthTokens): boolean => {
  const expiresAtMs = Date.parse(tokens.accessTokenExpiresAt)

  if (Number.isNaN(expiresAtMs)) {
    return true
  }

  return expiresAtMs - Date.now() <= ACCESS_TOKEN_REFRESH_BUFFER_MS
}

let refreshPromise: Promise<AuthTokens> | null = null

export const getStoredAuthTokens = (): AuthTokens | null => {
  const storage = getStorage()

  if (!storage) {
    return null
  }

  const rawValue = storage.getItem(AUTH_STORAGE_KEY)

  if (!rawValue) {
    return null
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<AuthTokens>

    if (
      !parsed.accessToken ||
      !parsed.accessTokenExpiresAt ||
      !parsed.refreshToken ||
      !parsed.refreshTokenExpiresAt
    ) {
      storage.removeItem(AUTH_STORAGE_KEY)
      return null
    }

    return {
      accessToken: parsed.accessToken,
      tokenType: parsed.tokenType ?? 'Bearer',
      accessTokenExpiresAt: parsed.accessTokenExpiresAt,
      refreshToken: parsed.refreshToken,
      refreshTokenExpiresAt: parsed.refreshTokenExpiresAt,
    }
  } catch {
    storage.removeItem(AUTH_STORAGE_KEY)
    return null
  }
}

export const hasStoredAuthTokens = (): boolean => getStoredAuthTokens() !== null

export const persistAuthTokens = (tokens: AuthTokens) => {
  const storage = getStorage()

  if (!storage) {
    return
  }

  storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(tokens))
}

export const clearStoredAuthTokens = () => {
  const storage = getStorage()

  if (!storage) {
    return
  }

  storage.removeItem(AUTH_STORAGE_KEY)
}

const mergeAuthTokens = (next: RefreshResponse): AuthTokens => ({
  accessToken: next.accessToken,
  tokenType: next.tokenType,
  accessTokenExpiresAt: next.accessTokenExpiresAt,
  refreshToken: next.refreshToken,
  refreshTokenExpiresAt: next.refreshTokenExpiresAt,
})

const parseSuccessfulResponse = async <T>(
  response: Response,
  responseType: ResponseType,
): Promise<T> => {
  if (responseType === 'none') {
    return undefined as T
  }

  if (responseType === 'text') {
    return (await response.text()) as T
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

const createRequestHeaders = (
  headers: HeadersInit | undefined,
  body: ApiRequestOptions['body'],
  accessToken: string | null,
): Headers => {
  const requestHeaders = new Headers(headers)

  if (accessToken) {
    requestHeaders.set('Authorization', `Bearer ${accessToken}`)
  }

  if (body !== undefined && !isBodyInit(body) && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json')
  }

  return requestHeaders
}

const createRequestBody = (body: ApiRequestOptions['body']): BodyInit | undefined => {
  if (body === undefined) {
    return undefined
  }

  if (isBodyInit(body)) {
    return body
  }

  return JSON.stringify(body)
}

const executeRequest = async <T>(
  options: ApiRequestOptions,
  accessToken: string | null,
): Promise<T> => {
  const response = await fetch(`${getApiBaseUrl()}${options.path}`, {
    method: options.method ?? 'GET',
    body: createRequestBody(options.body),
    headers: createRequestHeaders(options.headers, options.body, accessToken),
    signal: options.signal,
  })

  if (!response.ok) {
    throw buildApiError(response.status, await response.text())
  }

  return parseSuccessfulResponse<T>(response, options.responseType ?? 'json')
}

export const refreshAuthTokens = async (): Promise<AuthTokens> => {
  if (refreshPromise) {
    return refreshPromise
  }

  const current = getStoredAuthTokens()

  if (!current?.refreshToken) {
    clearStoredAuthTokens()
    throw new ApiError(401, 'unauthorized', 'Not authenticated.')
  }

  refreshPromise = executeRequest<RefreshResponse>(
    {
      path: '/api/auth/refresh',
      method: 'POST',
      body: {
        refreshToken: current.refreshToken,
      },
      retry: false,
    },
    null,
  )
    .then((next) => {
      const merged = mergeAuthTokens(next)
      persistAuthTokens(merged)
      return merged
    })
    .catch((error) => {
      clearStoredAuthTokens()
      throw error
    })
    .finally(() => {
      refreshPromise = null
    })

  return refreshPromise
}

export const ensureFreshAuthTokens = async (): Promise<AuthTokens | null> => {
  const current = getStoredAuthTokens()

  if (!current) {
    return null
  }

  if (!tokensNeedRefresh(current)) {
    return current
  }

  return refreshAuthTokens()
}

export const getCurrentAccessToken = (): string | null =>
  getStoredAuthTokens()?.accessToken ?? null

export const apiRequest = async <T>(
  options: ApiRequestOptions,
): Promise<T> => {
  const requestOptions = {
    retry: true,
    ...options,
  }

  try {
    const accessToken = requestOptions.auth
      ? (await ensureFreshAuthTokens())?.accessToken ?? null
      : null

    if (requestOptions.auth && !accessToken) {
      throw new ApiError(401, 'unauthorized', 'Not authenticated.')
    }

    return await executeRequest<T>(requestOptions, accessToken)
  } catch (error) {
    if (
      requestOptions.auth &&
      requestOptions.retry &&
      error instanceof ApiError &&
      error.status === 401 &&
      error.code === 'token_expired'
    ) {
      const nextTokens = await refreshAuthTokens()

      return executeRequest<T>(
        {
          ...requestOptions,
          retry: false,
        },
        nextTokens.accessToken,
      )
    }

    if (
      requestOptions.auth &&
      error instanceof ApiError &&
      error.status === 401
    ) {
      clearStoredAuthTokens()
    }

    throw error
  }
}
