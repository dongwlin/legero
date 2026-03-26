import { SIZE, STAPLE_TYPE, type SizeCode, type StapleTypeCode } from '@/types'

/**
 * 获取规格按钮显示的值
 * 根据主食类型显示不同的价格
 */
export const getSizeDisplayValue = (
  sizeCode: SizeCode,
  stapleTypeCode: StapleTypeCode | null,
): string => {
  if (stapleTypeCode === STAPLE_TYPE.rice) {
    const riceSizeMap: Record<SizeCode, string> = {
      [SIZE.small]: '15',
      [SIZE.medium]: '15',
      [SIZE.large]: '20',
      [SIZE.custom]: '自定义',
    }

    return riceSizeMap[sizeCode]
  }

  const sizeMap: Record<SizeCode, string> = {
    [SIZE.small]: stapleTypeCode === STAPLE_TYPE.yiNoodle ? '11' : '10',
    [SIZE.medium]: stapleTypeCode === STAPLE_TYPE.yiNoodle ? '13' : '12',
    [SIZE.large]: stapleTypeCode === STAPLE_TYPE.yiNoodle ? '16' : '15',
    [SIZE.custom]: '自定义',
  }

  return sizeMap[sizeCode]
}
