import {
  STEP_STATUS,
  type OrderRecord,
  type OrderViewModel,
  type StepStatusCode,
} from '@/types'
import React, { useEffect, useRef, useState } from 'react'
import { CarbonEdit, CarbonTrashCan } from '@/components/Icon'
import { registerAndroidBackInterceptor } from '@/hooks/useAndroidBackButton'
import { orderRepository } from '@/services/orderRepository'
import { needsStapleStep } from '@/services/orderStatus'
import { useOrderStore } from '@/store/order'
import { useOrderSettingsStore } from '@/store/orderSettings'
import { AlertDialog, Button, Card } from '@heroui/react'
import dayjs from 'dayjs'
import OrderWaitTime from './OrderWaitTime'

type OrderItemProps = {
  record: OrderRecord
  view: OrderViewModel
  isQuickCalcMode: boolean
  isQuickCalcSelected: boolean
  onEnterQuickCalc: (id: string) => void
  onToggleQuickCalcSelection: (id: string) => void
}

const QUICK_CALC_DOUBLE_TAP_THRESHOLD_MS = 280

const isQuickCalcIgnoredTarget = (target: EventTarget | null): boolean =>
  target instanceof Element &&
  target.closest('[data-quick-calc-ignore="true"]') !== null

const getStepButtonProps = (stepStatusCode: StepStatusCode) => {
  switch (stepStatusCode) {
    case STEP_STATUS.notStarted:
      return {
        className:
          'border-border/60 text-foreground hover:bg-background-secondary',
        variant: 'outline' as const,
      }
    case STEP_STATUS.completed:
      return {
        className:
          'border-success/40 bg-success/12 text-success hover:bg-success/18',
        variant: 'secondary' as const,
      }
    default:
      return {
        className:
          'border-border/60 text-foreground hover:bg-background-secondary',
        variant: 'outline' as const,
      }
  }
}

const getServeMealButtonProps = ({
  completedAt,
  isDisabled,
}: {
  completedAt: string | null
  isDisabled: boolean
}) => {
  if (isDisabled) {
    return {
      className:
        'rounded-2xl border-dashed border-border/80 bg-background-secondary/80 font-bold text-muted shadow-none',
      variant: 'outline' as const,
    }
  }

  if (!completedAt) {
    return {
      className: 'rounded-2xl font-bold',
      variant: 'primary' as const,
    }
  }

  return {
    className:
      'rounded-2xl border-success/40 bg-success/12 font-bold text-success hover:bg-success/18',
    variant: 'secondary' as const,
  }
}

const renderHighlightedForbiddenText = (text: string): React.ReactNode => {
  if (!text.includes('不要')) {
    return text
  }

  return text.split('不要').map((part, index) => (
    <React.Fragment key={`${part}-${index}`}>
      {index > 0 && (
        <span className='mx-0.5 inline-block rounded bg-red-100 px-1 text-red-700'>
          不要
        </span>
      )}
      {part}
    </React.Fragment>
  ))
}

const getMutationErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '订单同步失败，请稍后重试。'

const OrderItem: React.FC<OrderItemProps> = ({
  record,
  view,
  isQuickCalcMode,
  isQuickCalcSelected,
  onEnterQuickCalc,
  onToggleQuickCalcSelection,
}) => {
  const removeOrder = useOrderStore((state) => state.removeOrder)
  const upsertOrder = useOrderStore((state) => state.upsertOrder)
  const setUpdateTargetID = useOrderStore((state) => state.setUpdateTargetID)
  const { waitTimeThresholdMinutes } = useOrderSettingsStore()
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isMutating, setIsMutating] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const lastTouchEndAtRef = useRef<number | null>(null)
  const suppressNextQuickCalcToggleRef = useRef(false)

  const stapleStepButton = getStepButtonProps(record.stapleStepStatusCode)
  const meatStepButton = getStepButtonProps(record.meatStepStatusCode)
  const shouldShowStapleStepButton = needsStapleStep(record)
  const orderCardToneClass = record.completedAt
    ? 'border-success/25'
    : 'border-border/70'
  const quickCalcSelectionClassName = isQuickCalcSelected
    ? 'ring-2 ring-accent/45 ring-offset-2 ring-offset-background bg-accent/5 shadow-lg'
    : ''
  const isServeMealDisabled = !view.canServe
  const serveMealButton = getServeMealButtonProps({
    completedAt: record.completedAt,
    isDisabled: isServeMealDisabled,
  })

  useEffect(() => {
    if (!isDeleteOpen) {
      return
    }

    return registerAndroidBackInterceptor(() => {
      setIsDeleteOpen(false)

      return true
    })
  }, [isDeleteOpen])

  const persistRecord = async (mutate: () => Promise<OrderRecord>) => {
    setIsMutating(true)
    setMutationError(null)

    try {
      const persistedRecord = await mutate()
      upsertOrder(persistedRecord)
    } catch (error) {
      setMutationError(getMutationErrorMessage(error))
    } finally {
      setIsMutating(false)
    }
  }

  const handleToggleStapleStep = () => {
    void persistRecord(() =>
      orderRepository.toggleStep(record.id, 'staple', record),
    )
  }

  const handleToggleMeatStep = () => {
    void persistRecord(() =>
      orderRepository.toggleStep(record.id, 'meat', record),
    )
  }

  const handleServeMeal = () => {
    void persistRecord(() => orderRepository.toggleServed(record.id, record))
  }

  const handleRemove = async () => {
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
  }

  const handleEnterQuickCalc = () => {
    setMutationError(null)
    onEnterQuickCalc(record.id)
  }

  const handleCardDoubleClick = (event: React.MouseEvent<HTMLElement>) => {
    if (isQuickCalcMode || isQuickCalcIgnoredTarget(event.target)) {
      return
    }

    handleEnterQuickCalc()
  }

  const handleCardTouchEnd = (event: React.TouchEvent<HTMLElement>) => {
    if (
      isQuickCalcMode ||
      isQuickCalcIgnoredTarget(event.target) ||
      event.changedTouches.length !== 1
    ) {
      return
    }

    const currentTouchEndAt = event.timeStamp
    const previousTouchEndAt = lastTouchEndAtRef.current

    lastTouchEndAtRef.current = currentTouchEndAt

    if (
      previousTouchEndAt !== null &&
      currentTouchEndAt - previousTouchEndAt <=
        QUICK_CALC_DOUBLE_TAP_THRESHOLD_MS
    ) {
      suppressNextQuickCalcToggleRef.current = true
      lastTouchEndAtRef.current = null
      handleEnterQuickCalc()
    }
  }

  const handleCardClick = (event: React.MouseEvent<HTMLElement>) => {
    if (!isQuickCalcMode || isQuickCalcIgnoredTarget(event.target)) {
      return
    }

    if (suppressNextQuickCalcToggleRef.current) {
      suppressNextQuickCalcToggleRef.current = false
      return
    }

    setMutationError(null)
    onToggleQuickCalcSelection(record.id)
  }

  return (
    <>
      <Card.Root
        variant='secondary'
        className={`border p-0 touch-manipulation transition-shadow duration-200 hover:shadow-lg ${orderCardToneClass} ${quickCalcSelectionClassName}`}
        onClick={handleCardClick}
        onDoubleClick={handleCardDoubleClick}
        onTouchEnd={handleCardTouchEnd}
      >
        <Card.Content className='space-y-4 p-4 md:p-5'>
          <div className='flex flex-wrap items-start justify-between gap-4'>
            <div className='flex-1 space-y-3'>
              <div className='flex flex-wrap items-center gap-2 xs:gap-4'>
                <span className='inline-flex shrink-0 items-center font-mono text-lg font-medium leading-none tabular-nums text-muted xs:text-xl'>
                  {view.displayNoText}
                </span>
                {view.stapleTypeLabel ? (
                  <span
                    className={`inline-flex min-h-12 items-center rounded-2xl border px-4 py-2 text-lg font-semibold shadow-sm md:min-h-14 xs:text-2xl ${view.stapleToneClass}`}
                  >
                    {view.stapleTypeLabel}
                  </span>
                ) : null}
                <span className='inline-flex shrink-0 items-center text-lg font-bold leading-none text-foreground tabular-nums xs:text-2xl'>
                  {view.sizePriceText}
                </span>
                <span className='inline-flex shrink-0 items-center text-lg font-semibold leading-none text-foreground xs:text-2xl'>
                  {view.diningMethodLabel}
                </span>
              </div>

              <div className='space-y-2 text-base leading-7 text-foreground xs:text-xl'>
                {view.meatRequestText !== '' ? (
                  <div>
                    {renderHighlightedForbiddenText(view.meatRequestText)}
                  </div>
                ) : null}
                {view.addOnText ? <div>{view.addOnText}</div> : null}
                {view.otherRequestText ? (
                  <div>
                    {renderHighlightedForbiddenText(view.otherRequestText)}
                  </div>
                ) : null}
                {view.noteText ? (
                  <div className='italic text-muted'>{view.noteText}</div>
                ) : null}
              </div>
            </div>

            <div className='flex shrink-0 gap-2 self-start'>
              <Button.Root
                isIconOnly
                isDisabled={isMutating}
                data-quick-calc-ignore='true'
                className='size-12 rounded-2xl border border-border/70 bg-background/95 shadow-sm touch-manipulation transition-[background-color,border-color,box-shadow] duration-200 data-[hovered=true]:border-border-secondary data-[hovered=true]:bg-background data-[hovered=true]:shadow-md md:size-14'
                variant='secondary'
                aria-label='编辑订单'
                onPress={() => {
                  setMutationError(null)
                  setUpdateTargetID(record.id)
                }}
              >
                <CarbonEdit className='size-5 md:size-6' />
              </Button.Root>
              <AlertDialog.Root
                isOpen={isDeleteOpen}
                onOpenChange={setIsDeleteOpen}
              >
                <Button.Root
                  isIconOnly
                  isDisabled={isMutating}
                  data-quick-calc-ignore='true'
                  className='size-12 rounded-2xl touch-manipulation md:size-14'
                  variant='danger'
                  aria-label='删除订单'
                >
                  <CarbonTrashCan className='size-5 md:size-6' />
                </Button.Root>
                <AlertDialog.Backdrop variant='blur'>
                  <AlertDialog.Container size='sm' placement='center'>
                    <AlertDialog.Dialog className='border border-border/70 bg-background shadow-xl'>
                      <AlertDialog.Header>
                        <AlertDialog.Icon status='danger' />
                        <AlertDialog.Heading>确认删除订单</AlertDialog.Heading>
                      </AlertDialog.Header>
                      <AlertDialog.Body className='pt-4 text-sm leading-6 text-muted'>
                        确定要删除订单 {view.displayNoText} 吗？此操作不可恢复。
                      </AlertDialog.Body>
                      <AlertDialog.Footer className='mt-6 gap-3 flex-row justify-end'>
                        <Button.Root slot='close' variant='outline'>
                          取消
                        </Button.Root>
                        <Button.Root
                          slot='close'
                          variant='danger'
                          isDisabled={isMutating}
                          onPress={() => {
                            void handleRemove()
                          }}
                        >
                          确认
                        </Button.Root>
                      </AlertDialog.Footer>
                    </AlertDialog.Dialog>
                  </AlertDialog.Container>
                </AlertDialog.Backdrop>
              </AlertDialog.Root>
            </div>
          </div>

          <div className='flex flex-wrap gap-2'>
            {shouldShowStapleStepButton ? (
              <Button.Root
                isDisabled={isMutating}
                data-quick-calc-ignore='true'
                className={`h-14 min-w-24 rounded-2xl px-6 text-lg shadow-sm touch-manipulation md:h-16 md:min-w-28 xs:text-xl ${stapleStepButton.className}`}
                variant={stapleStepButton.variant}
                onPress={handleToggleStapleStep}
              >
                主食
              </Button.Root>
            ) : null}
            {record.meatStepStatusCode !== STEP_STATUS.unrequired ? (
              <Button.Root
                isDisabled={isMutating}
                data-quick-calc-ignore='true'
                className={`h-14 min-w-24 rounded-2xl px-6 text-lg shadow-sm touch-manipulation md:h-16 md:min-w-28 xs:text-xl ${meatStepButton.className}`}
                variant={meatStepButton.variant}
                onPress={handleToggleMeatStep}
              >
                肉
              </Button.Root>
            ) : null}
            <Button.Root
              data-quick-calc-ignore='true'
              className={`h-14 min-w-24 px-6 text-lg shadow-sm touch-manipulation md:h-16 md:min-w-28 xs:text-xl ${serveMealButton.className}`}
              isDisabled={isServeMealDisabled || isMutating}
              variant={serveMealButton.variant}
              onPress={handleServeMeal}
            >
              出餐
            </Button.Root>
          </div>

          <div className='flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted xs:text-base'>
            <span className='font-mono tabular-nums'>
              {dayjs(record.createdAt).format('YYYY-MM-DD HH:mm:ss')}
            </span>
            {record.completedAt === null ? (
              <OrderWaitTime
                createdAt={record.createdAt}
                completedAt={record.completedAt}
                waitTimeThresholdMinutes={waitTimeThresholdMinutes}
              />
            ) : null}
          </div>
          {mutationError ? (
            <div className='text-sm text-danger md:text-base'>
              {mutationError}
            </div>
          ) : null}
        </Card.Content>
      </Card.Root>
    </>
  )
}

const areOrderItemPropsEqual = (
  prevProps: OrderItemProps,
  nextProps: OrderItemProps,
) => {
  return (
    prevProps.record === nextProps.record &&
    prevProps.view === nextProps.view &&
    prevProps.isQuickCalcMode === nextProps.isQuickCalcMode &&
    prevProps.isQuickCalcSelected === nextProps.isQuickCalcSelected
  )
}

export default React.memo(OrderItem, areOrderItemPropsEqual)
