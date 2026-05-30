import { useCallback, useRef, useState } from 'react'
import { type OrderRecord } from '@/types'
import { orderRepository } from '@/services/orderRepository'
import {
  toggleOrderServed,
  toggleOrderStepStatus,
} from '@/services/orderStatus'
import { orderOptimistic } from '@/services/orderOptimistic'
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

      upsertOrder(nextRecord)

      persist()
        .then((serverRecord) => {
          if (orderOptimistic.endMutation(record.id, gen)) {
            upsertOrder(serverRecord)
          }
        })
        .catch((error) => {
          if (orderOptimistic.endMutation(record.id, gen)) {
            upsertOrder(record)
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
      () => orderRepository.toggleStep(record.id, 'staple', record),
    )
  }, [performOptimisticToggle, record])

  const handleToggleMeatStep = useCallback(() => {
    performOptimisticToggle(
      lastMeatActionAtRef,
      (r) => toggleOrderStepStatus(r, 'meat'),
      () => orderRepository.toggleStep(record.id, 'meat', record),
    )
  }, [performOptimisticToggle, record])

  const handleServeMeal = useCallback(() => {
    performOptimisticToggle(
      lastServeActionAtRef,
      (r) => toggleOrderServed(r, new Date().toISOString()),
      () => orderRepository.toggleServed(record.id, record),
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
