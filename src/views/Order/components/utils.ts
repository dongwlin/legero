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
  const isYiNoodle = includeNoodles && noodleType === '伊面'
  const sizeMap: Record<Size, string> = {
    '小': isYiNoodle ? '11' : '10',
    '中': isYiNoodle ? '13' : '12',
    '大': isYiNoodle ? '16' : '15',
    '自定义': '自定义',
    '无': '无'
  }
  
  return sizeMap[size]
}
