import React, { useMemo } from "react"
import { ToggleButtonGroup } from "@/components/ToggleButtonGroup"
import { SIZES } from "./constants"
import { NoodleType, Size } from "@/types"
import { getSizeDisplayValue } from "./constants"

interface SizeSelectorProps {
  size: Size
  includeNoodles: boolean
  noodleType: NoodleType
  customSizePrice: number
  onSizeChange: (size: Size) => void
  onCustomSizePriceChange: (price: number) => void
  showCustomPrice: boolean
}

/**
 * 规格选择器组件
 */
export const SizeSelector: React.FC<SizeSelectorProps> = ({
  size,
  includeNoodles,
  noodleType,
  customSizePrice,
  onSizeChange,
  onCustomSizePriceChange,
  showCustomPrice
}) => {
  const getDisplayValue = useMemo(() => {
    return (s: Size) => getSizeDisplayValue(s, includeNoodles, noodleType)
  }, [includeNoodles, noodleType, size])

  return (
    <div className="flex flex-row">
      <label className="fieldset-label text-xl mr-4">规格</label>

      <div className="flex flex-row gap-3 mr-2 my-2">
        <ToggleButtonGroup
          options={SIZES}
          value={size}
          onChange={onSizeChange}
          getDisplayValue={getDisplayValue}
        />
      </div>

      <label className="fieldset-label text-xl">
        {showCustomPrice && (
          <input
            type="text"
            className="input"
            value={customSizePrice}
            onChange={(e) => onCustomSizePriceChange(Number(e.target.value))}
          />
        )}
      </label>
    </div>
  )
}
