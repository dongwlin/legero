import { useSyncExternalStore } from 'react'
import {
  getStoredApiBaseUrl,
  subscribeToApiBaseUrlChanges,
} from '@/services/apiConfig'

export const useApiBaseUrl = (): string | null =>
  useSyncExternalStore(subscribeToApiBaseUrlChanges, getStoredApiBaseUrl, () => null)
