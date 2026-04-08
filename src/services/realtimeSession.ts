import { apiRequest } from './apiClient'
import type { RealtimeSessionResponse } from './apiTypes'

export const realtimeSession = {
  async create(): Promise<RealtimeSessionResponse> {
    return apiRequest<RealtimeSessionResponse>({
      path: '/api/realtime/session',
      method: 'POST',
      auth: true,
    })
  },
}
