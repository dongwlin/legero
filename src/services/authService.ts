import {
  apiRequest,
  clearStoredAuthTokens,
  persistAuthTokens,
} from './apiClient'
import type {
  BootstrapResponse,
  LoginResponse,
} from './apiTypes'

const extractTokens = (response: LoginResponse) => ({
  accessToken: response.accessToken,
  tokenType: response.tokenType,
  accessTokenExpiresAt: response.accessTokenExpiresAt,
  refreshToken: response.refreshToken,
  refreshTokenExpiresAt: response.refreshTokenExpiresAt,
})

export const authService = {
  async signInWithPassword(phone: string, password: string): Promise<LoginResponse> {
    const response = await apiRequest<LoginResponse>({
      path: '/api/auth/login',
      method: 'POST',
      body: {
        phone,
        password,
      },
    })

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
