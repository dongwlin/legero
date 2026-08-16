import { useCallback, useRef, useState } from 'react'
import { type OrderRecord } from '@/types'
import { isOrderConflictError } from '@/services/apiClient'
import { orderRepository } from '@/services/orderRepository'
import { orderOptimistic } from '@/services/orderOptimistic'
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
            // The response is the authoritative record: it carries the new
            // server version, so replace the optimistic copy wholesale.
            upsertOrder(serverRecord)
          }
        })
        .catch((error) => {
          if (orderOptimistic.endMutation(record.id, gen)) {
            upsertOrder(record)

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
    [record, upsertOrder],
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
