import type { ClearWorkspaceMode } from '@/services/apiTypes'
import { isOrderCreatedToday } from '@/services/orderDomainUtils'
import type { LocalMutationEffect } from '@/services/orderOptimistic'
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
 * Compacts a buffered event stream for replay once a snapshot lands.
 *
 * - Everything before the last full (`all`) clear is moot: such a clear wipes
 *   the whole workspace, so earlier upserts/removes can never resurface.
 *   A `before_today` clear only drops older orders, so events before it can
 *   still touch today's orders and are kept.
 * - For each order id only one event survives. Between upserts the strictly
 *   higher server version wins regardless of arrival order (an equal version
 *   keeps the earlier arrival — it is the same server state), so a delayed
 *   stale event can never overwrite a newer one. Once a remove appears for
 *   an id it is a terminal tombstone for the rest of the window: the Legero
 *   backend never reuses an order id (orders are created with a fresh uuid),
 *   so a trailing upsert is not a recreation but a stale, delayed event and
 *   must not resurrect the order, while an earlier upsert is superseded.
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
  // Once a remove appears for an id it is a terminal tombstone inside this
  // reconciliation window: the backend never reuses an order id, so ids
  // arriving after the remove are not recreations but delayed/stale events
  // that must not resurrect the order.
  const removedIds = new Set<string>()

  for (let index = 0; index < tail.length; index += 1) {
    const event = tail[index]

    if (event.type === 'clear') {
      clearIndices.add(index)
      continue
    }

    const id = event.type === 'upsert' ? event.order.id : event.id

    if (event.type === 'remove') {
      winnerIndexById.set(id, index)
      removedIds.add(id)
      continue
    }

    if (removedIds.has(id)) {
      continue
    }

    const currentIndex = winnerIndexById.get(id)

    if (currentIndex === undefined) {
      winnerIndexById.set(id, index)
      continue
    }

    const current = tail[currentIndex]

    if (
      current.type === 'upsert' &&
      event.order.version > current.order.version
    ) {
      winnerIndexById.set(id, index)
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

/**
 * Ids with a confirmed local remove in the effect journal, as terminal
 * tombstones: the Legero backend never reuses an order id (orders are
 * created with a fresh uuid), so once a delete is confirmed a remove must
 * beat every other statement for the id — the snapshot, buffered realtime
 * upserts, and local store records alike. Removes commute with removes, so
 * confirmation order is irrelevant.
 */
export const confirmedRemoveIds = (
  effects: LocalMutationEffect[],
): string[] =>
  effects
    .filter(
      (effect): effect is Extract<LocalMutationEffect, { type: 'remove' }> =>
        effect.type === 'remove',
    )
    .map((effect) => effect.id)

/**
 * Applies confirmed local upsert effects on top of a snapshot, before the
 * buffered realtime events are replayed.
 *
 * The snapshot was read at one point in time; a local mutation that
 * confirmed after that read is authoritative state the client already knows
 * and must survive the commit — HTTP and WebSocket are independent transport
 * paths, so the mutation's WS echo may not have arrived yet. An upsert
 * effect lands only where the snapshot does not already hold a strictly
 * newer record (an equal version is the same server commit — idempotent).
 * A buffered upsert event replayed afterwards with a higher version still
 * wins.
 */
export const applyLocalUpsertEffects = (
  snapshot: OrderRecord[],
  effects: LocalMutationEffect[],
): OrderRecord[] => {
  const ordersById = new Map<string, OrderRecord>(
    snapshot.map((order) => [order.id, order]),
  )

  for (const effect of effects) {
    if (effect.type !== 'upsert') {
      continue
    }

    const current = ordersById.get(effect.order.id)

    if (!current || current.version <= effect.order.version) {
      ordersById.set(effect.order.id, effect.order)
    }
  }

  return [...ordersById.values()]
}

/**
 * Applies confirmed local removes as terminal tombstones on top of an
 * already-reconciled order list. Call this last: a delete that confirmed
 * during the snapshot's lifetime must stay absent even when a buffered
 * realtime upsert predates it — the WS echo of the delete, or a remote
 * update, can never outlive the delete, because the backend never reuses
 * the order id.
 */
export const applyLocalRemoveEffects = (
  orders: OrderRecord[],
  effects: LocalMutationEffect[],
): OrderRecord[] => {
  const ordersById = new Map(orders.map((order) => [order.id, order]))

  for (const id of confirmedRemoveIds(effects)) {
    ordersById.delete(id)
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