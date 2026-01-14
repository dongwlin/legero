import { calcPrice, newDefaultOrderItem } from "@/services/order"
import { useOrderStore } from "@/store/order"
import {
  Adjustment,
  DiningMethod,
  OrderItem,
  Packaging,
  PackagingMethod,
} from "@/types"
import React, { useEffect, useRef } from "react"
import { useOrderEditForm } from "./useOrderEditForm"
import { NoodleSelector } from "./selectors/NoodleSelector"
import { SizeSelector } from "./selectors/SizeSelector"
import { NoodleAmountSelector } from "./selectors/NoodleAmountSelector"
import { MeatSelector } from "./selectors/MeatSelector"
import { IngredientSelector } from "./selectors/IngredientSelector"
import { DiningSelector } from "./selectors/DiningSelector"

const OrderEditForm: React.FC = () => {
  const updateTargetID = useOrderStore((state) => state.updateTargetID)
  const setUpdateTargetID = useOrderStore((state) => state.setUpdateTargetID)
  const findOrder = useOrderStore((state) => state.findOrder)
  const updateOrder = useOrderStore((state) => state.updateOrder)

  const dialogRef = useRef<HTMLDialogElement>(null)

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

  const handleDialogClose = () => {
    setUpdateTargetID("")
  }

  const {
    item,
    setItem,
    updateItem,
    updateNestedItem,
    updateMeats,
    isValid,
    showPorkKidney,
    showCustomPrice,
    showTakeoutOptions
  } = useOrderEditForm(newDefaultOrderItem())

  useEffect(() => {
    if (updateTargetID) {
      const targetItem = findOrder(updateTargetID)
      if (targetItem) {
        setTimeout(() => {
          setItem(targetItem)
          openDialog()
        }, 0)
      }
    }
  }, [updateTargetID, findOrder, setItem])

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

  const handleUpdateOrder = () => {
    const price = calcPrice(item)

    const newItem: OrderItem = {
      ...item,
      price,
    }
    setItem(newItem)

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

    updateOrder(updateTargetID, newItem)
    closeDialog()
  }

  return (
    <dialog ref={dialogRef} className="modal" onClose={handleDialogClose}>
      <div className="modal-box w-11/12 max-w-5xl">
        <form method="dialog">
          <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">
            ✕
          </button>
        </form>

        <fieldset className="fieldset rounded-box">
          <legend className="fieldset-legend text-2xl font-bold mb-2">
            修改订单
          </legend>

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
            onClick={handleUpdateOrder}
            disabled={!isValid}
          >
            修改
          </button>
        </fieldset>
      </div>

      <form method="dialog" className="modal-backdrop">
        <button>Cancel</button>
      </form>
    </dialog>
  )
}

export default OrderEditForm
