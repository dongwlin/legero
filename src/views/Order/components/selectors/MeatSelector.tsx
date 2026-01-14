import React from "react"
import { MEAT_OPTIONS } from "../constants"
import { MeatType } from "@/types"

interface MeatSelectorProps {
  availableMeats: MeatType[]
  onMeatChange: (meat: MeatType, checked: boolean) => void
  showPorkKidney: boolean
}

/**
 * 肉类选择器组件
 */
export const MeatSelector: React.FC<MeatSelectorProps> = ({
  availableMeats,
  onMeatChange,
  showPorkKidney
}) => {
  return (
    <div className="flex flex-row flex-wrap text-xl gap-6 my-2">
      {MEAT_OPTIONS.map(meat => {
        // 猪腰只在非小份时显示
        if (meat === '猪腰' && !showPorkKidney) {
          return null
        }

        return (
          <label key={meat} className="fieldset-label">
            <input
              type="checkbox"
              name={meat}
              value={meat}
              className="checkbox checkbox-success"
              checked={availableMeats.includes(meat)}
              onChange={(e) => onMeatChange(meat, e.target.checked)}
            />
            <span>{meat}</span>
          </label>
        )
      })}
    </div>
  )
}
