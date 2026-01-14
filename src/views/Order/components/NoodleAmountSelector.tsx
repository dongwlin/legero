import React from "react"
import { ADJUSTMENT_OPTIONS } from "./constants"
import { Adjustment, NoodleType } from "@/types"

interface NoodleAmountSelectorProps {
  noodleType: NoodleType
  noodleAmount: Adjustment
  extraNoodleBlocks: number
  includeNoodles: boolean
  onNoodleAmountChange: (amount: Adjustment) => void
  onExtraNoodleBlocksChange: (blocks: number) => void
}

/**
 * 面条数量选择器组件
 * 根据面条类型显示不同的选择器
 */
export const NoodleAmountSelector: React.FC<NoodleAmountSelectorProps> = ({
  noodleType,
  noodleAmount,
  extraNoodleBlocks,
  includeNoodles,
  onNoodleAmountChange,
  onExtraNoodleBlocksChange
}) => {
  if (noodleType === '伊面') {
    return (
      <label className="fieldset-label text-xl">
        <span className="mr-2">面饼</span>
        <div className="flex gap-2 items-center">
          <button
            className="btn text-xl"
            onClick={() => onExtraNoodleBlocksChange(Math.max(extraNoodleBlocks - 1, 0))}
            aria-label="减少面饼"
          >
            -
          </button>
          <span className="text-xl">{extraNoodleBlocks + 1}</span>
          <button
            className="btn text-xl"
            onClick={() => onExtraNoodleBlocksChange(extraNoodleBlocks + 1)}
            aria-label="增加面饼"
          >
            +
          </button>
        </div>
      </label>
    )
  }

  return (
    <label className="fieldset-label text-xl">
      <span className="mr-2">粉量</span>
      <select
        name="noodleAmount"
        className="select text-xl"
        value={noodleAmount}
        onChange={(e) => onNoodleAmountChange(e.target.value as Adjustment)}
        disabled={!includeNoodles}
      >
        {ADJUSTMENT_OPTIONS.slice(0, 3).map(option => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  )
}
