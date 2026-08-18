import { useCallback, useEffect, useRef, useState } from 'react'
import { orderRepository } from '@/services/orderRepository'
import {
  createRealtimeDiagnostics,
  type RealtimeDiagnostics,
  type RealtimeDiagnosticsSnapshot,
  type SnapshotReconciliationOutcome,
} from '@/services/realtimeDiagnostics'
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
  type ClearRealtimeEvent,
  type RealtimeOrderEvent,
} from '@/services/orderReconcile'
import { getOrderDateKey } from '@/services/orderDomainUtils'
import {
  orderOptimistic,
  type LocalMutationEffect,
} from '@/services/orderOptimistic'
import { orderTombstones } from '@/services/orderTombstones'
import { subscribeOrdersResync } from '@/services/orderResync'
import type { OrdersClearedEvent } from '@/services/apiTypes'
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
  const diagnosticsRef = useRef<RealtimeDiagnostics | null>(null)
  // Workspace the last sync session was opened for, so a switch to another
  // workspace is detected and the session-wide registries are reset.
  const lastActiveWorkspaceIdRef = useRef<string | null>(null)

  const retrySync = useCallback(() => {
    setRefreshKey((current) => current + 1)
  }, [])

  useEffect(() => {
    if (authStatus !== 'authenticated' || !activeWorkspaceId) {
      diagnosticsRef.current = null
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
    const diagnostics = createRealtimeDiagnostics()
    diagnosticsRef.current = diagnostics

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
    // clear event. WebSocket arrival order is not a cross-request commit
    // sequence, so these ids are only ambiguous candidates for the pending
    // clear barrier; they are never promoted directly to permanent
    // tombstones. Reset per window (see syncSnapshot).
    let windowPreClearIds = new Set<string>()
    // Keep the newest upsert seen before a clear in this reconciliation
    // window. compactRealtimeEvents intentionally drops the pre-clear prefix
    // after a full clear, but that compaction cannot decide whether the
    // statement itself was pre- or post-clear without a server sequence. The
    // clear epoch's guaranteed follow-up snapshot makes that decision later.
    const windowPreClearUpserts = new Map<string, OrderRecord>()
    let windowSawClear = false
    // Upserts for ids parked on a full-clear barrier are not ordinary stale
    // events: a guaranteed post-clear snapshot may prove that the id survived.
    // Retain the newest statement until that raw snapshot decides whether to
    // discard it or replay it over the surviving record.
    const pendingClearUpserts = new Map<string, OrderRecord>()

    const stagePendingClearUpsert = (order: OrderRecord) => {
      if (!orderTombstones.isPendingClear(order.id)) {
        return
      }

      const current = pendingClearUpserts.get(order.id)

      if (!current || order.version > current.version) {
        pendingClearUpserts.set(order.id, order)
      }
    }

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

    // Replays the upserts that were parked behind a full-clear barrier only
    // after the guaranteed post-clear snapshot has made its raw-ID decision.
    // Presence in the raw snapshot is the survivor proof; the replayed
    // statement may then win by server version, but it can never resurrect a
    // confirmed local remove or an id promoted to a permanent tombstone.
    const replayConfirmedPendingClearUpserts = (
      orders: OrderRecord[],
      rawSnapshotIds: ReadonlySet<string>,
      effects: LocalMutationEffect[],
    ): OrderRecord[] => {
      if (pendingClearUpserts.size === 0) {
        return orders
      }

      const confirmedRemoveIdsSet = new Set(confirmedRemoveIds(effects))
      const ordersById = new Map(orders.map((order) => [order.id, order]))

      for (const [id, pendingOrder] of pendingClearUpserts) {
        if (
          !rawSnapshotIds.has(id) ||
          confirmedRemoveIdsSet.has(id) ||
          orderTombstones.rejectsUpsert(pendingOrder)
        ) {
          continue
        }

        const current = ordersById.get(id)

        if (!current || pendingOrder.version > current.version) {
          ordersById.set(id, pendingOrder)
        }
      }

      // The epoch has been closed, so every staged statement has now been
      // classified. Do not carry a stale pre-clear record into a later epoch.
      pendingClearUpserts.clear()

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
    // every known order created before its pinned business-day cutoff (the
    // server keeps orders created on or after that day); the date guard
    // closes the rest of that window. The reconciliation-window compaction
    // and the before_today date guard cover the remaining resurrection
    // sources (see compactRealtimeEvents).
    // A before_today clear is a terminal delete of every order created
    // before its pinned business-day cutoff: ids the client currently knows
    // from that range are tombstoned at receipt, so a delayed stale upsert
    // of any of them — via the batch queue, the reconciliation buffer or a
    // late HTTP response — can never resurrect an order the server already
    // deleted (the backend never reuses an order id).
    const tombstoneBeforeTodayIds = (clearDateKey: string) => {
      const store = useOrderStore.getState()

      for (const [id, order] of Object.entries(store.ordersById)) {
        if (getOrderDateKey(order.createdAt) < clearDateKey) {
          orderTombstones.markRemoved(id)
        }
      }
    }

    // Builds the in-memory clear event, pinning a before_today clear's
    // cutoff to the business-day key the SERVER used when it executed the
    // clear (carried in the payload). The receipt time is not the
    // authoritative boundary — the server may have executed the clear just
    // before midnight while the WebSocket event only arrives after it, and a
    // skewed client clock would pin the wrong day — so the server key is
    // used verbatim. Only when the payload omits it (older server without
    // the field) does the receipt-time key step in as a best-effort
    // approximation.
    const buildClearEvent = (raw: OrdersClearedEvent): ClearRealtimeEvent =>
      raw.mode === 'all'
        ? { type: 'clear', mode: 'all' }
        : {
            type: 'clear',
            mode: 'before_today',
            clearDateKey: raw.clearDateKey ?? getOrderDateKey(new Date()),
          }

    // Applies a clear event's semantics to the store: 'all' empties the
    // workspace, 'before_today' keeps only orders created on or after the
    // event's pinned business-day cutoff (the server deleted everything
    // older). Both register the terminal deletion barrier for the ids the
    // client knows before the store is touched, so a later stale statement
    // for any of them is dropped at the gates instead of being applied to
    // the (now empty or filtered) store slots. A full clear additionally
    // opens the clear epoch barrier: ids whose existence is only learned
    // later — through the in-flight snapshot base or a response that crossed
    // the clear event — may still predate the clear, and they stay blocked
    // until a post-clear snapshot confirms the cleared state.
    const applyClearToStore = (clearEvent: ClearRealtimeEvent) => {
      const store = useOrderStore.getState()

      if (clearEvent.mode === 'all') {
        for (const id of Object.keys(store.ordersById)) {
          orderTombstones.blockPendingClear(id)
        }
        orderTombstones.bumpClearEpoch()
        store.clearOrders()
        return
      }

      tombstoneBeforeTodayIds(clearEvent.clearDateKey)
      orderTombstones.markBeforeTodayClear(clearEvent.clearDateKey)

      store.setOrders(
        Object.values(store.ordersById).filter(
          (order) => getOrderDateKey(order.createdAt) >= clearEvent.clearDateKey,
        ),
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
            // A tombstoned id (or an order created before a before_today
            // clear's pinned cutoff) is terminally deleted for the whole
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
            // The buffered event carries the before_today cutoff pinned at
            // receipt, so replaying it applies the same semantics even when
            // the clock has since moved past the clear's business day.
            applyClearToStore(event)
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
      diagnostics.beginSnapshotReconciliation()

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
      windowPreClearUpserts.clear()
      windowSawClear = false
      const clearEpochAtStart = orderTombstones.clearEpochValue()
      let snapshotOutcome: SnapshotReconciliationOutcome = 'cancelled'

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
        // Only the raw guaranteed-post-clear snapshot can decide whether a
        // pending id survived. Local mutation effects, buffered realtime
        // events and optimistic overlays are intentionally excluded from this
        // set: replaying one of them must never be allowed to prove its own
        // survivor status (P1-2).
        const rawSnapshotIds = new Set(nextOrders.map((order) => order.id))
        const protectedIds = orderOptimistic.idsToProtect(snapshotMarker)

        // A mutation response/optimistic record can become visible through a
        // local journal after the clear event, without ever passing through
        // the realtime gate. Park those candidates before the raw snapshot
        // makes its decision as well; otherwise applying the effect first
        // could make an absent id look like a survivor (P1-2).
        if (orderTombstones.isClearEpochOpen()) {
          for (const id of protectedIds) {
            orderTombstones.blockPendingClear(id)
          }

          for (const effect of effects) {
            if (effect.type === 'upsert') {
              orderTombstones.blockPendingClear(effect.order.id)
            }
          }
        }

        const confirmsClearEpoch =
          orderTombstones.isClearEpochOpen() &&
          orderTombstones.clearEpochValue() === clearEpochAtStart

        // A snapshot requested after the clear event was received reflects
        // the post-clear server state (the clear committed before its event
        // was broadcast), so it confirms the clear epoch: pending ids it does
        // not contain were terminally deleted by the clear and become
        // permanent tombstones, while ids it contains lived through the clear
        // and are released. A snapshot already in flight when the clear
        // arrived (`clearEpochAtStart` predates the bump) may carry pre-clear
        // state and must not confirm — its base ids keep riding the pending
        // barrier until the follow-up lands.
        if (confirmsClearEpoch) {
          orderTombstones.confirmClearEpoch(rawSnapshotIds)
        }

        let reconciled = applyLocalRemoveEffects(
          reconcileSnapshotWithEvents(
            applyLocalUpsertEffects(nextOrders, effects),
            events,
          ),
          effects,
        )

        // The raw snapshot has already classified the pending IDs. Only now
        // can their staged realtime statements be replayed, and only for raw
        // survivors. Version ordering still applies so a stale staged event
        // cannot downgrade a newer snapshot/effect.
        if (confirmsClearEpoch) {
          reconciled = replayConfirmedPendingClearUpserts(
            reconciled,
            rawSnapshotIds,
            effects,
          )
        }

        const protectedOrders = overlayProtectedRecords(
          reconciled,
          protectedIds,
        )

        setOrders(
          protectedOrders.filter((order) => !orderTombstones.rejectsUpsert(order)),
        )
        snapshotOutcome = 'success'
      } catch (error) {
        if (isDisposed) {
          return
        }

        snapshotOutcome = 'failure'

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
        if (isDisposed) {
          snapshotOutcome = 'cancelled'
        }
        diagnostics.finishSnapshotReconciliation(snapshotOutcome)
        syncInFlight = false
        // The snapshot settled: effects and protection stamps older than
        // its marker can never overlap a future snapshot (every later
        // marker is >= this one), so prune them to bound the mutation
        // journal to the current snapshot window instead of the whole
        // session. No snapshot is in flight here — the follow-up
        // reconciliation, if any, captures a fresh marker afterwards.
        orderOptimistic.prune(snapshotMarker)
      }

      if (pendingReconcile && !isDisposed) {
        pendingReconcile = false
        const nextShouldBlock = pendingReconcileShouldBlock
        pendingReconcileShouldBlock = false
        void syncSnapshot(nextShouldBlock)
      } else if (isDisposed) {
        pendingReconcile = false
        pendingReconcileShouldBlock = false
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

    // Single and compact batch upserts share one gate so tombstones,
    // reconciliation buffering and the normal rAF queue have identical
    // semantics. A batch only schedules one frame after all of its valid
    // records have been consolidated by id and version.
    const handleUpserts = (orders: readonly OrderRecord[]) => {
      if (isDisposed || orders.length === 0) {
        return
      }

      let queuedUpsert = false

      for (const order of orders) {
        // A pending full-clear id is unresolved ambiguity, not a terminal
        // tombstone. Retain its newest realtime statement for the guaranteed
        // post-clear snapshot to classify; dropping it here would lose a
        // legitimate post-clear update (P1-1).
        if (orderTombstones.isPendingClear(order.id)) {
          stagePendingClearUpsert(order)
          continue
        }

        // Same-id remove and clear-confirmed ids are terminal for the whole
        // sync session — not just inside a reconciliation window. An upsert
        // of a tombstoned id (the backend never reuses an order id) is always
        // a stale/delayed event; after a before_today clear the same holds for
        // any not-created-today upsert. Both are dropped before they can enter
        // the buffer or the batch queue.
        if (orderTombstones.rejectsUpsert(order)) {
          continue
        }

        if (eventBuffer.isReconciling) {
          // Buffer the server event: at commit time it is replayed over the
          // snapshot with version-aware merges, so it survives even when the
          // order has an in-flight optimistic mutation. Ids received before
          // this window's first clear are remembered as ambiguous candidates;
          // WS arrival order is not a global cross-request commit sequence.
          if (!windowSawClear) {
            windowPreClearIds.add(order.id)
            const previous = windowPreClearUpserts.get(order.id)

            if (!previous || order.version > previous.version) {
              windowPreClearUpserts.set(order.id, order)
            }
          }
          eventBuffer.push({ type: 'upsert', order })
          continue
        }

        // No pending gate: while a mutation is pending the optimistic record
        // keeps the pre-mutation server version, so the flush's version
        // comparison still accepts a strictly newer event (another client's
        // commit) and rejects echoes/stale events. Batched upserts for the
        // same id consolidate on the highest version at insertion.
        const queued = pendingUpserts.get(order.id)
        if (!queued || order.version > queued.version) {
          pendingUpserts.set(order.id, order)
          queuedUpsert = true
        }
      }

      if (queuedUpsert) {
        scheduleBatchFlush()
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
          diagnostics,
          onUpsert: (order) => handleUpserts([order]),
          onUpsertMany: handleUpserts,
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
                // keeps part of the list). Client-known ids are parked at
                // receipt — not promoted to permanent tombstones — so a
                // later upsert can be retained until the raw follow-up
                // snapshot decides survivor vs deletion. Ids received earlier
                // in this window are equally ambiguous: WS arrival order is
                // not a cross-request commit sequence (P1-3).
                windowSawClear = true

                // Pin the before_today cutoff to the SERVER's own business
                // day (buildClearEvent), so the replay (this window and the
                // failure-replay path) judges orders against the day the
                // clear actually happened, not the receipt time.
                const clearEvent = buildClearEvent(event)

                if (clearEvent.mode === 'all') {
                  for (const id of Object.keys(useOrderStore.getState().ordersById)) {
                    orderTombstones.blockPendingClear(id)
                  }

                  for (const id of windowPreClearIds) {
                    orderTombstones.blockPendingClear(id)
                  }

                  for (const order of windowPreClearUpserts.values()) {
                    stagePendingClearUpsert(order)
                  }

                  // Open the full-clear epoch barrier: ids only discovered
                  // later — like the in-flight snapshot base, whose ids the
                  // reconciliation parks via blockPendingClear — may still
                  // predate the clear and stay blocked until a post-clear
                  // snapshot confirms the cleared state.
                  orderTombstones.bumpClearEpoch()
                } else {
                  tombstoneBeforeTodayIds(clearEvent.clearDateKey)
                  orderTombstones.markBeforeTodayClear(clearEvent.clearDateKey)
                }

                eventBuffer.push(clearEvent)
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

              const clearEvent = buildClearEvent(event)
              applyClearToStore(clearEvent)
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
    getDiagnostics: (): RealtimeDiagnosticsSnapshot | null =>
      diagnosticsRef.current?.getSnapshot() ?? null,
  }
}
