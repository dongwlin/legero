import React, { useCallback, useEffect, useState } from 'react'
import { CarbonAdd } from '@/components/Icon'
import { Button, CloseButton, Modal, Separator, TextArea } from '@heroui/react'
import { registerAndroidBackInterceptor } from '@/hooks/useAndroidBackButton'
import { type OrderFormValue, type OrderRecord } from '@/types'
import { isOrderConflictError } from '@/services/apiClient'
import { rebuildOrderRecord } from '@/services/orderFactories'
import { orderRepository } from '@/services/orderRepository'
import { orderOptimistic } from '@/services/orderOptimistic'
import { orderTombstones } from '@/services/orderTombstones'
import { requestOrdersResync } from '@/services/orderResync'
import { useOrderStore } from '@/store/order'
import { useOrderForm, FormMode } from './useOrderForm'
import { QuantitySelector } from '../selectors/QuantitySelector'
import { StapleSelector } from '../selectors/StapleSelector'
import { SizeSelector } from '../selectors/SizeSelector'
import { StapleAmountSelector } from '../selectors/StapleAmountSelector'
import { MeatSelector } from '../selectors/MeatSelector'
import { IngredientSelector } from '../selectors/IngredientSelector'
import { AddOnSelector } from '../selectors/AddOnSelector'
import { DiningSelector } from '../selectors/DiningSelector'
import OrderField from '../OrderField'

const sectionSeparatorClassName = 'w-full border-t border-border/60'
const columnSeparatorClassName =
  'hidden w-0 self-stretch border-l border-border/60 md:block'
const footerButtonClassName =
  'h-11 min-w-20 rounded-xl px-4 text-sm font-semibold touch-manipulation md:h-12 md:text-base'

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '订单保存失败，请稍后重试。'

interface OrderFormProps {
  mode: FormMode
  initialItem?: OrderRecord
}

interface OrderFormContentProps {
  close: () => void
  initialItem?: OrderRecord
  isCreateMode: boolean
  isSubmitting: boolean
  mode: FormMode
  submitError: string | null
  submitButtonText: string
  onSubmit: (
    formValue: OrderFormValue,
    quantity: number,
    baseVersion: number | undefined,
  ) => Promise<void>
}

const OrderFormContent: React.FC<OrderFormContentProps> = ({
  close,
  initialItem,
  isCreateMode,
  isSubmitting,
  mode,
  submitError,
  submitButtonText,
  onSubmit,
}) => {
  const {
    num,
    setNum,
    formValue,
    updateFormValue,
    setStapleEnabled,
    setStapleTypeCode,
    setSizeCode,
    setCustomSizePriceCents,
    setSelectedMeatCodes,
    setDiningMethodCode,
    setPackagingCode,
    setPackagingMethodCode,
    setExtraStapleUnits,
    setFriedEggCount,
    setTofuSkewerCount,
    isValid,
    showPorkKidney,
    showCustomPrice,
    showTakeoutOptions,
  } = useOrderForm(initialItem, mode)

  // The server version the user's edit session was opened on. `OrderForm`
  // remounts this component per session via `key={formSessionKey}`, so the
  // value stays pinned even when realtime advances the store's record while
  // the form is open: expectedVersion must describe the state the user
  // actually edited, not the latest store version at submit time, otherwise
  // a concurrent update would silently pass the OCC check.
  const [baseVersion] = useState(() => initialItem?.version)

  const handleNoteChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateFormValue('note', event.target.value)
  }

  const handleSubmit = () => {
    void onSubmit(formValue, num || 1, baseVersion)
  }

  return (
    <>
      <Modal.Body className='pt-2'>
        <div className='flex flex-col'>
          <div className='pb-2.5'>
            {isCreateMode ? (
              <div className='grid grid-cols-2 items-stretch gap-2.5 md:grid-cols-[minmax(0,1fr)_1px_12rem_1px_12rem] md:gap-x-4'>
                <div className='col-span-2 h-full md:col-span-1'>
                  <StapleSelector
                    stapleTypeCode={formValue.stapleTypeCode}
                    onStapleEnabledChange={setStapleEnabled}
                    onStapleTypeCodeChange={setStapleTypeCode}
                  />
                </div>
                <Separator
                  orientation='vertical'
                  className={columnSeparatorClassName}
                />
                <div className='h-full'>
                  <StapleAmountSelector
                    stapleTypeCode={formValue.stapleTypeCode}
                    stapleAmountCode={formValue.stapleAmountCode}
                    extraStapleUnits={formValue.extraStapleUnits}
                    onStapleAmountCodeChange={(amountCode) =>
                      updateFormValue('stapleAmountCode', amountCode)
                    }
                    onExtraStapleUnitsChange={setExtraStapleUnits}
                  />
                </div>
                <Separator
                  orientation='vertical'
                  className={columnSeparatorClassName}
                />
                <div className='h-full'>
                  <QuantitySelector
                    num={num || 1}
                    setNum={setNum || (() => {})}
                  />
                </div>
              </div>
            ) : (
              <div>
                <StapleSelector
                  stapleTypeCode={formValue.stapleTypeCode}
                  onStapleEnabledChange={setStapleEnabled}
                  onStapleTypeCodeChange={setStapleTypeCode}
                />
              </div>
            )}
          </div>

          <Separator className={sectionSeparatorClassName} />

          <div className='py-2.5'>
            {isCreateMode ? (
              <div>
                <SizeSelector
                  sizeCode={formValue.sizeCode}
                  stapleTypeCode={formValue.stapleTypeCode}
                  customSizePriceCents={formValue.customSizePriceCents}
                  onSizeCodeChange={setSizeCode}
                  onCustomSizePriceCentsChange={setCustomSizePriceCents}
                  showCustomPrice={showCustomPrice}
                />
              </div>
            ) : (
              <div className='grid items-stretch gap-2.5 md:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] md:gap-x-4'>
                <div className='h-full'>
                  <SizeSelector
                    sizeCode={formValue.sizeCode}
                    stapleTypeCode={formValue.stapleTypeCode}
                    customSizePriceCents={formValue.customSizePriceCents}
                    onSizeCodeChange={setSizeCode}
                    onCustomSizePriceCentsChange={setCustomSizePriceCents}
                    showCustomPrice={showCustomPrice}
                  />
                </div>

                <Separator
                  orientation='vertical'
                  className={columnSeparatorClassName}
                />

                <div className='h-full'>
                  <StapleAmountSelector
                    stapleTypeCode={formValue.stapleTypeCode}
                    stapleAmountCode={formValue.stapleAmountCode}
                    extraStapleUnits={formValue.extraStapleUnits}
                    onStapleAmountCodeChange={(amountCode) =>
                      updateFormValue('stapleAmountCode', amountCode)
                    }
                    onExtraStapleUnitsChange={setExtraStapleUnits}
                  />
                </div>
              </div>
            )}
          </div>

          <div className='py-2.5'>
            <MeatSelector
              selectedMeatCodes={formValue.selectedMeatCodes}
              onSelectedMeatCodesChange={setSelectedMeatCodes}
              showPorkKidney={showPorkKidney}
            />
          </div>

          <div className='py-2.5'>
            <IngredientSelector
              greensCode={formValue.greensCode}
              scallionCode={formValue.scallionCode}
              pepperCode={formValue.pepperCode}
              onGreensCodeChange={(value) =>
                updateFormValue('greensCode', value)
              }
              onScallionCodeChange={(value) =>
                updateFormValue('scallionCode', value)
              }
              onPepperCodeChange={(value) =>
                updateFormValue('pepperCode', value)
              }
            />
          </div>

          <div className='py-2.5'>
            <AddOnSelector
              friedEggCount={formValue.friedEggCount}
              tofuSkewerCount={formValue.tofuSkewerCount}
              onFriedEggCountChange={setFriedEggCount}
              onTofuSkewerCountChange={setTofuSkewerCount}
            />
          </div>

          <div className='py-2.5'>
            <DiningSelector
              diningMethodCode={formValue.diningMethodCode}
              packagingCode={formValue.packagingCode}
              packagingMethodCode={formValue.packagingMethodCode}
              onDiningMethodCodeChange={setDiningMethodCode}
              onPackagingCodeChange={setPackagingCode}
              onPackagingMethodCodeChange={setPackagingMethodCode}
              showTakeoutOptions={showTakeoutOptions}
            />
          </div>

          <div className='pt-2.5 p-1'>
            <OrderField label=''>
              <TextArea
                fullWidth
                rows={3}
                variant='secondary'
                className='min-h-20 rounded-xl'
                value={formValue.note}
                onChange={handleNoteChange}
              />
            </OrderField>
          </div>
        </div>
      </Modal.Body>

      <Modal.Footer className='border-t border-border/60 px-4 py-3 md:px-5'>
        <div className='flex w-full flex-col gap-3'>
          {submitError ? (
            <p className='text-sm text-danger'>{submitError}</p>
          ) : null}
          <div className='flex w-full flex-row gap-4'>
            <Button.Root
              isDisabled={isSubmitting}
              variant='outline'
              className={`${footerButtonClassName} basis-0 flex-1`}
              onPress={close}
            >
              取消
            </Button.Root>
            <Button.Root
              isDisabled={!isValid || isSubmitting}
              variant='primary'
              className={`${footerButtonClassName} basis-0 flex-1`}
              onPress={handleSubmit}
            >
              {isSubmitting ? '提交中...' : submitButtonText}
            </Button.Root>
          </div>
        </div>
      </Modal.Footer>
    </>
  )
}

const OrderForm: React.FC<OrderFormProps> = ({ mode, initialItem }) => {
  const upsertIfNewer = useOrderStore((state) => state.upsertIfNewer)
  const upsertOrdersIfNewer = useOrderStore((state) => state.upsertOrdersIfNewer)
  const updateTargetID = useOrderStore((state) => state.updateTargetID)
  const setUpdateTargetID = useOrderStore((state) => state.setUpdateTargetID)
  // The live record the edit session is editing, or undefined while the
  // target is missing (deleted) or no session is open. Used both to render
  // the form and to detect when the resynced record supersedes a conflicted
  // version below.
  const activeRecordFromStore = useOrderStore((state) =>
    mode === 'edit' && updateTargetID
      ? state.ordersById[updateTargetID]
      : undefined,
  )
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createSessionId, setCreateSessionId] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  // A pending 409 conflict refresh: the version that conflicted, waiting for
  // the resynced record to supersede it. Bumped into the session key below so
  // OrderFormContent remounts (re-initializing form values AND the pinned
  // baseVersion) from the fresh record once the store advances past it.
  const [conflictRefresh, setConflictRefresh] = useState<{
    conflictedVersion: number
  } | null>(null)
  // Monotonic per-completed-refresh counter: the edit session key advances
  // only when a conflict refresh actually completes, so a normal open session
  // and a waiting conflict keep a stable key (no premature remount that would
  // drop in-progress edits).
  const [editSessionGeneration, setEditSessionGeneration] = useState(0)

  const handleDialogClose = useCallback(
    (force = false) => {
      if (isSubmitting && !force) {
        return
      }

      setIsSubmitting(false)
      setSubmitError(null)
      setConflictRefresh(null)

      if (mode === 'create') {
        setIsCreateOpen(false)
        setCreateSessionId((prev) => prev + 1)
      } else {
        setUpdateTargetID('')
      }
    },
    [isSubmitting, mode, setUpdateTargetID],
  )

  const handleOpenChange = (nextOpen: boolean) => {
    if (isSubmitting && !nextOpen) {
      return
    }

    if (mode === 'create') {
      if (nextOpen) {
        setIsCreateOpen(true)
        return
      }
    }

    if (!nextOpen) {
      handleDialogClose()
    }
  }

  const handleSubmit = async (
    formValue: OrderFormValue,
    quantity: number,
    baseVersion: number | undefined,
  ): Promise<void> => {
    setIsSubmitting(true)
    setSubmitError(null)

    try {
      if (mode === 'create') {
        // A full clear that commits while the POST is in flight may delete
        // the freshly created order, and HTTP/WS arrival order does not tell
        // us which state the response reflects. The clear cannot tombstone
        // the id up front — the client only learns it when the response
        // arrives — so the clear epoch is captured at submit: a clear that
        // happened meanwhile means the response must not be blindly inserted
        // as authoritative state. The resync decides instead whether the
        // order still exists.
        const clearEpochAtStart = orderTombstones.clearEpochValue()
        const persistedRecords = await orderRepository.createMany(
          formValue,
          quantity,
        )

        if (orderTombstones.clearEpochValue() !== clearEpochAtStart) {
          requestOrdersResync()
        } else {
          // Authoritative merge: newly created records are absent from the
          // store, so this applies them; it also guards the rare replay where
          // the store somehow already holds the id at a higher version. The
          // confirmed creates are journaled so an in-flight snapshot cannot
          // drop them before their realtime echo arrives. Both are skipped
          // for ids rejected by the session tombstones (e.g. a before_today
          // clear racing the create).
          const survivors = persistedRecords.filter(
            (persistedRecord) =>
              !orderTombstones.rejectsUpsert(persistedRecord),
          )

          upsertOrdersIfNewer(survivors)
          for (const persistedRecord of survivors) {
            orderOptimistic.recordUpsert(persistedRecord)
          }
        }
      } else {
        const activeRecord = activeItem ?? null

        if (!activeRecord) {
          throw new Error('未找到要修改的订单。')
        }

        const nextRecord = rebuildOrderRecord(formValue, activeRecord)
        const persistedRecord = await orderRepository.update(
          updateTargetID,
          nextRecord,
          // Optimistic concurrency: the version the edit session was opened
          // on (pinned by OrderFormContent), not the store's current version
          // at submit time. A 409 order_conflict means someone else changed
          // the order meanwhile and the form must be re-read.
          baseVersion ?? activeRecord.version,
        )

        // The response is authoritative but may arrive after a realtime
        // update with an even higher version (another client's commit): the
        // version-aware merge keeps the higher version. The confirmed update
        // is journaled so a snapshot overlapping this mutation cannot
        // downgrade it when the WS echo has not arrived yet. Both are skipped
        // when the id was terminally deleted while the request was in flight:
        // a late PUT response must not resurrect a removed order (the backend
        // never reuses an order id).
        if (!orderTombstones.rejectsUpsert(persistedRecord)) {
          upsertIfNewer(persistedRecord)
          orderOptimistic.recordUpsert(persistedRecord)
        }
      }

      handleDialogClose(true)
    } catch (error) {
      setIsSubmitting(false)

      // A 409 order_conflict means the edited order advanced on the server
      // while the form was open: surface the error and refetch the
      // authoritative state so the list no longer shows the stale version.
      if (isOrderConflictError(error)) {
        requestOrdersResync()

        // Also restart the edit session once the resync lands: staying in
        // the modal and submitting again must carry the fresh
        // expectedVersion, otherwise every retry re-409s on the stale pin.
        // The restart re-initializes the form content from the fresh record
        // — never a blend of the old content with a new base version, which
        // would reintroduce the lost update OCC prevents.
        if (mode === 'edit' && conflictRefresh === null && baseVersion !== undefined) {
          setConflictRefresh({ conflictedVersion: baseVersion })
        }
      }

      setSubmitError(getErrorMessage(error))
    }
  }

  const isCreateMode = mode === 'create'
  const formTitle = isCreateMode ? '创建订单' : '修改订单'
  const submitButtonText = isCreateMode ? '创建' : '修改'
  const activeItem =
    !isCreateMode && updateTargetID ? activeRecordFromStore : initialItem
  const isOpen = isCreateMode ? isCreateOpen : Boolean(updateTargetID)
  const shouldRenderModal = isCreateMode || Boolean(updateTargetID)
  const formSessionKey = isCreateMode
    ? `create-${createSessionId}`
    : updateTargetID
      ? `${updateTargetID}:${editSessionGeneration}`
      : ''

  // Conflict recovery inside a live edit session: once the store record is
  // strictly newer than the version that got the 409 (the resync commit
  // landed), restart the edit session — the generation bumps, so
  // OrderFormContent remounts and both the form values and the pinned
  // baseVersion re-initialize from the authoritative record. The session
  // never blends the old form content with a new base version. State is not
  // touched synchronously in the effect body: the check runs on the store
  // subscription (the resync commit setOrders) and in a microtask that
  // catches an advance that already landed by the time the effect runs.
  useEffect(() => {
    if (conflictRefresh === null) {
      return
    }

    const restart = () => {
      setConflictRefresh(null)
      setEditSessionGeneration((generation) => generation + 1)
    }

    queueMicrotask(() => {
      const record = useOrderStore.getState().ordersById[updateTargetID]

      if (record && record.version > conflictRefresh.conflictedVersion) {
        restart()
      }
    })

    return useOrderStore.subscribe((state) => {
      const record = state.ordersById[updateTargetID]

      if (record && record.version > conflictRefresh.conflictedVersion) {
        restart()
      }
    })
  }, [conflictRefresh, updateTargetID])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    return registerAndroidBackInterceptor(() => {
      handleDialogClose()

      return true
    })
  }, [handleDialogClose, isOpen])

  return (
    <>
      {shouldRenderModal ? (
        <Modal.Root isOpen={isOpen} onOpenChange={handleOpenChange}>
          {isCreateMode ? (
            <Button.Root
              isIconOnly
              className='size-14 rounded-2xl shadow-lg'
              aria-label='创建订单'
            >
              <CarbonAdd className='size-6 md:size-7' />
            </Button.Root>
          ) : null}
          <Modal.Backdrop variant='blur'>
            <Modal.Container
              size='cover'
              scroll='inside'
              className='items-end p-2 xs:items-center xs:p-4'
            >
              <Modal.Dialog className='relative max-h-[calc(100dvh-1rem)] border border-border/70 bg-background shadow-2xl xs:max-w-275'>
                {({ close }) => (
                  <>
                    <CloseButton
                      className='absolute right-4 top-3 z-10 rounded-full md:right-5'
                      onPress={close}
                    />

                    <Modal.Header className='border-b border-border/60 py-4'>
                      <div className='flex items-center gap-3'>
                        <h2 className='text-xl font-semibold text-foreground md:text-2xl'>
                          {formTitle}
                        </h2>
                      </div>
                    </Modal.Header>
                    <OrderFormContent
                      key={formSessionKey}
                      close={close}
                      initialItem={activeItem}
                      isCreateMode={isCreateMode}
                      isSubmitting={isSubmitting}
                      mode={mode}
                      submitError={submitError}
                      submitButtonText={submitButtonText}
                      onSubmit={handleSubmit}
                    />
                  </>
                )}
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal.Root>
      ) : null}
    </>
  )
}

export default OrderForm
