/**
 * Tiny pub/sub for requesting an authoritative order resync from anywhere in
 * the UI — e.g. when a mutation is rejected with `409 order_conflict` because
 * another client already advanced the order's `version`.
 *
 * The workspace sync layer subscribes and re-runs snapshot reconciliation;
 * the request carries no payload, because the fresh snapshot plus any
 * buffered realtime events are the source of truth. Events received while
 * that snapshot is in flight are buffered and replayed over it exactly like
 * on a reconnect.
 */
type ResyncListener = () => void

const listeners = new Set<ResyncListener>()

export const requestOrdersResync = (): void => {
  for (const listener of Array.from(listeners)) {
    listener()
  }
}

export const subscribeOrdersResync = (
  listener: ResyncListener,
): (() => void) => {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}