import { useSyncExternalStore } from 'react'
import {
  getSavedServers,
  subscribeToSavedServersChanges,
} from '@/services/savedServers'

export const useSavedServers = () =>
  useSyncExternalStore(subscribeToSavedServersChanges, getSavedServers, () => [])