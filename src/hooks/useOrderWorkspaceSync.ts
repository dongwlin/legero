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
import { isOrderCreatedToday } from '@/services/orderDomainUtils'
import type { ClearWorkspaceMode } from '@/services/apiTypes'
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

    // Buffered upserts whose id still has an in-flight optimistic mutation at
    // commit time are deferred: the snapshot must not clobber the optimistic
    // record, and the mutation's own completion (or rollback) delivers the
    // authoritative server state.
    const collectPendingUpsertIds = (events: RealtimeOrderEvent[]): Set<string> => {
      const pendingIds = new Set<string>()

      for (const event of events) {
        if (event.type === 'upsert' && orderOptimistic.hasPending(event.order.id)) {
          pendingIds.add(event.order.id)
        }
      }

      return pendingIds
    }

    // Re-applies the store's current (optimistic) records for deferred ids on
    // top of a reconciled list, so a stale snapshot cannot overwrite an
    // in-flight mutation. Orders the events themselves removed (remove/clear)
    // stay removed.
    const overlayOptimisticRecords = (
      orders: OrderRecord[],
      pendingIds: ReadonlySet<string>,
    ): OrderRecord[] => {
      if (pendingIds.size === 0) {
        return orders
      }

      const store = useOrderStore.getState()
      const ordersById = new Map(orders.map((order) => [order.id, order]))

      for (const id of pendingIds) {
        const optimistic = store.ordersById[id]

        if (optimistic && ordersById.has(id)) {
          ordersById.set(id, optimistic)
        }
      }

      return [...ordersById.values()]
    }

    // Applies a clear event's semantics to the store: 'all' empties the
    // workspace, 'before_today' keeps only orders created on the current
    // business day (the server deleted everything older).
    const applyClearToStore = (mode: ClearWorkspaceMode) => {
      const store = useOrderStore.getState()

      if (mode === 'all') {
        store.clearOrders()
        return
      }

      store.setOrders(
        Object.values(store.ordersById).filter((order) => isOrderCreatedToday(order)),
      )
    }

    // Failure recovery for a failed snapshot: buffered events must not be
    // dropped — apply them as ordinary updates on top of whatever the store
    // currently holds, then surface the error. The next successful
    // reconciliation (retry or reconnect) restores the full server state.
    const applyBufferedEvents = (events: RealtimeOrderEvent[]) => {
      const store = useOrderStore.getState()
      const pendingIds = collectPendingUpsertIds(events)

      for (const event of events) {
        switch (event.type) {
          case 'upsert':
            // Defer upserts for orders with an in-flight optimistic
            // mutation: their completion (or rollback) owns the
            // authoritative state.
            if (!pendingIds.has(event.order.id)) {
              store.upsertOrder(event.order)
            }
            break
          case 'remove':
            store.removeOrder(event.id)
            break
          case 'clear':
            applyClearToStore(event.mode)
            break
          default: {
            const exhaustive: never = event
            throw new Error(
              'Unknown realtime event: ' + JSON.stringify(exhaustive),
            )
          }
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
        // Upserts for still-pending optimistic mutations are deferred: keep
        // the store's optimistic record so the snapshot cannot clobber it
        // (the HTTP response settles the authoritative state afterwards).
        const events = eventBuffer.endReconciliation()
        setOrders(
          overlayOptimisticRecords(
            reconcileSnapshotWithEvents(nextOrders, events),
            collectPendingUpsertIds(events),
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
              if (eventBuffer.isReconciling) {
                // Buffer the server event even when the order has an
                // in-flight optimistic mutation: dropping it here would let
                // a stale snapshot overwrite the optimistically-applied
                // state. At commit time the event is replayed unless the
                // mutation is still pending.
                eventBuffer.push({ type: 'upsert', order })
                return
              }

              if (orderOptimistic.hasPending(order.id)) {
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
          onClear: (event) => {
            if (!isDisposed) {
              if (eventBuffer.isReconciling) {
                // A clear that arrives while a snapshot is in flight: buffer
                // it so the reconciliation replays it (otherwise the
                // snapshot would resurrect cleared orders), and schedule the
                // follow-up snapshot the clear already implied (before_today
                // keeps part of the list).
                eventBuffer.push({ type: 'clear', mode: event.mode })
                pendingReconcile = true
                return
              }

              // No snapshot in flight: apply the clear semantics to the
              // store immediately, so a failed follow-up snapshot cannot
              // leave server-deleted orders behind (the follow-up then
              // reconciles any boundary ambiguity). Batched upserts/removes
              // that arrived before the clear are flushed first — they
              // belong to the pre-clear server state, and flushing them
              // inside syncSnapshot() would re-apply them after the clear
              // and resurrect orders the server already deleted.
              flushBatched()
              applyClearToStore(event.mode)
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
