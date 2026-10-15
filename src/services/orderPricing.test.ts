import { describe, expect, it } from 'vitest'
import {
  calculateOrderTotalPriceCents,
  formatPriceCents,
  getBasePriceCents,
} from '@/services/orderPricing'
import {
  DINING_METHOD,
  PACKAGING,
  SIZE,
  STAPLE_TYPE,
} from '@/types'

type PricingInput = Parameters<typeof calculateOrderTotalPriceCents>[0]

const makePricingInput = (overrides: Partial<PricingInput> = {}): PricingInput => ({
  stapleTypeCode: STAPLE_TYPE.riceSheet,
  sizeCode: SIZE.small,
  customSizePriceCents: null,
  extraStapleUnits: 0,
  friedEggCount: 0,
  tofuSkewerCount: 0,
  diningMethodCode: DINING_METHOD.dineIn,
  packagingCode: null,
  ...overrides,
})

describe('order pricing', () => {
  it('uses the correct base price for each staple and standard size', () => {
    expect(
      [SIZE.small, SIZE.medium, SIZE.large].map((sizeCode) =>
        getBasePriceCents(makePricingInput({ sizeCode })),
      ),
    ).toEqual([1000, 1200, 1500])

    expect(
      [SIZE.small, SIZE.medium, SIZE.large].map((sizeCode) =>
        getBasePriceCents(
          makePricingInput({ stapleTypeCode: STAPLE_TYPE.yiNoodle, sizeCode }),
        ),
      ),
    ).toEqual([1100, 1300, 1600])

    expect(
      [SIZE.small, SIZE.medium, SIZE.large].map((sizeCode) =>
        getBasePriceCents(
          makePricingInput({ stapleTypeCode: STAPLE_TYPE.rice, sizeCode }),
        ),
      ),
    ).toEqual([1500, 1500, 2000])
  })

  it('clamps a custom size price and treats a missing price as zero', () => {
    expect(
      getBasePriceCents(
        makePricingInput({
          sizeCode: SIZE.custom,
          customSizePriceCents: 2350,
        }),
      ),
    ).toBe(2350)
    expect(
      getBasePriceCents(
        makePricingInput({
          sizeCode: SIZE.custom,
          customSizePriceCents: -1,
        }),
      ),
    ).toBe(0)
    expect(
      getBasePriceCents(
        makePricingInput({
          sizeCode: SIZE.custom,
          customSizePriceCents: null,
        }),
      ),
    ).toBe(0)
  })

  it('charges Yi noodle extras and truncates fractional quantities', () => {
    expect(
      calculateOrderTotalPriceCents(
        makePricingInput({
          stapleTypeCode: STAPLE_TYPE.yiNoodle,
          sizeCode: SIZE.medium,
          extraStapleUnits: 2.9,
          friedEggCount: 1.9,
          tofuSkewerCount: 0.9,
        }),
      ),
    ).toBe(1300 + 2 * 300 + 1 * 200)

    expect(
      calculateOrderTotalPriceCents(
        makePricingInput({
          stapleTypeCode: STAPLE_TYPE.riceSheet,
          extraStapleUnits: 9,
        }),
      ),
    ).toBe(1000)
  })

  it('ignores negative add-ons and adds the container fee only for takeout', () => {
    expect(
      calculateOrderTotalPriceCents(
        makePricingInput({
          friedEggCount: -2,
          tofuSkewerCount: -1.5,
          diningMethodCode: DINING_METHOD.takeout,
          packagingCode: PACKAGING.container,
        }),
      ),
    ).toBe(1000 + 50)

    expect(
      calculateOrderTotalPriceCents(
        makePricingInput({
          diningMethodCode: DINING_METHOD.takeout,
          packagingCode: PACKAGING.bag,
        }),
      ),
    ).toBe(1000)
    expect(
      calculateOrderTotalPriceCents(
        makePricingInput({
          diningMethodCode: DINING_METHOD.dineIn,
          packagingCode: PACKAGING.container,
        }),
      ),
    ).toBe(1000)
  })

  it('formats whole, fractional, and fixed precision prices consistently', () => {
    expect(formatPriceCents(0)).toBe('¥0')
    expect(formatPriceCents(1000)).toBe('¥10')
    expect(formatPriceCents(1050)).toBe('¥10.5')
    expect(formatPriceCents(999, { includeCurrencySymbol: false })).toBe('9.99')
    expect(
      formatPriceCents(1050, {
        includeCurrencySymbol: false,
        fixedFractionDigits: 2,
      }),
    ).toBe('10.50')
  })
})
