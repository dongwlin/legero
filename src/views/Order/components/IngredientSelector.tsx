import React from "react"
import { ADJUSTMENT_OPTIONS } from "./constants"
import { Adjustment } from "@/types"

interface IngredientSelectorProps {
  greens: Adjustment
  scallion: Adjustment
  pepper: Adjustment
  onGreensChange: (value: Adjustment) => void
  onScallionChange: (value: Adjustment) => void
  onPepperChange: (value: Adjustment) => void
}

/**
 * 配料选择器组件
 */
export const IngredientSelector: React.FC<IngredientSelectorProps> = ({
  greens,
  scallion,
  pepper,
  onGreensChange,
  onScallionChange,
  onPepperChange
}) => {
  return (
    <>
      <label className="fieldset-label text-xl">
        <span className="mr-2">青菜</span>
        <select
          name="青菜"
          className="select text-xl"
          value={greens}
          onChange={(e) => onGreensChange(e.target.value as Adjustment)}
        >
          {ADJUSTMENT_OPTIONS.map(option => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </label>

      <label className="fieldset-label text-xl">
        <span className="mr-2">葱花</span>
        <select
          name="葱花"
          className="select text-xl"
          value={scallion}
          onChange={(e) => onScallionChange(e.target.value as Adjustment)}
        >
          {ADJUSTMENT_OPTIONS.map(option => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </label>

      <label className="fieldset-label text-xl">
        <span className="mr-2">胡椒</span>
        <select
          name="胡椒"
          className="select text-xl"
          value={pepper}
          onChange={(e) => onPepperChange(e.target.value as Adjustment)}
        >
          {ADJUSTMENT_OPTIONS.map(option => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </label>
    </>
  )
}
