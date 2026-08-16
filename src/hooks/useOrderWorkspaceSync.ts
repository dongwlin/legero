import { useCallback, useEffect, useState } from 'react'
import { orderRepository } from '@/services/orderRepository'
import {
  orderRealtime,
  type OrderRealtimeSubscription,
} from '@/services/orderRealtime'
import {
  createOrderEventBuffer,
  latestUpsertVersion,
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

      // Upserts for the same id consolidate on the highest server version:
      // within one batch a delayed stale event must not displace the newer
      // event it trails.
      const upsertsById = new Map<string, OrderRecord>()

      for (const order of pendingUpserts.values()) {
        const current = upsertsById.get(order.id)
        if (!current || order.version > current.version) {
          upsertsById.set(order.id, order)
        }
      }

      pendingUpserts.clear()
      const upserts = Array.from(upsertsById.values())
      const removes = Array.from(pendingRemoves.values())
      pendingRemoves.clear()

      const store = useOrderStore.getState()

      if (upserts.length > 0) {
        // A realtime upsert is applied only when it is strictly newer than
        // the store's record: a duplicate echo (same version) or a delayed
        // stale event (lower version) must not overwrite authoritative state.
        const toApply = upserts.filter((order) => {
          const existing = store.ordersById[order.id]
          return !existing || order.version > existing.version
        })

        if (toApply.length > 0) {
          store.upsertOrders(toApply)
        }
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

    // Re-applies the store's records for protected ids on top of a reconciled
    // list, so a stale snapshot cannot overwrite a mutation that overlaps its
    // lifetime. Pending mutations always win: their completion (or rollback)
    // owns the authoritative state, and the optimistic record predates the
    // server versions any event would carry. Settled mutations only win over
    // the snapshot itself — a buffered realtime event with a strictly higher
    // server version (e.g. another client's update committed after ours)
    // supersedes the local result. Orders the events themselves removed
    // (remove/clear) stay removed.
    const overlayOptimisticRecords = (
      orders: OrderRecord[],
      protectedIds: ReadonlySet<string>,
      events: RealtimeOrderEvent[],
    ): OrderRecord[] => {
      if (protectedIds.size === 0) {
        return orders
      }

      const store = useOrderStore.getState()
      const ordersById = new Map(orders.map((order) => [order.id, order]))
      const latestEventVersion = latestUpsertVersion(events)

      for (const id of protectedIds) {
        const optimistic = store.ordersById[id]

        if (!optimistic || !ordersById.has(id)) {
          continue
        }

        if (orderOptimistic.hasPending(id)) {
          ordersById.set(id, optimistic)
          continue
        }

        const eventVersion = latestEventVersion.get(id)

        if (
          eventVersion === undefined ||
          eventVersion <= optimistic.version
        ) {
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
    // Upserts are skipped only when the store already owns a state at least
    // as new: while a mutation is still pending (its completion or rollback
    // owns the authoritative state, and the optimistic record is not
    // version-comparable), or when the event carries no strictly higher
    // server version than the store's record (the echo of a settled local
    // mutation, a duplicate, or an older event). A strictly newer event —
    // another client's update — must win even over a completed local
    // mutation.
    const applyBufferedEvents = (events: RealtimeOrderEvent[]) => {
      const store = useOrderStore.getState()

      for (const event of events) {
        switch (event.type) {
          case 'upsert': {
            const { id } = event.order

            if (orderOptimistic.hasPending(id)) {
              continue
            }

            const current = store.ordersById[id]

            if (current && current.version >= event.order.version) {
              continue
            }

            store.upsertOrder(event.order)
            break
          }
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
      // snapshot read and are already covered by it). The mutation marker
      // records which optimistic mutations may span the snapshot's lifetime:
      // their records must survive the commit even when no realtime event
      // mentions them (e.g. the WS echo has not arrived yet).
      flushBatched()
      const snapshotMarker = orderOptimistic.captureSnapshotMarker()
      eventBuffer.beginReconciliation()

      try {
        const nextOrders = await orderRepository.list('all')

        if (isDisposed) {
          return
        }

        // The snapshot is the base state; buffered events are newer and win.
        // Records for mutations that overlap this snapshot's lifetime are
        // re-applied so the snapshot cannot clobber them — but a buffered
        // event with a strictly newer server version still wins (overlay
        // only guards against the stale snapshot itself).
        const events = eventBuffer.endReconciliation()
        setOrders(
          overlayOptimisticRecords(
            reconcileSnapshotWithEvents(nextOrders, events),
            orderOptimistic.idsToProtect(snapshotMarker),
            events,
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

              // Batched upserts for the same id consolidate on the highest
              // version at insertion: within one batch a delayed stale event
              // must not displace the newer event it trails.
              const queued = pendingUpserts.get(order.id)
              if (!queued || order.version > queued.version) {
                pendingUpserts.set(order.id, order)
              }

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
