import { useState, useCallback, useMemo } from "react"
import { OrderItem, MeatType } from "@/types"

/**
 * 订单编辑表单自定义 Hook
 * 封装编辑表单的状态管理和通用操作
 */
export const useOrderEditForm = (initialItem: OrderItem) => {
  const [item, setItem] = useState<OrderItem>(initialItem)

  /**
   * 更新订单项的顶层属性
   */
  const updateItem = useCallback(<K extends keyof OrderItem>(
    key: K,
    value: OrderItem[K]
  ) => {
    setItem(prev => ({ ...prev, [key]: value }))
  }, [])

  /**
   * 更新订单项的嵌套属性
   */
  const updateNestedItem = useCallback<
    <T extends keyof OrderItem, K extends keyof OrderItem[T]>(
      parentKey: T,
      childKey: K,
      value: OrderItem[T][K]
    ) => void
  >((parentKey, childKey, value) => {
    setItem(prev => {
      const parentValue = prev[parentKey]
      if (typeof parentValue === 'object' && parentValue !== null) {
        return {
          ...prev,
          [parentKey]: { ...parentValue, [childKey]: value }
        }
      }
      return prev
    })
  }, [])

  /**
   * 更新肉类选择
   */
  const updateMeats = useCallback((meat: MeatType, checked: boolean) => {
    setItem(prev => {
      const { available, excluded } = prev.meats

      if (checked) {
        return {
          ...prev,
          meats: {
            available: [...available, meat],
            excluded: excluded.filter(m => m !== meat)
          }
        }
      }

      return {
        ...prev,
        meats: {
          available: available.filter(m => m !== meat),
          excluded: [...excluded, meat]
        }
      }
    })
  }, [])

  /**
   * 验证表单是否有效
   */
  const isValid = useMemo(() => {
    return !(
      (item.includeNoodles && item.noodleType === '无') ||
      item.size === '无' ||
      (item.meats.available.length === 0 && !item.includeNoodles)
    )
  }, [item.includeNoodles, item.noodleType, item.size, item.meats.available.length])

  /**
   * 是否显示猪腰选项（小份不显示）
   */
  const showPorkKidney = useMemo(() => {
    return item.size !== '小'
  }, [item.size])

  /**
   * 是否显示自定义价格输入
   */
  const showCustomPrice = useMemo(() => {
    return item.size === '自定义'
  }, [item.size])

  /**
   * 是否显示外带选项
   */
  const showTakeoutOptions = useMemo(() => {
    return item.dining.diningMethod === '外带'
  }, [item.dining.diningMethod])

  return {
    item,
    setItem,
    updateItem,
    updateNestedItem,
    updateMeats,
    isValid,
    showPorkKidney,
    showCustomPrice,
    showTakeoutOptions
  }
}
