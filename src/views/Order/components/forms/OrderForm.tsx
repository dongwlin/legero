import React, { useState } from 'react'
import { CarbonAdd } from '@/components/Icon'
import { Button, CloseButton, Modal, Separator, TextArea } from '@heroui/react'
import { type OrderFormValue, type OrderRecord } from '@/types'
import { rebuildOrderRecord } from '@/services/orderFactories'
import { orderRepository } from '@/services/orderRepository'
import { useOrderStore } from '@/store/order'
import { useOrderForm, FormMode } from './useOrderForm'
import { QuantitySelector } from '../selectors/QuantitySelector'
import { StapleSelector } from '../selectors/StapleSelector'
import { SizeSelector } from '../selectors/SizeSelector'
import { StapleAmountSelector } from '../selectors/StapleAmountSelector'
import { MeatSelector } from '../selectors/MeatSelector'
import { IngredientSelector } from '../selectors/IngredientSelector'
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
  onSubmit: (formValue: OrderFormValue, quantity: number) => Promise<void>
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
    isValid,
    showPorkKidney,
    showCustomPrice,
    showTakeoutOptions,
  } = useOrderForm(initialItem, mode)

  const handleNoteChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateFormValue('note', event.target.value)
  }

  const handleSubmit = () => {
    void onSubmit(formValue, num || 1)
  }

  return (
    <>
      <Modal.Body className='pt-2 pb-4'>
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
                    setNum={setNum || (() => { })}
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

          <Separator className={sectionSeparatorClassName} />

          <div className='py-2.5'>
            <MeatSelector
              selectedMeatCodes={formValue.selectedMeatCodes}
              onSelectedMeatCodesChange={setSelectedMeatCodes}
              showPorkKidney={showPorkKidney}
            />
          </div>

          <Separator className={sectionSeparatorClassName} />

          <div className='py-2.5'>
            <IngredientSelector
              greensCode={formValue.greensCode}
              scallionCode={formValue.scallionCode}
              pepperCode={formValue.pepperCode}
              onGreensCodeChange={(value) => updateFormValue('greensCode', value)}
              onScallionCodeChange={(value) =>
                updateFormValue('scallionCode', value)
              }
              onPepperCodeChange={(value) => updateFormValue('pepperCode', value)}
            />
          </div>

          <Separator className={sectionSeparatorClassName} />

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

          <Separator className={sectionSeparatorClassName} />

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
  const upsertOrder = useOrderStore((state) => state.upsertOrder)
  const updateTargetID = useOrderStore((state) => state.updateTargetID)
  const setUpdateTargetID = useOrderStore((state) => state.setUpdateTargetID)
  const findOrder = useOrderStore((state) => state.findOrder)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createSessionId, setCreateSessionId] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const handleDialogClose = (force = false) => {
    if (isSubmitting && !force) {
      return
    }

    setIsSubmitting(false)
    setSubmitError(null)

    if (mode === 'create') {
      setIsCreateOpen(false)
      setCreateSessionId((prev) => prev + 1)
    } else {
      setUpdateTargetID('')
    }
  }

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
  ): Promise<void> => {
    setIsSubmitting(true)
    setSubmitError(null)

    try {
      if (mode === 'create') {
        const persistedRecords = await orderRepository.createMany(formValue, quantity)
        persistedRecords.forEach(upsertOrder)
      } else {
        const activeRecord = activeItem ?? null

        if (!activeRecord) {
          throw new Error('未找到要修改的订单。')
        }

        const nextRecord = rebuildOrderRecord(formValue, activeRecord)
        const persistedRecord = await orderRepository.update(updateTargetID, nextRecord)

        upsertOrder(persistedRecord)
      }

      handleDialogClose(true)
    } catch (error) {
      setIsSubmitting(false)
      setSubmitError(getErrorMessage(error))
    }
  }

  const isCreateMode = mode === 'create'
  const formTitle = isCreateMode ? '创建订单' : '修改订单'
  const submitButtonText = isCreateMode ? '创建' : '修改'
  const activeItem =
    !isCreateMode && updateTargetID ? findOrder(updateTargetID) : initialItem
  const isOpen = isCreateMode ? isCreateOpen : Boolean(updateTargetID)
  const shouldRenderModal = isCreateMode || Boolean(updateTargetID)
  const formSessionKey = isCreateMode
    ? `create-${createSessionId}`
    : updateTargetID

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
              className='items-end p-2 sm:items-center sm:p-4'
            >
              <Modal.Dialog className='relative max-h-[calc(100dvh-1rem)] border border-border/70 bg-background shadow-2xl sm:max-w-[1100px]'>
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
