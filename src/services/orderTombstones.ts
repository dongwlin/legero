/**
 * Terminal tombstones for order ids confirmed deleted during a workspace sync
 * session.
 *
 * The Legero backend never reuses an order id (orders are created with a
 * fresh uuid), so once an id is deleted — by a realtime `order.deleted`
 * event or by a confirmed local DELETE — every later statement for it is a
 * stale, delayed event and must not resurrect the order. Tombstones are
 * therefore a session-wide invariant, not a reconciliation-window concept:
 * they guard the normal realtime path, the rAF batch queue, the snapshot
 * reconciliation buffer, the snapshot commit and the mutation HTTP
 * completion/rollback paths alike (a late mutation response or a failure
 * rollback must not resurrect a tombstoned id), so
 *
 *   remove -> upsert (any version) => absent
 *
 * holds everywhere, exactly like it already holds inside one buffered
 * reconciliation window (see compactRealtimeEvents).
 *
 * Module-level singleton shared by the workspace sync hook (realtime path)
 * and the mutation layer (local delete confirmation). reset() is called when
 * the sync session ends (no authenticated workspace); ids are never reused,
 * so dropping the registry merely bounds memory without reopening any
 * resurrection window.
 */
const removedOrderIds = new Set<string>()

export const orderTombstones = {
  /** Marks the id as terminally deleted for the rest of the sync session. */
  markRemoved(id: string): void {
    removedOrderIds.add(id)
  },

  /** True when the id was terminally deleted in this sync session. */
  has(id: string): boolean {
    return removedOrderIds.has(id)
  },

  /** Drops all tombstones (workspace sync session teardown). */
  reset(): void {
    removedOrderIds.clear()
  },
}