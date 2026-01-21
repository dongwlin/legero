import React from 'react'
import {
  DINING_METHODS,
  PACKAGING_OPTIONS,
  PACKAGING_METHODS,
} from '../constants'
import { DiningMethod, Packaging, PackagingMethod } from '@/types'

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
    <>
      <label className='fieldset-label text-xl'>
        <span className='mr-2'>就餐方式</span>
        <select
          name='就餐方式'
          className='select text-xl'
          value={diningMethod}
          onChange={(e) => onDiningMethodChange(e.target.value as DiningMethod)}
        >
          {DINING_METHODS.map((method) => (
            <option key={method}>{method}</option>
          ))}
        </select>
      </label>

      {showTakeoutOptions && (
        <>
          <label className='fieldset-label text-xl'>
            <span className='mr-2'>打包包装</span>
            <select
              name='打包包装'
              className='select text-xl'
              value={packaging}
              onChange={(e) => onPackagingChange(e.target.value as Packaging)}
            >
              {PACKAGING_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className='fieldset-label text-xl'>
            <span className='mr-2'>打包方式</span>
            <select
              name='打包方式'
              className='select text-xl'
              value={packagingMethod}
              onChange={(e) =>
                onPackagingMethodChange(e.target.value as PackagingMethod)
              }
            >
              {PACKAGING_METHODS.map((method) => (
                <option key={method}>{method}</option>
              ))}
            </select>
          </label>
        </>
      )}
    </>
  )
}
