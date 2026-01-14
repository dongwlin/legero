import { isYiNoodle, needsMeatStep, needsNoodlesStep, OrderItem, NoodleType, Size } from "@/types"

/**
 * 创建新的默认订单项
 * @returns 默认订单项对象，注意 id 为空字符串，调用方需要设置唯一 ID
 */
export const newDefaultOrderItem = (): OrderItem => {
  return {
    id: "",
    includeNoodles: true,
    noodleType: '河粉',
    size: '小',
    customSizePrice: 0,
    noodleAmount: '正常',
    extraNoodleBlocks: 0,
    meats: {
      available: ['瘦肉', '猪肝', '猪血', '大肠', '小肠', '猪腰'],
      excluded: [],
    },
    ingredients: {
      greens: '正常',
      scallion: '正常',
      pepper: '正常'
    },
    dining: {
      diningMethod: '堂食',
      packaging: '无',
      packagingMethod: '无'
    },
    note: "",
    price: 0,
    createdAt: "",
    progress: {
      noodles: 'unrequired',
      meat: 'unrequired',
    },
    completedAt: ""
  }
}

/**
 * 价格映射表：面条类型 × 尺寸 → 价格
 * 注意：'自定义' 尺寸使用 customSizePrice，不在此表中
 */
const priceMap: Record<NoodleType | '默认', Partial<Record<Size, number>>> = {
  '无': { '小': 0, '中': 0, '大': 0, '无': 0 },
  '默认': { '小': 10, '中': 12, '大': 15, '无': 0 },
  '河粉': { '小': 10, '中': 12, '大': 15, '无': 0 },
  '米粉': { '小': 10, '中': 12, '大': 15, '无': 0 },
  '伊面': { '小': 11, '中': 13, '大': 16, '无': 0 },
}

/** 每块伊面面饼价格 */
const YI_NOODLE_BLOCK_PRICE = 3

/** 每个塑料盒价格 */
const PLASTIC_CONTAINER_PRICE = 0.5

/**
 * 计算订单项目的总价格
 * @param item 订单项目
 * @returns 总价格
 */
export const calcPrice = (item: OrderItem): number => {
  if (!item) {
    throw new Error('OrderItem is required')
  }

  let price = getSizePrice(item)

  if (item.noodleType === '伊面') {
    price += (item.extraNoodleBlocks * YI_NOODLE_BLOCK_PRICE)
  }

  if (item.dining.diningMethod === '外带' && item.dining.packaging === '塑料盒') {
    price += PLASTIC_CONTAINER_PRICE
  }

  return price
}

/**
 * 获取订单项目的基础价格（不含额外费用）
 * @param item 订单项目
 * @returns 基础价格
 */
export const getSizePrice = (item: OrderItem): number => {
  if (!item) {
    throw new Error('OrderItem is required')
  }

  if (item.size !== '自定义') {
    if (!item.includeNoodles) {
      return priceMap['默认'][item.size] ?? 0
    }

    if (!(item.noodleType in priceMap)) {
      console.warn(`Unknown noodle type: ${item.noodleType}, using default price`)
      return priceMap['默认'][item.size] ?? 0
    }

    return priceMap[item.noodleType][item.size] ?? 0
  }

  if (item.customSizePrice === undefined) {
    return 0
  }

  return item.customSizePrice
}

/**
 * 获取肉类需求描述
 * @param item 订单项目
 * @returns 肉类需求字符串，空字符串表示"全部肉类都要"
 */
export const getMeatsRequest = (item: OrderItem): string => {
  if (!item) {
    throw new Error('OrderItem is required')
  }

  if (item.meats.available.length === 0) {
    return '不要肉'
  }

  let req = ""

  if (item.meats.available.length <= item.meats.excluded.length) {
    req = `只要${item.meats.available[0]}`

    for (let i = 1; i < item.meats.available.length; i++) {
      req += `、${item.meats.available[i]}`
    }
  } else if (item.meats.available.length > item.meats.excluded.length && item.meats.excluded.length > 0) {
    req = `不要${item.meats.excluded[0]}`

    for (let i = 1; i < item.meats.excluded.length; i++) {
      req += `、${item.meats.excluded[i]}`
    }
  }

  return req
}

/**
 * 获取其他需求描述（面条、配料、包装等）
 * @param item 订单项目
 * @returns 其他需求字符串
 */
export const getOtherRequest = (item: OrderItem): string => {
  if (!item) {
    throw new Error('OrderItem is required')
  }

  const parts: string[] = []

  if (isYiNoodle(item) && item.extraNoodleBlocks > 0) {
    parts.push(`加${item.extraNoodleBlocks}块面饼`)
  } else if (item.includeNoodles && item.noodleType !== '伊面' && item.noodleAmount !== '正常') {
    parts.push(`${item.noodleAmount}粉`)
  }

  if (item.ingredients.greens !== '正常') {
    parts.push(`${item.ingredients.greens}青菜`)
  }

  if (item.ingredients.pepper !== '正常') {
    parts.push(`${item.ingredients.pepper}胡椒`)
  }

  if (item.ingredients.scallion !== '正常') {
    parts.push(`${item.ingredients.scallion}葱花`)
  }

  if (item.dining.diningMethod === '外带') {
    if (item.dining.packaging === '塑料袋') {
      parts.push('用塑料袋装')
    }

    if (item.dining.packagingMethod === '汤粉分开') {
      parts.push('汤粉分开装')
    }
  }

  return parts.join('，')
}

/**
 * 更新订单完成状态
 * @param item 订单项目，会直接修改该对象的 completedAt 字段
 */
export const updateCompletion = (item: OrderItem): void => {
  if (!item) {
    throw new Error('OrderItem is required')
  }

  const requiredSteps = []
  if (needsNoodlesStep(item)) {
    requiredSteps.push(item.progress.noodles === 'completed')
  }
  if (needsMeatStep(item)) {
    requiredSteps.push(item.progress.meat === 'completed')
  }

  if (requiredSteps.length > 0 && requiredSteps.every(Boolean)) {
    item.completedAt = new Date().toISOString()
  }
}
