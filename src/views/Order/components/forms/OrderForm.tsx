import React, { useEffect, useState } from 'react'
import { CarbonAdd } from '@/components/Icon'
import { Button, CloseButton, Modal, Separator, TextArea } from '@heroui/react'
import {
  OrderItem,
  Adjustment,
  DiningMethod,
  Packaging,
  PackagingMethod,
} from '@/types'
import { calcPrice } from '@/services/order'
import { useOrderStore } from '@/store/order'
import dayjs from 'dayjs'
import { useOrderForm, FormMode } from './useOrderForm'
import { QuantitySelector } from '../selectors/QuantitySelector'
import { NoodleSelector } from '../selectors/NoodleSelector'
import { SizeSelector } from '../selectors/SizeSelector'
import { NoodleAmountSelector } from '../selectors/NoodleAmountSelector'
import { MeatSelector } from '../selectors/MeatSelector'
import { IngredientSelector } from '../selectors/IngredientSelector'
import { DiningSelector } from '../selectors/DiningSelector'
import OrderField from '../OrderField'

const sectionSeparatorClassName = 'w-full border-t border-border/60'
const columnSeparatorClassName =
  'hidden w-0 self-stretch border-l border-border/60 md:block'
const footerButtonClassName =
  'h-11 min-w-20 rounded-xl px-4 text-sm font-semibold touch-manipulation md:h-12 md:text-base'

interface OrderFormProps {
  mode: FormMode
  initialItem?: OrderItem
}

const OrderForm: React.FC<OrderFormProps> = ({ mode, initialItem }) => {
  const genID = useOrderStore((state) => state.genID)
  const addOrder = useOrderStore((state) => state.addOrder)
  const updateOrder = useOrderStore((state) => state.updateOrder)
  const updateTargetID = useOrderStore((state) => state.updateTargetID)
  const setUpdateTargetID = useOrderStore((state) => state.setUpdateTargetID)
  const findOrder = useOrderStore((state) => state.findOrder)
  const [isOpen, setIsOpen] = useState(false)

  const {
    num,
    setNum,
    item,
    setItem,
    updateItem,
    updateNestedItem,
    updateMeats,
    resetForm,
    isValid,
    showPorkKidney,
    showCustomPrice,
    showTakeoutOptions,
  } = useOrderForm(initialItem, mode)

  const handleDialogClose = () => {
    if (mode === 'create') {
      resetForm?.()
    } else {
      setUpdateTargetID('')
    }
  }

  // 编辑模式下，监听 updateTargetID 变化并打开对话框
  useEffect(() => {
    if (mode === 'edit' && updateTargetID) {
      const targetItem = findOrder(updateTargetID)
      if (targetItem) {
        setItem(targetItem)
        setIsOpen(true)
      }
    }
  }, [updateTargetID, findOrder, setItem, mode])

  const handleOpenChange = (nextOpen: boolean) => {
    setIsOpen(nextOpen)
    if (!nextOpen) {
      handleDialogClose()
    }
  }

  const handleIncludeNoodlesChange = (checked: boolean) => {
    updateItem('includeNoodles', checked)
  }

  const handleCustomSizePriceChange = (price: number) => {
    updateItem('customSizePrice', price)
  }

  const handleNoodleAmountChange = (amount: Adjustment) => {
    updateItem('noodleAmount', amount)
  }

  const handleExtraNoodleBlocksChange = (blocks: number) => {
    updateItem('extraNoodleBlocks', blocks)
  }

  const handleGreensChange = (value: Adjustment) => {
    updateNestedItem('ingredients', 'greens', value)
  }

  const handleScallionChange = (value: Adjustment) => {
    updateNestedItem('ingredients', 'scallion', value)
  }

  const handlePepperChange = (value: Adjustment) => {
    updateNestedItem('ingredients', 'pepper', value)
  }

  const handleDiningMethodChange = (diningMethod: DiningMethod) => {
    updateItem('dining', {
      diningMethod: diningMethod,
      packaging: diningMethod === '外带' ? '塑料盒' : '无',
      packagingMethod: diningMethod === '外带' ? '装在一起' : '无',
    })
  }

  const handlePackingChange = (packaging: Packaging) => {
    updateNestedItem('dining', 'packaging', packaging)
  }

  const handlePackingMethodChange = (packagingMethod: PackagingMethod) => {
    updateNestedItem('dining', 'packagingMethod', packagingMethod)
  }

  const handleNoteChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateItem('note', event.target.value)
  }

  const handleSubmit = (close: () => void) => {
    const now = dayjs().tz()
    const price = calcPrice(item)

    const newItem: OrderItem = {
      ...item,
      price: price,
    }

    // 小份不包含猪腰
    if (newItem.size === '小' && item.meats.available.includes('猪腰')) {
      newItem.meats.available = newItem.meats.available.filter(
        (meat) => meat !== '猪腰',
      )
    }

    // 设置面条进度
    if (newItem.includeNoodles) {
      newItem.progress.noodles = 'not-started'
    } else {
      newItem.progress.noodles = 'unrequired'
    }

    // 设置肉类进度
    if (newItem.meats.available.length > 0) {
      newItem.progress.meat = 'not-started'
    } else {
      newItem.progress.meat = 'unrequired'
    }

    // 不包含面条时，面条类型设为无
    if (!newItem.includeNoodles) {
      newItem.noodleType = '无'
    }

    // 非自定义规格时，自定义价格设为0
    if (newItem.size !== '自定义') {
      newItem.customSizePrice = 0
    }

    if (mode === 'create') {
      // 创建订单模式
      newItem.createdAt = now.toISOString()

      // 创建多个订单
      for (let i = 0; i < (num || 1); i++) {
        const id = genID()
        const saveItem = {
          ...newItem,
          id: id,
        }
        addOrder(saveItem)
      }
    } else {
      // 编辑订单模式
      setItem(newItem)
      updateOrder(updateTargetID, newItem)
    }

    close()
  }

  const isCreateMode = mode === 'create'
  const formTitle = isCreateMode ? '创建订单' : '修改订单'
  const submitButtonText = isCreateMode ? '创建' : '修改'
  const shouldRenderModal = isCreateMode || isOpen

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

                    <Modal.Body className='py-4'>
                      <div className='flex flex-col'>
                        <div className='pb-2.5'>
                          {isCreateMode ? (
                            <div className='grid items-stretch gap-2.5 md:grid-cols-[minmax(0,1fr)_1px_12rem_1px_12rem] md:gap-x-4'>
                              <div className='h-full'>
                                <NoodleSelector
                                  includeNoodles={item.includeNoodles}
                                  noodleType={item.noodleType}
                                  onIncludeNoodlesChange={handleIncludeNoodlesChange}
                                  onNoodleTypeChange={(type) => updateItem('noodleType', type)}
                                />
                              </div>
                              <Separator
                                orientation='vertical'
                                className={columnSeparatorClassName}
                              />
                              <div className='h-full'>
                                <NoodleAmountSelector
                                  noodleType={item.noodleType}
                                  noodleAmount={item.noodleAmount}
                                  extraNoodleBlocks={item.extraNoodleBlocks}
                                  includeNoodles={item.includeNoodles}
                                  onNoodleAmountChange={handleNoodleAmountChange}
                                  onExtraNoodleBlocksChange={handleExtraNoodleBlocksChange}
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
                              <NoodleSelector
                                includeNoodles={item.includeNoodles}
                                noodleType={item.noodleType}
                                onIncludeNoodlesChange={handleIncludeNoodlesChange}
                                onNoodleTypeChange={(type) => updateItem('noodleType', type)}
                              />
                            </div>
                          )}
                        </div>

                        <Separator className={sectionSeparatorClassName} />

                        <div className='py-2.5'>
                          {isCreateMode ? (
                            <div>
                              <SizeSelector
                                size={item.size}
                                includeNoodles={item.includeNoodles}
                                noodleType={item.noodleType}
                                customSizePrice={item.customSizePrice}
                                onSizeChange={(size) => updateItem('size', size)}
                                onCustomSizePriceChange={handleCustomSizePriceChange}
                                showCustomPrice={showCustomPrice}
                              />
                            </div>
                          ) : (
                            <div className='grid items-stretch gap-2.5 md:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] md:gap-x-4'>
                              <div className='h-full'>
                                <SizeSelector
                                  size={item.size}
                                  includeNoodles={item.includeNoodles}
                                  noodleType={item.noodleType}
                                  customSizePrice={item.customSizePrice}
                                  onSizeChange={(size) => updateItem('size', size)}
                                  onCustomSizePriceChange={handleCustomSizePriceChange}
                                  showCustomPrice={showCustomPrice}
                                />
                              </div>

                              <Separator
                                orientation='vertical'
                                className={columnSeparatorClassName}
                              />

                              <div className='h-full'>
                                <NoodleAmountSelector
                                  noodleType={item.noodleType}
                                  noodleAmount={item.noodleAmount}
                                  extraNoodleBlocks={item.extraNoodleBlocks}
                                  includeNoodles={item.includeNoodles}
                                  onNoodleAmountChange={handleNoodleAmountChange}
                                  onExtraNoodleBlocksChange={handleExtraNoodleBlocksChange}
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        <Separator className={sectionSeparatorClassName} />

                        <div className='py-2.5'>
                          <MeatSelector
                            availableMeats={item.meats.available}
                            onMeatChange={updateMeats}
                            showPorkKidney={showPorkKidney}
                          />
                        </div>

                        <Separator className={sectionSeparatorClassName} />

                        <div className='py-2.5'>
                          <IngredientSelector
                            greens={item.ingredients.greens}
                            scallion={item.ingredients.scallion}
                            pepper={item.ingredients.pepper}
                            onGreensChange={handleGreensChange}
                            onScallionChange={handleScallionChange}
                            onPepperChange={handlePepperChange}
                          />
                        </div>

                        <Separator className={sectionSeparatorClassName} />

                        <div className='py-2.5'>
                          <DiningSelector
                            diningMethod={item.dining.diningMethod}
                            packaging={item.dining.packaging}
                            packagingMethod={item.dining.packagingMethod}
                            onDiningMethodChange={handleDiningMethodChange}
                            onPackagingChange={handlePackingChange}
                            onPackagingMethodChange={handlePackingMethodChange}
                            showTakeoutOptions={showTakeoutOptions}
                          />
                        </div>

                        <Separator className={sectionSeparatorClassName} />

                        <div className='pt-2.5'>
                          <OrderField label=''>
                            <TextArea
                              fullWidth
                              rows={3}
                              variant='secondary'
                              className='min-h-20 rounded-xl'
                              value={item.note}
                              onChange={handleNoteChange}
                            />
                          </OrderField>
                        </div>
                      </div>
                    </Modal.Body>

                    <Modal.Footer className='border-t border-border/60 px-4 py-3 md:px-5'>
                      <div className='flex w-full flex-row gap-4'>
                        <Button.Root
                          variant='outline'
                          className={`${footerButtonClassName} basis-0 flex-1`}
                          onPress={close}
                        >
                          取消
                        </Button.Root>
                        <Button.Root
                          isDisabled={!isValid}
                          variant='primary'
                          className={`${footerButtonClassName} basis-0 flex-1`}
                          onPress={() => handleSubmit(close)}
                        >
                          {submitButtonText}
                        </Button.Root>
                      </div>
                    </Modal.Footer>
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
