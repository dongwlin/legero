import { useCallback, useEffect, useRef, useState } from 'react'
import { orderRepository } from '@/services/orderRepository'
import {
  orderRealtime,
  type OrderRealtimeSubscription,
} from '@/services/orderRealtime'
import {
  applyLocalRemoveEffects,
  applyLocalUpsertEffects,
  confirmedRemoveIds,
  createOrderEventBuffer,
  reconcileSnapshotWithEvents,
  type RealtimeOrderEvent,
} from '@/services/orderReconcile'
import { isOrderCreatedToday } from '@/services/orderDomainUtils'
import { orderOptimistic } from '@/services/orderOptimistic'
import { orderTombstones } from '@/services/orderTombstones'
import { subscribeOrdersResync } from '@/services/orderResync'
import type { ClearWorkspaceMode } from '@/services/apiTypes'
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
  // Workspace the last sync session was opened for, so a switch to another
  // workspace is detected and the session-wide registries are reset.
  const lastActiveWorkspaceIdRef = useRef<string | null>(null)

  const retrySync = useCallback(() => {
    setRefreshKey((current) => current + 1)
  }, [])

  useEffect(() => {
    if (authStatus !== 'authenticated' || !activeWorkspaceId) {
      resetSyncState()
      // The sync session is over: drop the session-wide registries so a
      // later session starts clean (ids are never reused, so this only
      // bounds memory — it cannot reopen a resurrection window).
      orderTombstones.reset()
      orderOptimistic.reset()
      lastActiveWorkspaceIdRef.current = null
      return
    }

    // A workspace switch is a new sync session: drop the terminally-deleted
    // id registry and the local mutation journal of the previous workspace
    // (ids are never reused, so this only bounds memory).
    if (lastActiveWorkspaceIdRef.current !== activeWorkspaceId) {
      orderTombstones.reset()
      orderOptimistic.reset()
      lastActiveWorkspaceIdRef.current = activeWorkspaceId
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
    // Ids received in the current reconciliation window before its first
    // clear event: they existed before the clear (the channel is ordered), so
    // at the clear's receipt they are known to predate it and a full clear
    // terminally deletes them. Reset per window (see syncSnapshot).
    let windowPreClearIds = new Set<string>()
    let windowSawClear = false

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
      // A remove that confirmed while the upsert was already queued — via a
      // realtime event, a clear event or a local DELETE — tombstones the id
      // session-wide (or, for a before_today clear, the creation date marks
      // it stale), so the queued event is dropped instead of resurrecting
      // the order from an empty store slot.
      const upserts = Array.from(upsertsById.values()).filter(
        (order) => !orderTombstones.rejectsUpsert(order),
      )
      const removes = Array.from(pendingRemoves.values())
      pendingRemoves.clear()

      const store = useOrderStore.getState()

      // Authoritative merge: only a strictly newer server version is applied
      // (an equal version is the same commit and a lower one is stale). The
      // optimistic record of a pending mutation keeps the pre-mutation server
      // version, so it is version-comparable too and cannot shield a newer
      // authoritative event from another client.
      store.upsertOrdersIfNewer(upserts)

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
    // lifetime. The comparison runs exclusively by server `version` against
    // the full reconciled candidate (snapshot + buffered realtime): the store
    // record of a mutation — pending or settled — keeps a version the snapshot
    // must not downgrade, but a reconciled state with a strictly higher
    // version (e.g. another client committed after ours, or the snapshot was
    // read from a state newer than the mutation's base) stays authoritative.
    // An equal version means the same server commit and the local record
    // survives (it may carry client-only detail such as a rollback target).
    // Orders the buffered events themselves removed (remove/clear) are absent
    // from the reconciled list and stay removed.
    const overlayProtectedRecords = (
      orders: OrderRecord[],
      protectedIds: ReadonlySet<string>,
    ): OrderRecord[] => {
      if (protectedIds.size === 0) {
        return orders
      }

      const store = useOrderStore.getState()
      const ordersById = new Map(orders.map((order) => [order.id, order]))

      for (const id of protectedIds) {
        const optimistic = store.ordersById[id]
        const authoritative = ordersById.get(id)

        if (!optimistic || !authoritative) {
          continue
        }

        if (authoritative.version <= optimistic.version) {
          ordersById.set(id, optimistic)
        }
      }

      return [...ordersById.values()]
    }

    // A clear is a terminal delete of the orders it removes at the moment it
    // is received: ids the client currently knows must be blocked so a
    // delayed stale upsert of any of them — arriving via the batch queue, the
    // reconciliation buffer or a late HTTP response — can never resurrect an
    // order the server already deleted (the backend never reuses an order
    // id). The clear payload carries no deleted-id list, so only the
    // client-known ids can be covered here. A full 'all' clear parks them on
    // the pending barrier (blockPendingClear) instead of tombstoning them: a
    // store record is NOT causally ordered against the clear — HTTP and
    // WebSocket are independent transports, so it may be a post-clear
    // creation whose response merely arrived first — and only the
    // guaranteed-post-clear follow-up snapshot can tell (absent from it ->
    // confirmed deleted, present -> a genuine survivor, released; see
    // orderTombstones.confirmClearEpoch). A 'before_today' clear tombstones
    // every known order not created today (the server keeps today's orders);
    // the date-based guard closes the rest of that window. The
    // reconciliation-window compaction and the before_today date guard cover
    // the remaining resurrection sources (see compactRealtimeEvents).
    const tombstoneClearedIds = (mode: ClearWorkspaceMode) => {
      const store = useOrderStore.getState()

      if (mode === 'all') {
        for (const id of Object.keys(store.ordersById)) {
          orderTombstones.blockPendingClear(id)
        }
        return
      }

      for (const [id, order] of Object.entries(store.ordersById)) {
        if (!isOrderCreatedToday(order)) {
          orderTombstones.markRemoved(id)
        }
      }
    }

    // Applies a clear event's semantics to the store: 'all' empties the
    // workspace, 'before_today' keeps only orders created on the current
    // business day (the server deleted everything older). Both register the
    // terminal deletion barrier for the ids the client knows before the
    // store is touched, so a later stale statement for any of them is
    // dropped at the gates instead of being applied to the (now empty or
    // filtered) store slots. A full clear additionally opens the clear epoch
    // barrier: ids whose existence is only learned later — through the
    // in-flight snapshot base — may still predate the clear, and they stay
    // blocked until a post-clear snapshot confirms the cleared state.
    const applyClearToStore = (mode: ClearWorkspaceMode) => {
      const store = useOrderStore.getState()

      if (mode === 'all') {
        tombstoneClearedIds('all')
        orderTombstones.bumpClearEpoch()
        store.clearOrders()
        return
      }

      tombstoneClearedIds('before_today')
      orderTombstones.markBeforeTodayClear()

      store.setOrders(
        Object.values(store.ordersById).filter((order) => isOrderCreatedToday(order)),
      )
    }

    // Failure recovery for a failed snapshot: buffered events must not be
    // dropped — apply them as ordinary updates on top of whatever the store
    // currently holds, then surface the error. The next successful
    // reconciliation (retry or reconnect) restores the full server state.
    // Upserts go through the authoritative merge: only a strictly higher
    // server version than the store's record is applied. The optimistic
    // record of a still-pending mutation keeps the pre-mutation server
    // version, so it cannot shield a newer authoritative event — a client
    // that committed after ours must win even while our mutation is pending.
    const applyBufferedEvents = (events: RealtimeOrderEvent[]) => {
      const store = useOrderStore.getState()

      for (const event of events) {
        switch (event.type) {
          case 'upsert':
            // A tombstoned id (or a not-created-today order after a
            // before_today clear) is terminally deleted for the whole
            // session: a buffered stale upsert must not resurrect it during
            // failure replay either.
            if (!orderTombstones.rejectsUpsert(event.order)) {
              store.upsertIfNewer(event.order)
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
      // snapshot read and are already covered by it). The mutation marker
      // records which local mutations — pending optimistic toggles and
      // confirmed form updates, creates or deletes — may span the snapshot's
      // lifetime: they must survive the commit even when no realtime event
      // mentions them (e.g. the WS echo has not arrived yet).
      flushBatched()
      const snapshotMarker = orderOptimistic.captureSnapshotMarker()
      eventBuffer.beginReconciliation()
      // Per-window clear-barrier bookkeeping: ids received before this
      // window's first clear are known to predate it (see onClear), and the
      // epoch value captured here decides at commit time whether this
      // snapshot is guaranteed post-clear — a snapshot requested after the
      // clear event was received — and may confirm the barrier.
      windowPreClearIds = new Set()
      windowSawClear = false
      const clearEpochAtStart = orderTombstones.clearEpochValue()

      try {
        const nextOrders = await orderRepository.list('all')

        if (isDisposed) {
          return
        }

        // The snapshot is the base state. On top of it the commit replays the
        // sources that are newer than the snapshot read, in ascending age:
        // first the confirmed local upserts that overlapped the snapshot's
        // lifetime (their authoritative HTTP responses are known even when
        // the WS echo is not — form updates and creates included), then the
        // buffered realtime events, which stay the newest server statements.
        // Confirmed local removes are applied last, as terminal tombstones:
        // a delete that confirmed during the snapshot must stay absent even
        // when a buffered realtime upsert predates it — HTTP responses and
        // WebSocket events are independent transport paths, and the backend
        // never reuses an order id, so no upsert can outlive a confirmed
        // delete of the same id. Records for mutations that are still only
        // pending (not confirmed, hence absent from the effects journal) are
        // re-applied last by version against the reconciled candidate, so a
        // strictly higher authoritative state still wins while a stale
        // snapshot never clobbers the local record.
        const events = eventBuffer.endReconciliation()
        const effects = orderOptimistic.effectsAfter(snapshotMarker)

        const reconciled = applyLocalRemoveEffects(
          reconcileSnapshotWithEvents(
            applyLocalUpsertEffects(nextOrders, effects),
            events,
          ),
          effects,
        )
        const protectedOrders = overlayProtectedRecords(
          reconciled,
          orderOptimistic.idsToProtect(snapshotMarker),
        )

        // A snapshot requested after the clear event was received reflects
        // the post-clear server state (the clear committed before its event
        // was broadcast), so it confirms the clear epoch: pending ids it does
        // not contain were terminally deleted by the clear and become
        // permanent tombstones, while ids it contains lived through the clear
        // and are released. A snapshot already in flight when the clear
        // arrived (`clearEpochAtStart` predates the bump) may carry pre-clear
        // state and must not confirm — its base ids keep riding the pending
        // barrier until the follow-up lands.
        if (
          orderTombstones.isClearEpochOpen() &&
          orderTombstones.clearEpochValue() === clearEpochAtStart
        ) {
          orderTombstones.confirmClearEpoch(
            new Set(protectedOrders.map((order) => order.id)),
          )
        }

        setOrders(
          protectedOrders.filter((order) => !orderTombstones.rejectsUpsert(order)),
        )
      } catch (error) {
        if (isDisposed) {
          return
        }

        applyBufferedEvents(eventBuffer.endReconciliation())

        // Buffered upserts must not resurrect an id the client already
        // deleted: confirmed local removes are terminal tombstones and are
        // re-applied last, over whatever the failure replay inserted (the
        // backend never reuses an order id, so no upsert can outlive a
        // confirmed delete of the same id).
        const store = useOrderStore.getState()

        for (const id of confirmedRemoveIds(
          orderOptimistic.effectsAfter(snapshotMarker),
        )) {
          store.removeOrder(id)
        }

        if (shouldBlock) {
          setHydrationState({
            status: 'error',
            errorMessage: getErrorMessage(error),
          })
        }
      } finally {
        syncInFlight = false
        // The snapshot settled: effects and protection stamps older than
        // its marker can never overlap a future snapshot (every later
        // marker is >= this one), so prune them to bound the mutation
        // journal to the current snapshot window instead of the whole
        // session. No snapshot is in flight here — the follow-up
        // reconciliation, if any, captures a fresh marker afterwards.
        orderOptimistic.prune(snapshotMarker)
      }

      if (pendingReconcile) {
        pendingReconcile = false
        const nextShouldBlock = pendingReconcileShouldBlock
        pendingReconcileShouldBlock = false
        void syncSnapshot(nextShouldBlock)
      }
    }

    // Authoritative-state invalidation (e.g. a mutation rejected with
    // 409 order_conflict elsewhere in the UI) requests a fresh
    // reconciliation: the same buffer-and-replay mechanism as a reconnect
    // guarantees realtime events received during the fetch still win.
    const stopResyncSubscription = subscribeOrdersResync(() => {
      if (!isDisposed) {
        void syncSnapshot(useOrderStore.getState().status !== 'ready')
      }
    })

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
              // Same-id remove and clear are terminal for the whole sync
              // session — not just inside a reconciliation window: an upsert
              // of a tombstoned id (the backend never reuses an order id) is
              // always a stale/delayed event; after a before_today clear the
              // same holds for any not-created-today upsert. Both are dropped
              // before they can enter the buffer or the batch queue.
              if (orderTombstones.rejectsUpsert(order)) {
                return
              }

              if (eventBuffer.isReconciling) {
                // Buffer the server event: at commit time it is replayed over
                // the snapshot with version-aware merges, so it survives even
                // when the order has an in-flight optimistic mutation. Ids
                // received before this window's first clear are remembered —
                // they predate the clear (the channel is ordered) and a full
                // clear terminally deletes them at its receipt.
                if (!windowSawClear) {
                  windowPreClearIds.add(order.id)
                }
                eventBuffer.push({ type: 'upsert', order })
                return
              }

              // No pending gate: while a mutation is pending the optimistic
              // record keeps the pre-mutation server version, so the flush's
              // version comparison still accepts a strictly newer event
              // (another client's commit) and rejects echoes/stale events.
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
              // Register the terminal tombstone immediately — before the
              // event enters the buffer or the batch queue — so no later
              // statement for the id can resurrect it: a queued upsert of
              // the same id is dropped right here, and future upserts are
              // rejected at the onUpsert gate.
              orderTombstones.markRemoved(id)
              pendingUpserts.delete(id)

              if (eventBuffer.isReconciling) {
                // Same pre-clear-window bookkeeping as onUpsert: the removed
                // id existed before a clear that may follow in this window.
                if (!windowSawClear) {
                  windowPreClearIds.add(id)
                }
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
                // keeps part of the list). Client-known ids are tombstoned at
                // receipt — not at replay — so a stale delayed upsert of a
                // cleared id that arrives later in the window is dropped at
                // the onUpsert gate instead of entering the buffer. Ids
                // received earlier in this window arrived before the clear
                // over the ordered channel, so they existed pre-clear too.
                windowSawClear = true

                if (event.mode === 'all') {
                  tombstoneClearedIds('all')

                  for (const id of windowPreClearIds) {
                    orderTombstones.markRemoved(id)
                  }

                  // Open the full-clear epoch barrier: ids only discovered
                  // later — like the in-flight snapshot base, whose ids the
                  // reconciliation parks via blockPendingClear — may still
                  // predate the clear and stay blocked until a post-clear
                  // snapshot confirms the cleared state.
                  orderTombstones.bumpClearEpoch()
                } else {
                  tombstoneClearedIds('before_today')
                  orderTombstones.markBeforeTodayClear()
                }

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

      stopResyncSubscription?.()

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
