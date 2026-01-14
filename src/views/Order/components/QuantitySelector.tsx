import React from "react"

interface QuantitySelectorProps {
  num: number
  setNum: (num: number) => void
}

/**
 * 数量选择器组件
 */
export const QuantitySelector: React.FC<QuantitySelectorProps> = ({ num, setNum }) => {
  return (
    <label className="fieldset-label text-xl">
      <span className="mr-2">数量</span>
      <button
        className="btn text-2xl"
        onClick={() => setNum(Math.max(num - 1, 1))}
        aria-label="减少数量"
      >
        -
      </button>
      <span className="mx-2">{num}</span>
      <button
        className="btn text-2xl"
        onClick={() => setNum(num + 1)}
        aria-label="增加数量"
      >
        +
      </button>
    </label>
  )
}
