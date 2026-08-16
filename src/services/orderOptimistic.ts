import type { OrderRecord } from '@/types'

type PendingMutation = {
  generation: number
  snapshot: OrderRecord
}

/**
 * A confirmed local mutation effect: the authoritative record returned by
 * the client's own HTTP mutation (`upsert`) or the id it deleted (`remove`),
 * stamped with the journal sequence at confirmation time. Effects recorded
 * after a snapshot started are re-applied over the snapshot at commit, so a
 * stale snapshot can never undo a mutation the server already confirmed —
 * an update/create response, not just an optimistic toggle prediction.
 */
export type LocalMutationEffect =
  | { type: 'upsert'; order: OrderRecord; seq: number }
  | { type: 'remove'; id: string; seq: number }

const pendingMutations = new Map<string, PendingMutation>()

// Monotonic counter stamped onto every mutation as it begins (or confirms).
// A snapshot is read from the server state at one point in time; a local
// mutation that was pending at that point, or that began or confirmed after
// it, must never be clobbered by the snapshot — even if the mutation
// completes while the fetch is still in flight, because the snapshot still
// predates its effect.
// latestMutationSeq keeps the stamp of each order's most recent mutation so
// reconciliation can tell which mutations overlap a snapshot's lifetime. It
// only grows with distinct order ids (a bounded set in a workspace) and is
// deliberately not pruned: pruning would reopen the window the stamp closes.
const latestMutationSeq = new Map<string, number>()
// The most recent confirmed effect per order id, stamped with the same
// counter so a snapshot can replay exactly the effects that overlap it.
const effects = new Map<string, LocalMutationEffect>()
let mutationSeq = 0

/**
 * The mutation state at the moment a snapshot fetch starts. Pass the marker
 * to idsToProtect() when the fetch settles to learn which orders' optimistic
 * records the snapshot must not overwrite, and to effectsAfter() to learn
 * which confirmed local mutations the snapshot must not undo.
 */
export type MutationSnapshotMarker = {
  seq: number
  pendingIds: string[]
}

export const orderOptimistic = {
  beginMutation(orderId: string, snapshot: OrderRecord): number {
    const existing = pendingMutations.get(orderId)
    const generation = (existing?.generation ?? 0) + 1

    mutationSeq += 1
    latestMutationSeq.set(orderId, mutationSeq)
    pendingMutations.set(orderId, { generation, snapshot })

    return generation
  },

  endMutation(orderId: string, generation: number): boolean {
    const existing = pendingMutations.get(orderId)

    if (!existing || existing.generation !== generation) {
      return false
    }

    pendingMutations.delete(orderId)

    return true
  },

  hasPending(orderId: string): boolean {
    return pendingMutations.has(orderId)
  },

  /**
   * Records a confirmed authoritative upsert — the HTTP response of an
   * update, create, or settled toggle. The id joins the snapshot-protection
   * set and the effect itself is re-applied at snapshot commit, so an
   * in-flight snapshot can neither drop a freshly created order nor
   * downgrade a freshly updated one when its realtime echo has not arrived
   * yet.
   */
  recordUpsert(order: OrderRecord): void {
    mutationSeq += 1
    latestMutationSeq.set(order.id, mutationSeq)
    effects.set(order.id, { type: 'upsert', order, seq: mutationSeq })
  },

  /**
   * Records a confirmed authoritative remove — a successful delete. Like
   * recordUpsert the id joins the protection set, and the effect keeps the
   * id absent at snapshot commit even when the snapshot still contains it,
   * so a stale snapshot cannot resurrect a deleted order.
   */
  recordRemove(id: string): void {
    mutationSeq += 1
    latestMutationSeq.set(id, mutationSeq)
    effects.set(id, { type: 'remove', id, seq: mutationSeq })
  },

  /**
   * Confirmed local mutation effects recorded after the marker: these
   * overlap the snapshot's lifetime and are replayed over it at commit,
   * in confirmation order.
   */
  effectsAfter(marker: MutationSnapshotMarker): LocalMutationEffect[] {
    return Array.from(effects.values())
      .filter((effect) => effect.seq > marker.seq)
      .sort((a, b) => a.seq - b.seq)
  },

  captureSnapshotMarker(): MutationSnapshotMarker {
    return {
      seq: mutationSeq,
      pendingIds: [...pendingMutations.keys()],
    }
  },

  /**
   * Order ids whose mutations overlap the lifetime of a snapshot that
   * started with the given marker: those pending at the start (the snapshot
   * read may predate their completion) and those whose latest mutation —
   * begun or confirmed — came after the start (the snapshot read predates
   * the mutation itself).
   *
   * The set only names the candidates: the caller decides at commit time how
   * each one is protected. The store record of a mutation — pending or
   * settled — is compared by server version against the reconciled state, so
   * a strictly higher authoritative candidate still wins, and confirmed
   * removals are applied through the effects journal rather than the record
   * overlay. A plain Set<orderId> cannot express that distinction on its
   * own.
   */
  idsToProtect(marker: MutationSnapshotMarker): Set<string> {
    const ids = new Set(marker.pendingIds)

    for (const [orderId, seq] of latestMutationSeq) {
      if (seq > marker.seq) {
        ids.add(orderId)
      }
    }

    return ids
  },
}
