import { isYiNoodle, needsMeatStep, needsNoodlesStep, OrderItem } from "@/types"

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

const priceMap = {
  '无': { '小': 0, '中': 0, '大': 0, '无': 0 },
  '默认': { '小': 10, '中': 12, '大': 15, '无': 0 },
  '河粉': { '小': 10, '中': 12, '大': 15, '无': 0 },
  '米粉': { '小': 10, '中': 12, '大': 15, '无': 0 },
  '伊面': { '小': 11, '中': 13, '大': 16, '无': 0 },
}

const yiNoodlePrice = 3
const plasticContainerPrice = 0.5

export const calcPrice = (item: OrderItem): number => {
  let price = getSizePrice(item)

  if (item.noodleType === '伊面') {
    price += (item.extraNoodleBlocks * yiNoodlePrice)
  }

  if (item.dining.diningMethod === '外带' && item.dining.packaging === '塑料盒') {
    price += plasticContainerPrice
  }

  return price
}

export const getSizePrice = (item: OrderItem): number => {
  if (item.size !== '自定义') {
    if (!item.includeNoodles) {
      return priceMap['默认'][item.size]
    }

    return priceMap[item.noodleType][item.size]
  }

  if (item.customSizePrice == undefined) {
    return 0
  }

  return item.customSizePrice
}

export const getMeatsRequest = (item: OrderItem): string => {
  if (item.meats.available.length == 0) {
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

export const getOtherRequest = (item: OrderItem): string => {
  let req = ''

  if (isYiNoodle(item) && item.extraNoodleBlocks > 0) {
    if (req !== '') {
      req += '，'
    }
    req += `加${item.extraNoodleBlocks}块面饼`
  } else if (item.includeNoodles && item.noodleType != '伊面' && item.noodleAmount != '正常') {
    if (req !== '') {
      req += '，'
    }
    req += `${item.noodleAmount}粉`
  }

  if (item.ingredients.greens != '正常') {
    if (req !== '') {
      req += '，'
    }
    req += `${item.ingredients.greens}青菜`
  }

  if (item.ingredients.pepper != '正常') {
    if (req !== "") {
      req += '，'
    }
    req += `${item.ingredients.pepper}胡椒`
  }

  if (item.ingredients.scallion != '正常') {
    if (req !== "") {
      req += '，'
    }
    req += `${item.ingredients.scallion}葱花`
  }

  if (item.dining.diningMethod == '外带') {
    if (item.dining.packaging == '塑料袋') {
      if (req !== '') {
        req += '，'
      }
      req += '用塑料袋装'
    }

    if (item.dining.packagingMethod == '汤粉分开') {
      if (req !== '') {
        req += '，'
      }
      req += '汤粉分开装'
    }
  }


  return req
}

export const updateCompletion = (item: OrderItem): void => {
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