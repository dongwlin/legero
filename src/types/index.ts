export type NoodleType = '河粉' | '米粉' | '伊面' | '无'
export type Size = '小' | '中' | '大' | '自定义' | '无'
export type Adjustment = '正常' | '少' | '多' | '不要'
export type DiningMethod = '堂食' | '外带'
export type Packaging = '塑料盒' | '塑料袋' | '无'
export type PackagingMethod = '装在一起' | '汤粉分开' | '无'
export type Filter = 'all' | 'uncompleted' | 'completed'

export const meats = [
  '瘦肉',
  '猪肝',
  '猪血',
  '大肠',
  '小肠',
  '猪腰',
] as const
export type MeatType = typeof meats[number]

// 配料调整
type IngredientAdjustment = {
  greens: Adjustment
  scallion: Adjustment
  pepper: Adjustment
}

export type StepStatus = 'unrequired' | 'not-started' | 'in-progress' | 'completed'

export type OrderItem = {
  id: string
  includeNoodles: boolean
  noodleType: NoodleType
  size: Size
  customSizePrice: number
  noodleAmount: Adjustment
  extraNoodleBlocks: number
  meats: {
    available: MeatType[]
    excluded: MeatType[]
  }
  ingredients: IngredientAdjustment
  dining: {
    diningMethod: DiningMethod
    packaging: Packaging
    packagingMethod: PackagingMethod
  },
  note: string
  price: number
  createdAt: string
  progress: {
    noodles: StepStatus
    meat: StepStatus
  }
  completedAt: string
}

export function isYiNoodle(order: OrderItem): order is OrderItem & { noodleType: '伊面' } {
  return order.includeNoodles && order.noodleType === '伊面'
}

export function isCustomSize(order: OrderItem): order is OrderItem & { size: '自定义'} {
  return order.customSizePrice !== undefined && order.size === '自定义'
}

export function needsNoodlesStep(order: OrderItem): order is OrderItem & {
  progress: {noodles: StepStatus}
} {
  return order.includeNoodles
}

export function needsMeatStep(order: OrderItem): order is OrderItem & {
  progress: {meat: StepStatus}
} {
  return order.meats.available.length > 0
}
