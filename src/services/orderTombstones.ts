import { isOrderCreatedToday } from '@/services/orderDomainUtils'
import type { OrderRecord } from '@/types'

/**
 * Terminal tombstones for order ids confirmed deleted during a workspace sync
 * session.
 *
 * The Legero backend never reuses an order id (orders are created with a
 * fresh uuid), so once an id is deleted — by a realtime `order.deleted`
 * event, by a clear event, or by a confirmed local DELETE — every later
 * statement for it is a stale, delayed event and must not resurrect the
 * order. Tombstones are therefore a session-wide invariant, not a
 * reconciliation-window concept: they guard the normal realtime path, the
 * rAF batch queue, the snapshot reconciliation buffer, the snapshot commit
 * and the mutation HTTP completion/rollback paths alike (a late mutation
 * response or a failure rollback must not resurrect a tombstoned id), so
 *
 *   remove/clear -> upsert (any version) => absent
 *
 * holds everywhere, exactly like it already holds inside one buffered
 * reconciliation window (see compactRealtimeEvents).
 *
 * A `clear(before_today)` deletes every order created before the current
 * business day; because an upsert carries its own `createdAt`, that clear's
 * barrier needs no per-id bookkeeping — once the clear has been processed,
 * any later statement about a not-created-today order is stale by
 * construction (the server deletes those orders and never recreates an id),
 * so `rejectsUpsert` also checks the creation date.
 *
 * A full `clear(all)` is a terminal delete of every id that existed at clear
 * time, but the client cannot name all of them up front: ids only discovered
 * later — through the reconciliation buffer or the in-flight snapshot base,
 * or already present in the store from an HTTP response that crossed the
 * clear event — are learned from sources that are not causally ordered
 * against the clear (HTTP and WebSocket are independent transports, so a
 * store record may even be a post-clear creation that merely arrived first).
 * While a follow-up (guaranteed post-clear) snapshot is pending, those ids
 * ride the clear epoch as *pending* tombstones (`pendingClearedIds`, see
 * bumpClearEpoch / confirmClearEpoch) and are rejected by `rejectsUpsert`
 * exactly like confirmed ones; the follow-up then promotes the ones it does
 * not contain to terminal tombstones and releases (and lifts the barrier
 * for) the ones it does contain. This keeps the barrier session-wide instead
 * of letting it die with a single reconciliation, while still letting a
 * post-clear creation that the follow-up confirms survive.
 *
 * Module-level singleton shared by the workspace sync hook (realtime path)
 * and the mutation layer (local delete confirmation). reset() is called when
 * the sync session ends (no authenticated workspace) or the workspace
 * changes; ids are never reused, so dropping the registry merely bounds
 * memory without reopening any resurrection window.
 */
const removedOrderIds = new Set<string>()

let beforeTodayCleared = false

// --- full-clear epoch barrier ---
let clearEpoch = 0
let clearEpochOpen = false
const pendingClearedIds = new Set<string>()

export const orderTombstones = {
  /** Marks the id as terminally deleted for the rest of the sync session. */
  markRemoved(id: string): void {
    removedOrderIds.add(id)
  },

  /** True when the id was terminally deleted in this sync session. */
  has(id: string): boolean {
    return removedOrderIds.has(id)
  },

  /**
   * Registers that a `before_today` clear was processed this session: from
   * then on, `rejectsUpsert` drops every upsert of an order that was not
   * created today (the server deleted those orders and never recreates an
   * id).
   */
  markBeforeTodayClear(): void {
    beforeTodayCleared = true
  },

  /** True when a `before_today` clear was processed this session. */
  isBeforeTodayCleared(): boolean {
    return beforeTodayCleared
  },

  /**
   * Opens a new full-clear epoch and returns its value. Called when a
   * `clear(all)` event is received, so from that moment ids whose existence
   * is only learned through pre-clear sources (buffered events, in-flight
   * snapshot base) are parked by blockPendingClear and blocked while the
   * epoch is open. A snapshot started after the clear event was received is
   * guaranteed post-clear and closes the epoch via confirmClearEpoch.
   */
  bumpClearEpoch(): number {
    clearEpoch += 1
    clearEpochOpen = true
    return clearEpoch
  },

  /** The current epoch value: snapshots capture it to know which are post-clear. */
  clearEpochValue(): number {
    return clearEpoch
  },

  /** True while a full clear awaits its post-clear confirmation snapshot. */
  isClearEpochOpen(): boolean {
    return clearEpochOpen
  },

  /**
   * Parks an id that may have existed before the open full clear as a pending
   * tombstone: while the epoch is open, `rejectsUpsert` rejects it like a
   * confirmed tombstone, so a stale delayed upsert cannot resurrect it in a
   * later reconciliation window either.
   */
  blockPendingClear(id: string): void {
    pendingClearedIds.add(id)
  },

  /**
   * Closes the open epoch after a snapshot confirmed to be post-clear lands.
   * Pending ids the snapshot does not contain were terminally deleted by the
   * clear and become permanent tombstones; pending ids it does contain lived
   * through the clear (a post-clear creation) and are released. Has no effect
   * when no epoch is open.
   */
  confirmClearEpoch(confirmedIds: ReadonlySet<string>): void {
    if (!clearEpochOpen) {
      return
    }

    for (const id of pendingClearedIds) {
      if (!confirmedIds.has(id)) {
        removedOrderIds.add(id)
      }
    }

    pendingClearedIds.clear()
    clearEpochOpen = false
  },

  /**
   * True when an upsert of `order` must not be accepted this session: its id
   * is terminally deleted (realtime remove, confirmed local DELETE), it may
   * have been deleted by an unconfirmed full clear (pending epoch tombstone),
   * or a `before_today` clear deleted every not-created-today order. Used by
   * every upsert gate — the realtime handler, the rAF batch flush, the
   * reconciliation commit filter, the failure replay and the late mutation
   * response paths — so a stale statement can never resurrect a deleted
   * order at any layer.
   */
  rejectsUpsert(order: OrderRecord): boolean {
    return (
      removedOrderIds.has(order.id) ||
      pendingClearedIds.has(order.id) ||
      (beforeTodayCleared && !isOrderCreatedToday(order))
    )
  },

  /** Drops all tombstones (workspace sync session teardown). */
  reset(): void {
    removedOrderIds.clear()
    beforeTodayCleared = false
    pendingClearedIds.clear()
    clearEpochOpen = false
    clearEpoch = 0
  },
}