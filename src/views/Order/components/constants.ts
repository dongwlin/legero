import { Adjustment, NoodleType, Size, MeatType } from "@/types"

export const ADJUSTMENT_OPTIONS = ['多', '正常', '少', '不要'] as const
export const NOODLE_TYPES = ['河粉', '米粉', '伊面'] as const
export const SIZES = ['小', '中', '大', '自定义'] as const
export const DINING_METHODS = ['堂食', '外带'] as const
export const PACKAGING_OPTIONS = ['塑料盒', '塑料袋'] as const
export const PACKAGING_METHODS = ['装在一起', '汤粉分开'] as const

export const MEAT_OPTIONS: readonly MeatType[] = [
  '瘦肉',
  '猪肝',
  '猪血',
  '大肠',
  '小肠',
  '猪腰',
] as const

/**
 * 获取规格按钮显示的值
 * 根据面条类型和是否包含面条显示不同的价格
 */
export const getSizeDisplayValue = (
  size: Size,
  includeNoodles: boolean,
  noodleType: NoodleType
): string => {
  if (!includeNoodles || noodleType === '无') {
    return size
  }
  
  const isRiceNoodle = noodleType === '河粉' || noodleType === '米粉'
  const sizeMap: Record<Size, string> = {
    '小': isRiceNoodle ? '10' : '11',
    '中': isRiceNoodle ? '12' : '13',
    '大': isRiceNoodle ? '15' : '16',
    '自定义': '自定义',
    '无': '无'
  }
  
  return sizeMap[size]
}
