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
 * Module-level singleton shared by the workspace sync hook (realtime path)
 * and the mutation layer (local delete confirmation). reset() is called when
 * the sync session ends (no authenticated workspace) or the workspace
 * changes; ids are never reused, so dropping the registry merely bounds
 * memory without reopening any resurrection window.
 */
const removedOrderIds = new Set<string>()

let beforeTodayCleared = false

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
   * True when an upsert of `order` must not be accepted this session: its id
   * is terminally deleted (realtime remove, clear, confirmed local DELETE),
   * or a `before_today` clear deleted every not-created-today order. Used by
   * every upsert gate — the realtime handler, the rAF batch flush, the
   * reconciliation commit filter, the failure replay and the late mutation
   * response paths — so a stale statement can never resurrect a deleted
   * order at any layer.
   */
  rejectsUpsert(order: OrderRecord): boolean {
    return (
      removedOrderIds.has(order.id) ||
      (beforeTodayCleared && !isOrderCreatedToday(order))
    )
  },

  /** Drops all tombstones (workspace sync session teardown). */
  reset(): void {
    removedOrderIds.clear()
    beforeTodayCleared = false
  },
}