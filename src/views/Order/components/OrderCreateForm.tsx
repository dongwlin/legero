import React, { useRef, useState } from "react"
import { CarbonAdd } from "@/components/Icon"
import {
  Adjustment,
  DiningMethod,
  MeatType,
  OrderItem,
  Packaging,
  PackagingMethod,
} from "@/types"
import { calcPrice, newDefaultOrderItem } from "@/service/order"
import { useOrderStore } from "@/store/order"
import dayjs from "dayjs"

const OrderCreateForm: React.FC = () => {
  const genID = useOrderStore((state) => state.genID)
  const addOrder = useOrderStore((state) => state.addOrder)

  const [num, setNum] = useState<number>(1)
  const [item, setItem] = useState<OrderItem>(newDefaultOrderItem())

  const dialogRef = useRef<HTMLDialogElement>(null)

  const handleDialogClose = () => {
    setNum(1)
    setItem(newDefaultOrderItem())
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

  const handleIncludeNoodlesChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setItem({
      ...item,
      includeNoodles: event.target.checked,
    })
  }

  const handleCustomSizePriceChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setItem({
      ...item,
      customSizePrice: Number(event.target.value),
    })
  }

  const handleNoodleAmountChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    setItem({
      ...item,
      noodleAmount: event.target.value as Adjustment,
    })
  }

  const handleMeatsChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const meat = event.target.value as MeatType
    const checked = event.target.checked

    if (checked) {
      setItem({
        ...item,
        meats: {
          available: [...item.meats.available, meat],
          excluded: item.meats.excluded.filter((m) => m !== meat),
        },
      })
    } else {
      setItem({
        ...item,
        meats: {
          available: item.meats.available.filter((m) => m !== meat),
          excluded: [...item.meats.excluded, meat],
        },
      })
    }
  }

  const handleGreensChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setItem({
      ...item,
      ingredients: {
        ...item.ingredients,
        greens: event.target.value as Adjustment,
      },
    })
  }

  const handleScallionChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    setItem({
      ...item,
      ingredients: {
        ...item.ingredients,
        scallion: event.target.value as Adjustment,
      },
    })
  }

  const handlePepperChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setItem({
      ...item,
      ingredients: {
        ...item.ingredients,
        pepper: event.target.value as Adjustment,
      },
    })
  }

  const handleDiningMethodChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const diningMethod = event.target.value as DiningMethod
    setItem({
      ...item,
      dining: {
        diningMethod: diningMethod,
        packaging: diningMethod === "外带" ? "塑料盒" : "无",
        packagingMethod: diningMethod === "外带" ? "装在一起" : "无",
      },
    })
  }

  const handlePackingChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const packaging = event.target.value as Packaging
    setItem({
      ...item,
      dining: {
        ...item.dining,
        packaging: packaging,
      },
    })
  }

  const handlePackingMethodChange = (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const packagingMethod = event.target.value as PackagingMethod
    setItem({
      ...item,
      dining: {
        ...item.dining,
        packagingMethod: packagingMethod,
      },
    })
  }

  const handleNoteChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setItem({
      ...item,
      note: event.target.value,
    })
  }

  const handleCreateOrder = () => {
    const now = dayjs().tz()
    const price = calcPrice(item)

    const newItem = {
      ...item,
      price: price,
      createdAt: now.toISOString(),
    }

    if (newItem.size === "小" && item.meats.available.includes("猪腰")) {
      newItem.meats.available = newItem.meats.available.filter(
        (meat) => meat !== "猪腰"
      )
    }
    if (newItem.includeNoodles) {
      newItem.progress.noodles = "not-started"
    } else {
      newItem.progress.noodles = "unrequired"
    }
    if (newItem.meats.available.length > 0) {
      newItem.progress.meat = "not-started"
    } else {
      newItem.progress.meat = "unrequired"
    }
    if (!newItem.includeNoodles) {
      newItem.noodleType = "无"
    }
    if (newItem.size !== "自定义") {
      newItem.customSizePrice = 0
    }

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

            <label className="fieldset-label text-xl">
              <span className="mr-2">数量</span>
              <button
                className="btn text-2xl"
                onClick={() => {
                  setNum(Math.max(num - 1, 1))
                }}
              >
                -
              </button>
              <span className="mx-2">{num}</span>
              <button
                className="btn text-2xl"
                onClick={() => {
                  setNum(num + 1)
                }}
              >
                +
              </button>
            </label>

            <div className="flex flex-row">
              <label className="fieldset-label text-xl mr-4">
                <span className="mr-2">粉</span>
                <input
                  type="checkbox"
                  checked={item.includeNoodles}
                  className="toggle toggle-success"
                  onChange={handleIncludeNoodlesChange}
                />
              </label>
              <div className="flex flex-row gap-3">
                <button
                  className={
                    item.noodleType === "河粉"
                      ? "btn text-xl btn-primary"
                      : "btn text-xl"
                  }
                  onClick={() => setItem({ ...item, noodleType: "河粉" })}
                >
                  河粉
                </button>
                <button
                  className={
                    item.noodleType === "米粉"
                      ? "btn text-xl btn-primary"
                      : "btn text-xl"
                  }
                  onClick={() => setItem({ ...item, noodleType: "米粉" })}
                >
                  米粉
                </button>
                <button
                  className={
                    item.noodleType === "伊面"
                      ? "btn text-xl btn-primary"
                      : "btn text-xl"
                  }
                  onClick={() => setItem({ ...item, noodleType: "伊面" })}
                >
                  伊面
                </button>
              </div>
            </div>

            <div className="flex flex-row">
              <label className="fieldset-label text-xl mr-4">规格</label>

              <div className="flex flex-row gap-3 mr-2 my-2">
                <button
                  className={
                    item.size === "小"
                      ? "btn text-xl btn-primary"
                      : "btn text-xl"
                  }
                  onClick={() => setItem({ ...item, size: "小" })}
                >
                  {!item.includeNoodles || item.noodleType === "无"
                    ? "小"
                    : (item.includeNoodles && item.noodleType === "河粉") ||
                      item.noodleType === "米粉"
                    ? "10"
                    : "11"}
                </button>
                <button
                  className={
                    item.size === "中"
                      ? "btn text-xl btn-primary"
                      : "btn text-xl"
                  }
                  onClick={() => setItem({ ...item, size: "中" })}
                >
                  {!item.includeNoodles || item.noodleType === "无"
                    ? "中"
                    : (item.includeNoodles && item.noodleType === "河粉") ||
                      item.noodleType === "米粉"
                    ? "12"
                    : "13"}
                </button>
                <button
                  className={
                    item.size === "大"
                      ? "btn text-xl btn-primary"
                      : "btn text-xl"
                  }
                  onClick={() => setItem({ ...item, size: "大" })}
                >
                  {!item.includeNoodles || item.noodleType === "无"
                    ? "大"
                    : (item.includeNoodles && item.noodleType === "河粉") ||
                      item.noodleType === "米粉"
                    ? "15"
                    : "16"}
                </button>
                <button
                  className={
                    item.size === "自定义"
                      ? "btn text-xl btn-primary"
                      : "btn text-xl"
                  }
                  onClick={() => setItem({ ...item, size: "自定义" })}
                >
                  自定义
                </button>
              </div>

              <label className="fieldset-label text-xl">
                {item.size === "自定义" && (
                  <input
                    type="text"
                    className="input"
                    value={item.customSizePrice}
                    onChange={handleCustomSizePriceChange}
                  />
                )}
              </label>
            </div>

            <label className="fieldset-label text-xl">
              {item.noodleType === "伊面" ? (
                <>
                  <span className="mr-2">面饼</span>
                  <div className="flex gap-2 items-center">
                    <button
                      className="btn text-xl"
                      onClick={() =>
                        setItem({
                          ...item,
                          extraNoodleBlocks: Math.max(
                            item.extraNoodleBlocks - 1,
                            0
                          ),
                        })
                      }
                    >
                      -
                    </button>
                    <span className="text-xl">
                      {item.extraNoodleBlocks + 1}
                    </span>
                    <button
                      className="btn text-xl"
                      onClick={() =>
                        setItem({
                          ...item,
                          extraNoodleBlocks: item.extraNoodleBlocks + 1,
                        })
                      }
                    >
                      +
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="mr-2">粉量</span>
                  <select
                    name="noodleAmount"
                    className="select text-xl"
                    value={item.noodleAmount}
                    onChange={handleNoodleAmountChange}
                    disabled={!item.includeNoodles}
                  >
                    <option>多</option>
                    <option>正常</option>
                    <option>少</option>
                  </select>
                </>
              )}
            </label>

            <div className="flex flex-row flex-wrap text-xl gap-6 my-2">
              <label className="fieldset-label">
                <input
                  type="checkbox"
                  name="瘦肉"
                  value="瘦肉"
                  className="checkbox checkbox-success"
                  checked={item.meats.available.includes("瘦肉")}
                  onChange={handleMeatsChange}
                />
                <span>瘦肉</span>
              </label>

              <label className="fieldset-label">
                <input
                  type="checkbox"
                  name="猪血"
                  value="猪血"
                  className="checkbox checkbox-success"
                  checked={item.meats.available.includes("猪血")}
                  onChange={handleMeatsChange}
                />
                <span>猪血</span>
              </label>

              <label className="fieldset-label">
                <input
                  type="checkbox"
                  name="猪肝"
                  value="猪肝"
                  className="checkbox checkbox-success"
                  checked={item.meats.available.includes("猪肝")}
                  onChange={handleMeatsChange}
                />
                <span>猪肝</span>
              </label>

              <label className="fieldset-label">
                <input
                  type="checkbox"
                  name="小肠"
                  value="小肠"
                  className="checkbox checkbox-success"
                  checked={item.meats.available.includes("小肠")}
                  onChange={handleMeatsChange}
                />
                <span>小肠</span>
              </label>

              <label className="fieldset-label">
                <input
                  type="checkbox"
                  name="大肠"
                  value="大肠"
                  className="checkbox checkbox-success"
                  checked={item.meats.available.includes("大肠")}
                  onChange={handleMeatsChange}
                />
                <span>大肠</span>
              </label>

              {item.size !== "小" && (
                <label className="fieldset-label">
                  <input
                    type="checkbox"
                    name="猪腰"
                    value="猪腰"
                    className="checkbox checkbox-success"
                    checked={item.meats.available.includes("猪腰")}
                    onChange={handleMeatsChange}
                  />
                  <span>猪腰</span>
                </label>
              )}
            </div>

            <label className="fieldset-label text-xl">
              <span className="mr-2">青菜</span>
              <select
                name="青菜"
                className="select text-xl"
                value={item.ingredients.greens}
                onChange={handleGreensChange}
              >
                <option>多</option>
                <option>正常</option>
                <option>少</option>
                <option>不要</option>
              </select>
            </label>

            <label className="fieldset-label text-xl">
              <span className="mr-2">葱花</span>
              <select
                name="葱花"
                className="select text-xl"
                value={item.ingredients.scallion}
                onChange={handleScallionChange}
              >
                <option>多</option>
                <option>正常</option>
                <option>少</option>
                <option>不要</option>
              </select>
            </label>

            <label className="fieldset-label text-xl">
              <span className="mr-2">胡椒</span>
              <select
                name="胡椒"
                className="select text-xl"
                value={item.ingredients.pepper}
                onChange={handlePepperChange}
              >
                <option>多</option>
                <option>正常</option>
                <option>少</option>
                <option>不要</option>
              </select>
            </label>

            <label className="fieldset-label text-xl">
              <span className="mr-2">就餐方式</span>
              <select
                name="就餐方式"
                className="select text-xl"
                value={item.dining.diningMethod}
                onChange={handleDiningMethodChange}
              >
                <option>堂食</option>
                <option>外带</option>
              </select>
            </label>

            {item.dining.diningMethod === "外带" && (
              <>
                <label className="fieldset-label text-xl">
                  <span>打包包装</span>
                  <select
                    name="打包包装"
                    className="select text-xl"
                    value={item.dining.packaging}
                    onChange={handlePackingChange}
                  >
                    <option value="塑料盒">塑料盒</option>
                    <option value="塑料袋">塑料袋</option>
                  </select>
                </label>

                <label className="fieldset-label text-xl">
                  <span className="mr-2">打包方式</span>
                  <select
                    name="打包方式"
                    className="select text-xl"
                    value={item.dining.packagingMethod}
                    onChange={handlePackingMethodChange}
                  >
                    <option>装在一起</option>
                    <option>汤粉分开</option>
                  </select>
                </label>
              </>
            )}

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
              disabled={
                (item.includeNoodles && item.noodleType === "无") ||
                item.size === "无" ||
                (item.meats.available.length === 0 && !item.includeNoodles)
              }
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
