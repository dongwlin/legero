import { useCallback, useEffect, useState } from 'react'
import { orderRepository } from '@/services/orderRepository'
import {
  orderRealtime,
  type OrderRealtimeSubscription,
} from '@/services/orderRealtime'
import { useAuthStore } from '@/store/auth'
import { useOrderStore } from '@/store/order'
import type { OrderRecord } from '@/types'

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Failed to sync workspace orders.'

export const useOrderWorkspaceSync = () => {
  const authStatus = useAuthStore((state) => state.status)
  const activeWorkspaceId = useAuthStore((state) => state.activeWorkspace?.id ?? null)
  const status = useOrderStore((state) => state.status)
  const errorMessage = useOrderStore((state) => state.errorMessage)
  const setOrders = useOrderStore((state) => state.setOrders)
  const resetSyncState = useOrderStore((state) => state.resetSyncState)
  const setHydrationState = useOrderStore((state) => state.setHydrationState)
  const [refreshKey, setRefreshKey] = useState(0)

  const retrySync = useCallback(() => {
    setRefreshKey((current) => current + 1)
  }, [])

  useEffect(() => {
    if (authStatus !== 'authenticated' || !activeWorkspaceId) {
      resetSyncState()
      return
    }

    let isDisposed = false
    let subscription: OrderRealtimeSubscription | null = null

    const pendingUpserts = new Map<string, OrderRecord>()
    const pendingRemoves = new Set<string>()
    let flushRafId: number | null = null

    const flushBatched = () => {
      flushRafId = null

      if (isDisposed) {
        return
      }

      const upserts = Array.from(pendingUpserts.values())
      const removes = Array.from(pendingRemoves.values())
      pendingUpserts.clear()
      pendingRemoves.clear()

      const store = useOrderStore.getState()

      if (upserts.length > 0) {
        store.upsertOrders(upserts)
      }

      for (const id of removes) {
        store.removeOrder(id)
      }
    }

    const scheduleBatchFlush = () => {
      if (flushRafId !== null) {
        return
      }

      flushRafId = window.requestAnimationFrame(flushBatched)
    }

    const syncSnapshot = async (shouldBlock: boolean) => {
      if (shouldBlock) {
        setHydrationState({
          status: 'loading',
          errorMessage: null,
        })
      }

      try {
        const nextOrders = await orderRepository.list('all')

        if (isDisposed) {
          return
        }

        setOrders(nextOrders)
      } catch (error) {
        if (isDisposed) {
          return
        }

        if (shouldBlock) {
          setHydrationState({
            status: 'error',
            errorMessage: getErrorMessage(error),
          })
        }
      }
    }

    const initialize = async () => {
      try {
        const shouldBlock = refreshKey > 0 || useOrderStore.getState().status !== 'ready'

        if (shouldBlock) {
          setHydrationState({
            status: 'loading',
            errorMessage: null,
          })
        }

        subscription = orderRealtime.subscribeToWorkspaceOrders({
          onUpsert: (order) => {
            if (!isDisposed) {
              pendingUpserts.set(order.id, order)
              scheduleBatchFlush()
            }
          },
          onRemove: (id) => {
            if (!isDisposed) {
              pendingRemoves.add(id)
              scheduleBatchFlush()
            }
          },
          onClear: () => {
            if (!isDisposed) {
              void syncSnapshot(false)
            }
          },
          onSubscriptionStatus: (subscriptionStatus) => {
            if (isDisposed) {
              return
            }

            if (subscriptionStatus === 'SUBSCRIBED') {
              void syncSnapshot(shouldBlock)
            }

            if (
              subscriptionStatus === 'CHANNEL_ERROR' ||
              subscriptionStatus === 'TIMED_OUT'
            ) {
              if (shouldBlock) {
                setHydrationState({
                  status: 'error',
                  errorMessage: 'Realtime subscription failed.',
                })
              }
            }
          },
        })
      } catch (error) {
        if (isDisposed) {
          return
        }

        setHydrationState({
          status: 'error',
          errorMessage: getErrorMessage(error),
        })
      }
    }

    void initialize()

    return () => {
      isDisposed = true

      if (flushRafId !== null) {
        window.cancelAnimationFrame(flushRafId)
        flushRafId = null
      }

      if (subscription) {
        void orderRealtime.unsubscribe(subscription)
      }
    }
  }, [
    activeWorkspaceId,
    authStatus,
    refreshKey,
    resetSyncState,
    setHydrationState,
    setOrders,
  ])

  return {
    status,
    errorMessage,
    retrySync,
  }
}
