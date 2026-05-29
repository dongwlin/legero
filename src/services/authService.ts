import {
  ApiError,
  apiRequest,
  clearStoredAuthTokens,
  persistAuthTokens,
} from './apiClient'
import type {
  BootstrapResponse,
  LoginResponse,
} from './apiTypes'

const LOGIN_CONNECTION_ERROR = '无法连接到服务器，请检查网络或服务器地址'
const LOGIN_INVALID_CREDENTIALS_ERROR = '手机号或密码错误'

const isTransportFailure = (error: unknown): boolean =>
  error instanceof Error &&
  !(error instanceof ApiError) &&
  /failed to fetch|fetch failed|networkerror/i.test(error.message)

const isInvalidCredentialsError = (error: unknown): error is ApiError =>
  error instanceof ApiError &&
  error.code === 'invalid_credentials'

const extractTokens = (response: LoginResponse) => ({
  accessToken: response.accessToken,
  tokenType: response.tokenType,
  accessTokenExpiresAt: response.accessTokenExpiresAt,
  refreshToken: response.refreshToken,
  refreshTokenExpiresAt: response.refreshTokenExpiresAt,
})

export const authService = {
  async signInWithPassword(phone: string, password: string): Promise<LoginResponse> {
    let response: LoginResponse

    try {
      response = await apiRequest<LoginResponse>({
        path: '/api/auth/login',
        method: 'POST',
        body: {
          phone,
          password,
        },
      })
    } catch (error) {
      if (isTransportFailure(error)) {
        throw new Error(LOGIN_CONNECTION_ERROR)
      }

      if (isInvalidCredentialsError(error)) {
        throw new ApiError(
          error.status,
          error.code,
          LOGIN_INVALID_CREDENTIALS_ERROR,
        )
      }

      throw error
    }

    persistAuthTokens(extractTokens(response))

    return response
  },

  async bootstrap(): Promise<BootstrapResponse> {
    return apiRequest<BootstrapResponse>({
      path: '/api/bootstrap',
      auth: true,
    })
  },

  async signOut(): Promise<void> {
    clearStoredAuthTokens()
  },
}
