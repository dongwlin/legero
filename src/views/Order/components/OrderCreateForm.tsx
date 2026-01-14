import React, { useRef } from "react"
import { CarbonAdd } from "@/components/Icon"
import { OrderItem, Adjustment, DiningMethod, Packaging, PackagingMethod } from "@/types"
import { calcPrice } from "@/services/order"
import { useOrderStore } from "@/store/order"
import dayjs from "dayjs"
import { useOrderForm } from "./useOrderForm"
import { QuantitySelector } from "./QuantitySelector"
import { NoodleSelector } from "./NoodleSelector"
import { SizeSelector } from "./SizeSelector"
import { NoodleAmountSelector } from "./NoodleAmountSelector"
import { MeatSelector } from "./MeatSelector"
import { IngredientSelector } from "./IngredientSelector"
import { DiningSelector } from "./DiningSelector"

const OrderCreateForm: React.FC = () => {
  const genID = useOrderStore((state) => state.genID)
  const addOrder = useOrderStore((state) => state.addOrder)

  const {
    num,
    setNum,
    item,
    updateItem,
    updateNestedItem,
    updateMeats,
    resetForm,
    isValid,
    showPorkKidney,
    showCustomPrice,
    showTakeoutOptions
  } = useOrderForm()

  const dialogRef = useRef<HTMLDialogElement>(null)

  const handleDialogClose = () => {
    resetForm()
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

  const handleCreateOrder = () => {
    const now = dayjs().tz()
    const price = calcPrice(item)

    const newItem: OrderItem = {
      ...item,
      price: price,
      createdAt: now.toISOString(),
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

    // 创建多个订单
    for (let i = 0; i < num; i++) {
      const id = genID()
      const saveItem = {
        ...newItem,
        id: id,
      }
      addOrder(saveItem)
    }
    closeDialog()
  }

  return (
    <>
      <button className="btn" onClick={openDialog}>
        <CarbonAdd className="size-10 btn-ghost" />
      </button>
      <dialog ref={dialogRef} className="modal" onClose={handleDialogClose}>
        <div className="modal-box w-11/12 max-w-5xl">
          <form method="dialog">
            <button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">
              ✕
            </button>
          </form>

          <fieldset className="fieldset rounded-box">
            <legend className="fieldset-legend text-2xl font-bold mb-2">
              创建订单
            </legend>

            <QuantitySelector num={num} setNum={setNum} />

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
              onClick={handleCreateOrder}
              disabled={!isValid}
            >
              创建
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

export default OrderCreateForm
