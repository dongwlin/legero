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
  | { type: 'clear' }

/**
 * Compacts a buffered event stream for replay once a snapshot lands.
 *
 * - Everything before the last `clear` is moot: a clear wipes the workspace,
 *   so earlier upserts/removes can never resurface.
 * - For each order id only the last event survives: the newest upsert wins, a
 *   trailing remove wins over an earlier upsert, and a trailing upsert wins
 *   over an earlier remove.
 *
 * Events for distinct ids commute, so the survivors replay in their original
 * relative order to the same final state as the raw stream.
 */
export const compactRealtimeEvents = (
  events: RealtimeOrderEvent[],
): RealtimeOrderEvent[] => {
  let lastClearIndex = -1

  for (let index = 0; index < events.length; index += 1) {
    if (events[index].type === 'clear') {
      lastClearIndex = index
    }
  }

  // Everything before the last clear is moot, but the clear itself is kept
  // as an op so it wipes the snapshot as well.
  const tail =
    lastClearIndex === -1 ? events : events.slice(lastClearIndex)
  const lastIndexById = new Map<string, number>()

  for (let index = 0; index < tail.length; index += 1) {
    const event = tail[index]

    if (event.type === 'upsert') {
      lastIndexById.set(event.order.id, index)
    } else if (event.type === 'remove') {
      lastIndexById.set(event.id, index)
    }
  }

  const keptIndices = new Set(lastIndexById.values())

  // The last clear sits at the head of the tail; it must survive the per-id
  // compaction so it can wipe the snapshot.
  if (lastClearIndex !== -1) {
    keptIndices.add(0)
  }

  return tail.filter((_event, index) => keptIndices.has(index))
}

/**
 * Applies buffered realtime events on top of a snapshot, returning the
 * reconciled order list. The snapshot is the base state; events received
 * while it was being fetched are newer and therefore win.
 */
export const reconcileSnapshotWithEvents = (
  snapshot: OrderRecord[],
  events: RealtimeOrderEvent[],
): OrderRecord[] => {
  const ordersById = new Map<string, OrderRecord>(
    snapshot.map((order) => [order.id, order]),
  )

  for (const event of compactRealtimeEvents(events)) {
    if (event.type === 'upsert') {
      ordersById.set(event.order.id, event.order)
    } else if (event.type === 'remove') {
      ordersById.delete(event.id)
    } else {
      ordersById.clear()
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
