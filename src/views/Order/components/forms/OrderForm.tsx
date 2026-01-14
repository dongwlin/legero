import React, { useEffect, useRef } from "react"
import { CarbonAdd } from "@/components/Icon"
import { OrderItem, Adjustment, DiningMethod, Packaging, PackagingMethod } from "@/types"
import { calcPrice, newDefaultOrderItem } from "@/services/order"
import { useOrderStore } from "@/store/order"
import dayjs from "dayjs"
import { useOrderForm, FormMode } from "./useOrderForm"
import { QuantitySelector } from "../selectors/QuantitySelector"
import { NoodleSelector } from "../selectors/NoodleSelector"
import { SizeSelector } from "../selectors/SizeSelector"
import { NoodleAmountSelector } from "../selectors/NoodleAmountSelector"
import { MeatSelector } from "../selectors/MeatSelector"
import { IngredientSelector } from "../selectors/IngredientSelector"
import { DiningSelector } from "../selectors/DiningSelector"

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

  const dialogRef = useRef<HTMLDialogElement>(null)

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
    showTakeoutOptions
  } = useOrderForm(initialItem, mode)

  // 编辑模式下，监听 updateTargetID 变化并打开对话框
  useEffect(() => {
    if (mode === 'edit' && updateTargetID) {
      const targetItem = findOrder(updateTargetID)
      if (targetItem) {
        setTimeout(() => {
          setItem(targetItem)
          openDialog()
        }, 0)
      }
    }
  }, [updateTargetID, findOrder, setItem, mode])

  const handleDialogClose = () => {
    if (mode === 'create') {
      resetForm?.()
    } else {
      setUpdateTargetID("")
    }
  }

  const openDialog = () => {
    if (dialogRef.current) {
      dialogRef.current.showModal()
    }
  }

  const closeDialog = () => {
    if (dialogRef.current) {
      dialogRef.current.close()
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
      packaging: diningMethod === "外带" ? "塑料盒" : "无",
      packagingMethod: diningMethod === "外带" ? "装在一起" : "无",
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

  const handleSubmit = () => {
    const now = dayjs().tz()
    const price = calcPrice(item)

    const newItem: OrderItem = {
      ...item,
      price: price,
    }

    // 小份不包含猪腰
    if (newItem.size === "小" && item.meats.available.includes("猪腰")) {
      newItem.meats.available = newItem.meats.available.filter(
        (meat) => meat !== "猪腰"
      )
    }

    // 设置面条进度
    if (newItem.includeNoodles) {
      newItem.progress.noodles = "not-started"
    } else {
      newItem.progress.noodles = "unrequired"
    }

    // 设置肉类进度
    if (newItem.meats.available.length > 0) {
      newItem.progress.meat = "not-started"
    } else {
      newItem.progress.meat = "unrequired"
    }

    // 不包含面条时，面条类型设为无
    if (!newItem.includeNoodles) {
      newItem.noodleType = "无"
    }

    // 非自定义规格时，自定义价格设为0
    if (newItem.size !== "自定义") {
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
    
    closeDialog()
  }

  const isCreateMode = mode === 'create'
  const formTitle = isCreateMode ? "创建订单" : "修改订单"
  const submitButtonText = isCreateMode ? "创建" : "修改"

  return (
    <>
      {isCreateMode && (
        <button className="btn" onClick={openDialog}>
          <CarbonAdd className="size-10 btn-ghost" />
        </button>
      )}
      <dialog ref={dialogRef} className="modal" onClose={handleDialogClose}>
        <div className="modal-box w-11/12 max-w-5xl">
          <form method="dialog">
            <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">
              ✕
            </button>
          </form>

          <fieldset className="fieldset rounded-box">
            <legend className="fieldset-legend text-2xl font-bold mb-2">
              {formTitle}
            </legend>

            {isCreateMode && (
              <QuantitySelector num={num || 1} setNum={setNum || (() => {})} />
            )}

            <NoodleSelector
              includeNoodles={item.includeNoodles}
              noodleType={item.noodleType}
              onIncludeNoodlesChange={handleIncludeNoodlesChange}
              onNoodleTypeChange={(type) => updateItem('noodleType', type)}
            />

            <SizeSelector
              size={item.size}
              includeNoodles={item.includeNoodles}
              noodleType={item.noodleType}
              customSizePrice={item.customSizePrice}
              onSizeChange={(size) => updateItem('size', size)}
              onCustomSizePriceChange={handleCustomSizePriceChange}
              showCustomPrice={showCustomPrice}
            />

            <NoodleAmountSelector
              noodleType={item.noodleType}
              noodleAmount={item.noodleAmount}
              extraNoodleBlocks={item.extraNoodleBlocks}
              includeNoodles={item.includeNoodles}
              onNoodleAmountChange={handleNoodleAmountChange}
              onExtraNoodleBlocksChange={handleExtraNoodleBlocksChange}
            />

            <MeatSelector
              availableMeats={item.meats.available}
              onMeatChange={updateMeats}
              showPorkKidney={showPorkKidney}
            />

            <IngredientSelector
              greens={item.ingredients.greens}
              scallion={item.ingredients.scallion}
              pepper={item.ingredients.pepper}
              onGreensChange={handleGreensChange}
              onScallionChange={handleScallionChange}
              onPepperChange={handlePepperChange}
            />

            <DiningSelector
              diningMethod={item.dining.diningMethod}
              packaging={item.dining.packaging}
              packagingMethod={item.dining.packagingMethod}
              onDiningMethodChange={handleDiningMethodChange}
              onPackagingChange={handlePackingChange}
              onPackagingMethodChange={handlePackingMethodChange}
              showTakeoutOptions={showTakeoutOptions}
            />

            <label className="fieldset-label text-xl">
              <span className="mr-2">备注</span>
              <textarea
                className="textarea text-xl"
                value={item.note}
                onChange={handleNoteChange}
              />
            </label>

            <button
              className="btn btn-primary text-xl"
              onClick={handleSubmit}
              disabled={!isValid}
            >
              {submitButtonText}
            </button>
          </fieldset>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>Cancel</button>
        </form>
      </dialog>
    </>
  )
}

export default OrderForm
