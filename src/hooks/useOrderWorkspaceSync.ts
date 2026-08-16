import { useCallback, useEffect, useState } from 'react'
import { orderRepository } from '@/services/orderRepository'
import {
  orderRealtime,
  type OrderRealtimeSubscription,
} from '@/services/orderRealtime'
import {
  createOrderEventBuffer,
  reconcileSnapshotWithEvents,
  type RealtimeOrderEvent,
} from '@/services/orderReconcile'
import { useAuthStore } from '@/store/auth'
import { useOrderStore } from '@/store/order'
import { orderOptimistic } from '@/services/orderOptimistic'
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

    // Realtime events received while a snapshot request is in flight are
    // buffered here and replayed over the snapshot when it lands, so the
    // snapshot can never clobber updates that arrived after it was read
    // (issue #12). Every syncSnapshot() run is a reconciliation: the
    // initial subscribe and every reconnect use the same mechanism.
    const eventBuffer = createOrderEventBuffer()
    let syncInFlight = false
    let pendingReconcile = false
    let pendingReconcileShouldBlock = false

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

    // Failure recovery for a failed snapshot: buffered events must not be
    // dropped — apply them as ordinary updates on top of whatever the store
    // currently holds, then surface the error. The next successful
    // reconciliation (retry or reconnect) restores the full server state.
    const applyBufferedEvents = (events: RealtimeOrderEvent[]) => {
      const store = useOrderStore.getState()

      for (const event of events) {
        if (event.type === 'upsert') {
          store.upsertOrder(event.order)
        } else if (event.type === 'remove') {
          store.removeOrder(event.id)
        } else {
          store.clearOrders()
        }
      }
    }

    const syncSnapshot = async (shouldBlock: boolean) => {
      if (syncInFlight) {
        // A new sync requested while one is already in flight (a reconnect
        // SUBSCRIBED or a clear event): run it once the current one settles,
        // keeping the most conservative blocking behaviour.
        pendingReconcile = true
        pendingReconcileShouldBlock = pendingReconcileShouldBlock || shouldBlock
        return
      }

      syncInFlight = true

      if (shouldBlock) {
        setHydrationState({
          status: 'loading',
          errorMessage: null,
        })
      }

      // From this point until the snapshot lands, realtime upsert/remove/
      // clear events are buffered in arrival order instead of being applied,
      // so the snapshot cannot overwrite them. Flush anything received
      // before the reconciliation started first (those events predate the
      // snapshot read and are already covered by it).
      flushBatched()
      eventBuffer.beginReconciliation()

      try {
        const nextOrders = await orderRepository.list('all')

        if (isDisposed) {
          return
        }

        // The snapshot is the base state; buffered events are newer and win.
        setOrders(
          reconcileSnapshotWithEvents(
            nextOrders,
            eventBuffer.endReconciliation(),
          ),
        )
      } catch (error) {
        if (isDisposed) {
          return
        }

        applyBufferedEvents(eventBuffer.endReconciliation())

        if (shouldBlock) {
          setHydrationState({
            status: 'error',
            errorMessage: getErrorMessage(error),
          })
        }
      } finally {
        syncInFlight = false
      }

      if (pendingReconcile) {
        pendingReconcile = false
        const nextShouldBlock = pendingReconcileShouldBlock
        pendingReconcileShouldBlock = false
        void syncSnapshot(nextShouldBlock)
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
              if (orderOptimistic.hasPending(order.id)) {
                return
              }

              if (eventBuffer.isReconciling) {
                eventBuffer.push({ type: 'upsert', order })
                return
              }

              pendingUpserts.set(order.id, order)
              scheduleBatchFlush()
            }
          },
          onRemove: (id) => {
            if (!isDisposed) {
              if (eventBuffer.isReconciling) {
                eventBuffer.push({ type: 'remove', id })
                return
              }

              pendingRemoves.add(id)
              scheduleBatchFlush()
            }
          },
          onClear: () => {
            if (!isDisposed) {
              if (eventBuffer.isReconciling) {
                // A clear that arrives while a snapshot is in flight: buffer
                // it so the reconciliation replays it (otherwise the
                // snapshot would resurrect cleared orders), and schedule the
                // follow-up snapshot the clear already implied (before_today
                // keeps part of the list).
                eventBuffer.push({ type: 'clear' })
                pendingReconcile = true
                return
              }

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
