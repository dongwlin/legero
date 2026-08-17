import { describe, expect, it } from 'vitest'
import type { OrderDTO } from './apiTypes'
import { orderDtoToOrderRecord } from './orderRecordMapper'

const makeDto = (overrides: Partial<OrderDTO> = {}): OrderDTO => ({
  id: 'order-1',
  version: 7,
  displayNo: 'A100',
  stapleTypeCode: 4,
  sizeCode: 2,
  customSizePriceCents: null,
  stapleAmountCode: 1,
  extraStapleUnits: 0,
  friedEggCount: 0,
  tofuSkewerCount: 0,
  selectedMeatCodes: [1, 2],
  greensCode: 1,
  scallionCode: 1,
  pepperCode: 1,
  diningMethodCode: 1,
  packagingCode: null,
  packagingMethodCode: null,
  totalPriceCents: 1500,
  stapleStepStatusCode: 2,
  meatStepStatusCode: 3,
  note: '',
  createdAt: '2025-01-01T00:00:00+08:00',
  updatedAt: '2025-01-01T00:00:05+08:00',
  completedAt: null,
  ...overrides,
})

describe('orderDtoToOrderRecord', () => {
  it('parses the server version from an HTTP snapshot DTO', () => {
    expect(orderDtoToOrderRecord(makeDto()).version).toBe(7)
  })

  it('parses the server version from a realtime upsert DTO', () => {
    expect(orderDtoToOrderRecord(makeDto({ id: 'order-2', version: 13 })).version).toBe(
      13,
    )
  })

  it('keeps the remaining record fields intact', () => {
    const record = orderDtoToOrderRecord(makeDto())

    expect(record.id).toBe('order-1')
    expect(record.displayNo).toBe('A100')
    expect(record.totalPriceCents).toBe(1500)
    expect(record.selectedMeatCodes).toEqual([1, 2])
    expect(record.updatedAt).toBe('2025-01-01T00:00:05+08:00')
    expect(record.completedAt).toBeNull()
  })
})