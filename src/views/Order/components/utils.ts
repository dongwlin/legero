import { NoodleType, Size } from "@/types"

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
