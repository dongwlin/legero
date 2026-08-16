import type { OrderRecord } from '@/types'

type PendingMutation = {
  generation: number
  snapshot: OrderRecord
}

const pendingMutations = new Map<string, PendingMutation>()

// Monotonic counter stamped onto every mutation as it begins. A snapshot is
// read from the server state at one point in time; a local mutation that was
// pending at that point, or that began after it, must never be clobbered by
// the snapshot — even if the mutation completes while the fetch is still in
// flight, because the snapshot still predates its effect.
// latestMutationSeq keeps the stamp of each order's most recent mutation so
// reconciliation can tell which mutations overlap a snapshot's lifetime. It
// only grows with distinct order ids (a bounded set in a workspace) and is
// deliberately not pruned: pruning would reopen the window the stamp closes.
const latestMutationSeq = new Map<string, number>()
let mutationSeq = 0

/**
 * The mutation state at the moment a snapshot fetch starts. Pass the marker
 * to idsToProtect() when the fetch settles to learn which orders' optimistic
 * records the snapshot must not overwrite.
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

  captureSnapshotMarker(): MutationSnapshotMarker {
    return {
      seq: mutationSeq,
      pendingIds: [...pendingMutations.keys()],
    }
  },

  /**
   * Order ids whose mutations overlap the lifetime of a snapshot that
   * started with the given marker: those pending at the start (the snapshot
   * read may predate their completion) and those whose latest mutation began
   * after the start (the snapshot read predates the mutation itself).
   *
   * The set only names the candidates: the caller decides at commit time how
   * each one is protected. A still-pending mutation always wins (its
   * completion or rollback owns the authoritative state), while a settled
   * mutation only wins over the stale snapshot itself — a buffered realtime
   * event with a strictly newer server version supersedes it. A plain
   * Set<orderId> cannot express that distinction on its own.
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
