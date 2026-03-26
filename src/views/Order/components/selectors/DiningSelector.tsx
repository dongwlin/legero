import React from 'react'
import {
  DINING_METHOD_SELECT_OPTIONS,
  PACKAGING_METHOD_SELECT_OPTIONS,
  PACKAGING_SELECT_OPTIONS,
} from '../constants'
import {
  type DiningMethodCode,
  type PackagingCode,
  type PackagingMethodCode,
} from '@/types'
import OrderField from '../OrderField'
import { OrderCompactSelect } from '../OrderCompactSelect'

interface DiningSelectorProps {
  diningMethodCode: DiningMethodCode
  packagingCode: PackagingCode | null
  packagingMethodCode: PackagingMethodCode | null
  onDiningMethodCodeChange: (method: DiningMethodCode) => void
  onPackagingCodeChange: (packaging: PackagingCode) => void
  onPackagingMethodCodeChange: (method: PackagingMethodCode) => void
  showTakeoutOptions: boolean
}

/**
 * 就餐方式选择器组件
 */
export const DiningSelector: React.FC<DiningSelectorProps> = ({
  diningMethodCode,
  packagingCode,
  packagingMethodCode,
  onDiningMethodCodeChange,
  onPackagingCodeChange,
  onPackagingMethodCodeChange,
  showTakeoutOptions,
}) => {
  return (
    <OrderField label=''>
      <div
        className={showTakeoutOptions ? 'grid gap-2.5 sm:grid-cols-3' : 'sm:max-w-56'}
      >
        <OrderCompactSelect
          label='方式'
          value={diningMethodCode}
          options={DINING_METHOD_SELECT_OPTIONS}
          onChange={onDiningMethodCodeChange}
        />

        {showTakeoutOptions ? (
          <>
            <OrderCompactSelect
              label='包装'
              value={packagingCode}
              options={PACKAGING_SELECT_OPTIONS}
              onChange={onPackagingCodeChange}
            />

            <OrderCompactSelect
              label='打包'
              value={packagingMethodCode}
              options={PACKAGING_METHOD_SELECT_OPTIONS}
              onChange={onPackagingMethodCodeChange}
            />
          </>
        ) : null}
      </div>
    </OrderField>
  )
}
