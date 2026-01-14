import { MeatType } from "@/types"

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
