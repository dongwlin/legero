import React from "react"
import { ToggleButtonGroup } from "@/components/ToggleButtonGroup"
import { NOODLE_TYPES } from "../constants"
import { NoodleType } from "@/types"

interface NoodleSelectorProps {
  includeNoodles: boolean
  noodleType: NoodleType
  onIncludeNoodlesChange: (checked: boolean) => void
  onNoodleTypeChange: (type: NoodleType) => void
}

/**
 * 粉类选择器组件
 */
export const NoodleSelector: React.FC<NoodleSelectorProps> = ({
  includeNoodles,
  noodleType,
  onIncludeNoodlesChange,
  onNoodleTypeChange
}) => {
  return (
    <div className="flex flex-row">
      <label className="fieldset-label text-xl mr-4">
        <span className="mr-2">粉</span>
        <input
          type="checkbox"
          checked={includeNoodles}
          className="toggle toggle-success"
          onChange={(e) => onIncludeNoodlesChange(e.target.checked)}
        />
      </label>
      <ToggleButtonGroup
        options={NOODLE_TYPES}
        value={noodleType}
        onChange={onNoodleTypeChange}
      />
    </div>
  )
}
