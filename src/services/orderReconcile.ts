import type { ClearWorkspaceMode } from '@/services/apiTypes'
import { isOrderCreatedToday } from '@/services/orderDomainUtils'
import type { OrderRecord } from '@/types'

/**
 * Realtime events that can arrive while a snapshot request is in flight.
 *
 * During snapshot reconciliation these are buffered in arrival order instead
 * of being applied to the store, so the snapshot cannot clobber updates that
 * happened after it was read (issue #12).
 */
export type RealtimeOrderEvent =
  | { type: 'upsert'; order: OrderRecord }
  | { type: 'remove'; id: string }
  | { type: 'clear'; mode: ClearWorkspaceMode }

/**
 * For the same order id the authoritative server states are ordered
 * exclusively by `version`: a higher version is newer, an equal version is
 * the same server state (idempotent), a lower version is stale. These two
 * helpers centralize that rule so every path — realtime, snapshot reconcile,
 * mutation settle, failure replay — shares one ordering semantics.
 */
export const isNewerOrder = (
  incoming: OrderRecord,
  current: OrderRecord,
): boolean => incoming.version > current.version

export const pickLatestOrder = (
  a: OrderRecord,
  b: OrderRecord,
): OrderRecord => (b.version > a.version ? b : a)

/**
 * The highest server `version` per order id among the given (compacted)
 * realtime events, for version comparisons against the store. Remove and
 * clear events carry no version and are ignored: an order removed by the
 * events is simply absent from the reconciled list and can never be
 * resurrected by the overlay.
 */
export const latestUpsertVersion = (
  events: RealtimeOrderEvent[],
): Map<string, number> => {
  const latest = new Map<string, number>()

  for (const event of events) {
    if (event.type !== 'upsert') {
      continue
    }

    const current = latest.get(event.order.id)
    if (current === undefined || event.order.version > current) {
      latest.set(event.order.id, event.order.version)
    }
  }

  return latest
}

/**
 * Compacts a buffered event stream for replay once a snapshot lands.
 *
 * - Everything before the last full (`all`) clear is moot: such a clear wipes
 *   the whole workspace, so earlier upserts/removes can never resurface.
 *   A `before_today` clear only drops older orders, so events before it can
 *   still touch today's orders and are kept.
 * - For each order id only one event survives. Between upserts the strictly
 *   higher server version wins regardless of arrival order (an equal version
 *   keeps the earlier arrival — it is the same server state), so a delayed
 *   stale event can never overwrite a newer one. A remove wins over any
 *   prior upsert, and an upsert that follows a remove is a recreation —
 *   unless the remove itself followed a prior upsert of this stream, in
 *   which case the trailing upsert is a stale event and must not resurrect
 *   the order.
 * - Every clear op itself survives, so the replay can apply its semantics to
 *   the snapshot.
 *
 * Events for distinct ids commute, so the survivors replay in their original
 * relative order to the same final state as the raw stream.
 */
export const compactRealtimeEvents = (
  events: RealtimeOrderEvent[],
): RealtimeOrderEvent[] => {
  let lastClearAllIndex = -1

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]

    if (event.type === 'clear' && event.mode === 'all') {
      lastClearAllIndex = index
    }
  }

  // Everything before the last full clear is moot; the clear itself is kept
  // as an op so it wipes the snapshot as well.
  const tail =
    lastClearAllIndex === -1 ? events : events.slice(lastClearAllIndex)
  const clearIndices = new Set<number>()
  const winnerIndexById = new Map<string, number>()
  // Tracks ids whose remove followed a prior upsert in this stream: a later
  // upsert for such an id is a stale, delayed event, not a recreation.
  const removedAfterUpsert = new Set<string>()

  for (let index = 0; index < tail.length; index += 1) {
    const event = tail[index]

    if (event.type === 'clear') {
      clearIndices.add(index)
      continue
    }

    const id = event.type === 'upsert' ? event.order.id : event.id
    const currentIndex = winnerIndexById.get(id)
    const current =
      currentIndex === undefined ? undefined : tail[currentIndex]

    if (event.type === 'remove') {
      winnerIndexById.set(id, index)

      if (current?.type === 'upsert') {
        removedAfterUpsert.add(id)
      }

      continue
    }

    if (current === undefined) {
      winnerIndexById.set(id, index)
      continue
    }

    if (current.type === 'remove') {
      if (!removedAfterUpsert.has(id)) {
        winnerIndexById.set(id, index)
      }

      continue
    }

    if (event.type === 'upsert' && current.type === 'upsert') {
      if (event.order.version > current.order.version) {
        winnerIndexById.set(id, index)
      }
    }
  }

  const keptIndices = new Set([...clearIndices, ...winnerIndexById.values()])

  return tail.filter((_event, index) => keptIndices.has(index))
}

/**
 * Applies buffered realtime events on top of a snapshot, returning the
 * reconciled order list. The snapshot is the base state; events received
 * while it was being fetched are newer and therefore win. For the same order
 * id the higher server version wins: a stale buffered event (a delayed older
 * upsert) never downgrades a newer snapshot record, and an equal version is
 * idempotent.
 */
export const reconcileSnapshotWithEvents = (
  snapshot: OrderRecord[],
  events: RealtimeOrderEvent[],
): OrderRecord[] => {
  const ordersById = new Map<string, OrderRecord>(
    snapshot.map((order) => [order.id, order]),
  )

  for (const event of compactRealtimeEvents(events)) {
    switch (event.type) {
      case 'upsert': {
        const current = ordersById.get(event.order.id)

        // The buffered event is the newest server state for this id; on an
        // equal version it is the same commit, so replaying it is idempotent.
        if (!current || event.order.version >= current.version) {
          ordersById.set(event.order.id, event.order)
        }

        break
      }
      case 'remove':
        ordersById.delete(event.id)
        break
      case 'clear':
        if (event.mode === 'all') {
          ordersById.clear()
        } else {
          // before_today: the server keeps only orders created on the
          // current business day (Asia/Shanghai), so drop everything older.
          for (const [id, order] of ordersById) {
            if (!isOrderCreatedToday(order)) {
              ordersById.delete(id)
            }
          }
        }

        break
    }
  }

  return [...ordersById.values()]
}

export type OrderEventBuffer = {
  readonly isReconciling: boolean
  beginReconciliation: () => void
  push: (event: RealtimeOrderEvent) => void
  endReconciliation: () => RealtimeOrderEvent[]
}

/**
 * Ordered buffer for realtime events received while a snapshot is in flight.
 * Events pushed between beginReconciliation() and endReconciliation() are
 * retained in arrival order; endReconciliation() returns them compacted and
 * resets the buffer. Events pushed outside a reconciliation are dropped (the
 * caller applies those through its regular path instead).
 */
export const createOrderEventBuffer = (): OrderEventBuffer => {
  let events: RealtimeOrderEvent[] = []
  let reconciling = false

  return {
    get isReconciling() {
      return reconciling
    },
    beginReconciliation() {
      events = []
      reconciling = true
    },
    push(event) {
      if (reconciling) {
        events.push(event)
      }
    },
    endReconciliation() {
      reconciling = false
      const replay = compactRealtimeEvents(events)
      events = []
      return replay
    },
  }
}