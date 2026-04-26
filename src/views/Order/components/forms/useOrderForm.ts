import { useState, useCallback, useMemo } from 'react'
import {
  ADJUSTMENT,
  DINING_METHOD,
  MEAT,
  PACKAGING,
  PACKAGING_METHOD,
  SIZE,
  STAPLE_TYPE,
  type MeatCode,
  type OrderFormValue,
  type OrderRecord,
  type PackagingCode,
  type PackagingMethodCode,
  type SizeCode,
  type StapleTypeCode,
} from '@/types'
import {
  createDefaultOrderFormValue,
  orderRecordToOrderFormValue,
} from '@/services/orderFormAdapter'
import { normalizeSelectedMeatCodes } from '@/services/orderDomainUtils'

export type FormMode = 'create' | 'edit'

const getNormalizedSizeCode = (
  stapleTypeCode: OrderFormValue['stapleTypeCode'],
  sizeCode: SizeCode,
): SizeCode =>
  stapleTypeCode === STAPLE_TYPE.rice && sizeCode === SIZE.small
    ? SIZE.medium
    : sizeCode

const getDefaultPackagingMethodCode = (
  diningMethodCode: OrderFormValue['diningMethodCode'],
  stapleTypeCode: OrderFormValue['stapleTypeCode'],
  packagingMethodCode: PackagingMethodCode | null,
): PackagingMethodCode | null => {
  if (diningMethodCode !== DINING_METHOD.takeout) {
    return null
  }

  if (packagingMethodCode != null) {
    return packagingMethodCode
  }

  return stapleTypeCode === STAPLE_TYPE.rice
    ? PACKAGING_METHOD.separated
    : PACKAGING_METHOD.together
}

type NormalizeFormValueStateOptions = Readonly<{
  previousEffectiveSize?: SizeCode
}>

// 只有交互式规格切换时才自动补选猪腰。
const normalizeSelectedMeatCodesForSizeTransition = (
  codes: readonly MeatCode[],
  nextEffectiveSize: SizeCode,
  previousEffectiveSize?: SizeCode,
): MeatCode[] => {
  const normalizedCodes = normalizeSelectedMeatCodes(codes, nextEffectiveSize)

  if (
    previousEffectiveSize !== SIZE.small ||
    nextEffectiveSize === SIZE.small ||
    normalizedCodes.includes(MEAT.kidney)
  ) {
    return normalizedCodes
  }

  return normalizeSelectedMeatCodes(
    [...normalizedCodes, MEAT.kidney],
    nextEffectiveSize,
  )
}

const normalizeFormValueState = (
  formValue: OrderFormValue,
  options: NormalizeFormValueStateOptions = {},
): OrderFormValue => {
  const sizeCode = getNormalizedSizeCode(formValue.stapleTypeCode, formValue.sizeCode)

  return {
    ...formValue,
    sizeCode,
    selectedMeatCodes: normalizeSelectedMeatCodesForSizeTransition(
      formValue.selectedMeatCodes,
      sizeCode,
      options.previousEffectiveSize,
    ),
    packagingMethodCode: getDefaultPackagingMethodCode(
      formValue.diningMethodCode,
      formValue.stapleTypeCode,
      formValue.packagingMethodCode,
    ),
  }
}

const getInitialFormValue = (initialItem?: OrderRecord): OrderFormValue =>
  normalizeFormValueState(
    initialItem
      ? orderRecordToOrderFormValue(initialItem)
      : createDefaultOrderFormValue(),
  )

const applyStapleTypeCode = (
  previousValue: OrderFormValue,
  stapleTypeCode: StapleTypeCode | null,
): OrderFormValue => {
  const previousEffectiveSize = getNormalizedSizeCode(
    previousValue.stapleTypeCode,
    previousValue.sizeCode,
  )

  return normalizeFormValueState(
    {
      ...previousValue,
      stapleTypeCode,
      stapleAmountCode:
        stapleTypeCode === null
          ? ADJUSTMENT.normal
          : previousValue.stapleAmountCode,
      extraStapleUnits:
        stapleTypeCode === STAPLE_TYPE.yiNoodle
          ? previousValue.extraStapleUnits
          : 0,
      packagingMethodCode:
        previousValue.diningMethodCode === DINING_METHOD.takeout &&
        stapleTypeCode === STAPLE_TYPE.rice
          ? PACKAGING_METHOD.separated
          : previousValue.packagingMethodCode,
    },
    { previousEffectiveSize },
  )
}

/**
 * 订单表单自定义 Hook
 * 封装表单状态管理和通用操作
 * @param initialItem - 初始订单项（编辑模式时传入）
 * @param mode - 表单模式：'create' 或 'edit'
 */
export const useOrderForm = (
  initialItem?: OrderRecord,
  mode: FormMode = 'create',
) => {
  const [num, setNum] = useState<number>(1)
  const [formValue, setFormValue] = useState<OrderFormValue>(() =>
    getInitialFormValue(initialItem),
  )

  /**
   * 更新订单表单字段
   */
  const updateFormValue = useCallback(
    <K extends keyof OrderFormValue>(key: K, value: OrderFormValue[K]) => {
      setFormValue((prev) => ({ ...prev, [key]: value }))
    },
    [],
  )

  const setStapleEnabled = useCallback((checked: boolean) => {
    setFormValue((prev) =>
      applyStapleTypeCode(
        prev,
        checked ? (prev.stapleTypeCode ?? STAPLE_TYPE.riceSheet) : null,
      ),
    )
  }, [])

  const setStapleTypeCode = useCallback((stapleTypeCode: StapleTypeCode) => {
    setFormValue((prev) => applyStapleTypeCode(prev, stapleTypeCode))
  }, [])

  const setSizeCode = useCallback((sizeCode: SizeCode) => {
    setFormValue((prev) =>
      normalizeFormValueState(
        {
          ...prev,
          sizeCode,
          customSizePriceCents:
            sizeCode === SIZE.custom ? prev.customSizePriceCents : null,
        },
        {
          previousEffectiveSize: getNormalizedSizeCode(
            prev.stapleTypeCode,
            prev.sizeCode,
          ),
        },
      ),
    )
  }, [])

  const setCustomSizePriceCents = useCallback((priceCents: number | null) => {
    setFormValue((prev) => ({
      ...prev,
      customSizePriceCents:
        prev.sizeCode === SIZE.custom ? priceCents : null,
    }))
  }, [])

  const setSelectedMeatCodes = useCallback((codes: MeatCode[]) => {
    setFormValue((prev) => ({
      ...prev,
      selectedMeatCodes: normalizeSelectedMeatCodes(codes, prev.sizeCode),
    }))
  }, [])

  const setDiningMethodCode = useCallback(
    (diningMethodCode: OrderFormValue['diningMethodCode']) => {
      setFormValue((prev) => {
        if (diningMethodCode === DINING_METHOD.dineIn) {
          return normalizeFormValueState({
            ...prev,
            diningMethodCode,
            packagingCode: null,
            packagingMethodCode: null,
          })
        }

        return normalizeFormValueState({
          ...prev,
          diningMethodCode,
          packagingCode: prev.packagingCode ?? PACKAGING.container,
          packagingMethodCode: prev.packagingMethodCode,
        })
      })
    },
    [],
  )

  const setPackagingCode = useCallback((packagingCode: PackagingCode) => {
    setFormValue((prev) => ({
      ...prev,
      packagingCode,
    }))
  }, [])

  const setPackagingMethodCode = useCallback(
    (packagingMethodCode: PackagingMethodCode) => {
      setFormValue((prev) => ({
        ...prev,
        packagingMethodCode,
      }))
    },
    [],
  )

  const setExtraStapleUnits = useCallback((extraStapleUnits: number) => {
    setFormValue((prev) => ({
      ...prev,
      extraStapleUnits: Math.max(0, Math.trunc(extraStapleUnits)),
    }))
  }, [])

  const setFriedEggCount = useCallback((friedEggCount: number) => {
    setFormValue((prev) => ({
      ...prev,
      friedEggCount: Math.max(0, Math.trunc(friedEggCount)),
    }))
  }, [])

  const setTofuSkewerCount = useCallback((tofuSkewerCount: number) => {
    setFormValue((prev) => ({
      ...prev,
      tofuSkewerCount: Math.max(0, Math.trunc(tofuSkewerCount)),
    }))
  }, [])

  const resetForm = useCallback(() => {
    setNum(1)
    setFormValue(getInitialFormValue(initialItem))
  }, [initialItem])

  const isValid = useMemo(() => {
    if (
      formValue.sizeCode === SIZE.custom &&
      (formValue.customSizePriceCents == null ||
        !Number.isInteger(formValue.customSizePriceCents) ||
        formValue.customSizePriceCents <= 0)
    ) {
      return false
    }

    if (
      formValue.diningMethodCode === DINING_METHOD.takeout &&
      (formValue.packagingCode == null || formValue.packagingMethodCode == null)
    ) {
      return false
    }

    if (
      formValue.stapleTypeCode === null &&
      formValue.selectedMeatCodes.length === 0
    ) {
      return false
    }

    return formValue.extraStapleUnits >= 0
        && formValue.friedEggCount >= 0
        && formValue.tofuSkewerCount >= 0
  }, [formValue])

  /**
   * 是否显示猪腰选项（小份不显示）
   */
  const showPorkKidney = useMemo(() => {
    return formValue.sizeCode !== SIZE.small
  }, [formValue.sizeCode])

  /**
   * 是否显示自定义价格输入
   */
  const showCustomPrice = useMemo(() => {
    return formValue.sizeCode === SIZE.custom
  }, [formValue.sizeCode])

  /**
   * 是否显示外带选项
   */
  const showTakeoutOptions = useMemo(() => {
    return formValue.diningMethodCode === DINING_METHOD.takeout
  }, [formValue.diningMethodCode])

  /**
   * 是否显示伊面面饼选项
   */
  const showYiNoodleBlocks = useMemo(() => {
    return formValue.stapleTypeCode === STAPLE_TYPE.yiNoodle
  }, [formValue.stapleTypeCode])

  return {
    formValue,
    setFormValue,
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
    resetForm,
    isValid,
    showPorkKidney,
    showCustomPrice,
    showTakeoutOptions,
    showYiNoodleBlocks,
    // 创建模式专用属性
    num: mode === 'create' ? num : undefined,
    setNum: mode === 'create' ? setNum : undefined,
  }
}
