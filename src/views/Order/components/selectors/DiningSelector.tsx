import React from 'react'
import {
  DINING_METHODS,
  PACKAGING_OPTIONS,
  PACKAGING_METHODS,
} from '../constants'
import { DiningMethod, Packaging, PackagingMethod } from '@/types'
import OrderField from '../OrderField'
import { OrderCompactSelect } from '../OrderCompactSelect'

interface DiningSelectorProps {
  diningMethod: DiningMethod
  packaging: Packaging
  packagingMethod: PackagingMethod
  onDiningMethodChange: (method: DiningMethod) => void
  onPackagingChange: (packaging: Packaging) => void
  onPackagingMethodChange: (method: PackagingMethod) => void
  showTakeoutOptions: boolean
}

/**
 * 就餐方式选择器组件
 */
export const DiningSelector: React.FC<DiningSelectorProps> = ({
  diningMethod,
  packaging,
  packagingMethod,
  onDiningMethodChange,
  onPackagingChange,
  onPackagingMethodChange,
  showTakeoutOptions,
}) => {
  return (
    <OrderField>
      <div
        className={showTakeoutOptions ? 'grid gap-3 sm:grid-cols-3' : 'sm:max-w-56'}
      >
        <OrderCompactSelect
          label='方式'
          value={diningMethod}
          options={DINING_METHODS}
          onChange={onDiningMethodChange}
        />

        {showTakeoutOptions ? (
          <>
            <OrderCompactSelect
              label='包装'
              value={packaging}
              options={PACKAGING_OPTIONS}
              onChange={onPackagingChange}
            />

            <OrderCompactSelect
              label='打包'
              value={packagingMethod}
              options={PACKAGING_METHODS}
              onChange={onPackagingMethodChange}
            />
          </>
        ) : null}
      </div>
    </OrderField>
  )
}
