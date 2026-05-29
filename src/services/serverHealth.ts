import { validateApiBaseUrl } from '@/services/apiConfig'

const SERVER_HEALTH_PATH = '/healthz'

export const probeServerHealth = async (
  value: string,
  signal?: AbortSignal,
): Promise<string> => {
  const normalizedBaseUrl = validateApiBaseUrl(value)

  let response: Response

  try {
    response = await fetch(`${normalizedBaseUrl}${SERVER_HEALTH_PATH}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error
    }

    throw new Error('无法连接到该服务器，请检查地址或网络。')
  }

  if (!response.ok) {
    throw new Error('服务器健康检查失败，请确认该地址可访问。')
  }

  return normalizedBaseUrl
}