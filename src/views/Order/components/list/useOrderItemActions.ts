import { useCallback, useRef, useState } from 'react'
import { type OrderRecord } from '@/types'
import { isOrderConflictError } from '@/services/apiClient'
import { orderRepository } from '@/services/orderRepository'
import { orderOptimistic } from '@/services/orderOptimistic'
import { orderTombstones } from '@/services/orderTombstones'
import { requestOrdersResync } from '@/services/orderResync'
import {
  toggleOrderServed,
  toggleOrderStepStatus,
} from '@/services/orderStatus'
import { useOrderStore } from '@/store/order'
import { getMutationErrorMessage } from './orderItemHelpers'

const DEBOUNCE_MS = 300

export type UseOrderItemActionsResult = {
  mutationError: string | null
  clearMutationError: () => void
  handleToggleStapleStep: () => void
  handleToggleMeatStep: () => void
  handleServeMeal: () => void
  handleRemove: () => Promise<void>
  isDeleteOpen: boolean
  setIsDeleteOpen: (open: boolean) => void
  isMutating: boolean
}

export const useOrderItemActions = (
  record: OrderRecord,
): UseOrderItemActionsResult => {
  const upsertOrder = useOrderStore((state) => state.upsertOrder)
  const upsertIfNewer = useOrderStore((state) => state.upsertIfNewer)
  const removeOrder = useOrderStore((state) => state.removeOrder)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isMutating, setIsMutating] = useState(false)
  const lastStapleActionAtRef = useRef<number>(0)
  const lastMeatActionAtRef = useRef<number>(0)
  const lastServeActionAtRef = useRef<number>(0)

  const performOptimisticToggle = useCallback(
    (
      actionRef: React.MutableRefObject<number>,
      computeNext: (record: OrderRecord) => OrderRecord,
      persist: () => Promise<OrderRecord>,
    ) => {
      const now = Date.now()

      if (now - actionRef.current < DEBOUNCE_MS) {
        return
      }

      actionRef.current = now
      setMutationError(null)

      const nextRecord = computeNext(record)

      if (nextRecord === record) {
        return
      }

      const gen = orderOptimistic.beginMutation(record.id, record)

      // Optimistic copies keep the server's version untouched: only the
      // backend can mint the next version once the commit actually lands.
      upsertOrder(nextRecord)

      persist()
        .then((serverRecord) => {
          if (orderOptimistic.endMutation(record.id, gen)) {
            // A realtime remove of the same id (or a confirmed local DELETE)
            // that landed while this mutation was in flight registered a
            // session-wide terminal tombstone. HTTP responses and WebSocket
            // events are independent transports and the backend never reuses
            // an order id, so this late response is stale: it must not
            // resurrect the deleted order, and it must not join the effect
            // journal either (the tombstone keeps it absent at snapshot
            // commit, and recording it would only mask future bugs).
            const isPendingClear = orderTombstones.isPendingClear(record.id)

            if (
              !orderTombstones.has(record.id) &&
              (isPendingClear || !orderTombstones.rejectsUpsert(serverRecord))
            ) {
              // The response is authoritative, but it may arrive after a
              // realtime update with an even higher server version (another
              // client's commit). The version-aware merge keeps the higher
              // version instead of overwriting the store blindly. The
              // confirmed result is journaled too, so a snapshot that
              // overlaps this mutation can never downgrade it even when the
              // WS echo lags. A pending full-clear is unresolved ambiguity:
              // retain the authoritative response in the effect journal for
              // the raw follow-up snapshot to classify, but do not put it
              // back into the store before that decision.
              if (!isPendingClear) {
                upsertIfNewer(serverRecord)
              }
              orderOptimistic.recordUpsert(serverRecord)
            }
          }
        })
        .catch((error) => {
          if (orderOptimistic.endMutation(record.id, gen)) {
            // Roll back to the pre-mutation record only when the store holds
            // nothing newer: an authoritative realtime state with a higher
            // version (another client's commit) must not be downgraded by
            // this rollback, even when the rest of this mutation's outcome
            // (e.g. a conflict resync) is still settling. A tombstoned id
            // never rolls back: re-inserting the pre-mutation record into an
            // empty store slot would resurrect an order that was deleted
            // while the mutation was in flight.
            const current = useOrderStore.getState().ordersById[record.id]

            if (
              !orderTombstones.rejectsUpsert(record) &&
              (!current || current.version <= record.version)
            ) {
              upsertOrder(record)
            }

            if (isOrderConflictError(error)) {
              // The server rejected a stale expectedVersion (another client
              // already advanced the order): the old version is gone for
              // good, so roll back the optimistic record and refetch the
              // authoritative state instead of retrying against it.
              requestOrdersResync()
            }

            setMutationError(getMutationErrorMessage(error))
          }
        })
    },
    [record, upsertIfNewer, upsertOrder],
  )

  const handleToggleStapleStep = useCallback(() => {
    performOptimisticToggle(
      lastStapleActionAtRef,
      (r) => toggleOrderStepStatus(r, 'staple'),
      () => orderRepository.toggleStep(record.id, 'staple', record.version),
    )
  }, [performOptimisticToggle, record])

  const handleToggleMeatStep = useCallback(() => {
    performOptimisticToggle(
      lastMeatActionAtRef,
      (r) => toggleOrderStepStatus(r, 'meat'),
      () => orderRepository.toggleStep(record.id, 'meat', record.version),
    )
  }, [performOptimisticToggle, record])

  const handleServeMeal = useCallback(() => {
    performOptimisticToggle(
      lastServeActionAtRef,
      (r) => toggleOrderServed(r, new Date().toISOString()),
      () => orderRepository.toggleServed(record.id, record.version),
    )
  }, [performOptimisticToggle, record])

  const handleRemove = useCallback(async () => {
    setIsMutating(true)
    setMutationError(null)

    try {
      await orderRepository.remove(record.id)
      removeOrder(record.id)
      // Journal the confirmed delete so a snapshot that overlaps it cannot
      // resurrect the order when the WS remove event has not arrived yet.
      orderOptimistic.recordRemove(record.id)
      // Register the session-wide terminal tombstone so the normal realtime
      // path cannot resurrect the id either: a delayed realtime upsert that
      // arrives after the delete must be dropped, not treated as a new record
      // (the backend never reuses an order id).
      orderTombstones.markRemoved(record.id)
      setIsDeleteOpen(false)
    } catch (error) {
      setMutationError(getMutationErrorMessage(error))
    } finally {
      setIsMutating(false)
    }
  }, [record.id, removeOrder])

  return {
    mutationError,
    clearMutationError: () => setMutationError(null),
    handleToggleStapleStep,
    handleToggleMeatStep,
    handleServeMeal,
    handleRemove,
    isDeleteOpen,
    setIsDeleteOpen,
    isMutating,
  }
}
