import type { OrderDTO } from './apiTypes'
import type { OrderRecord } from '@/types'

export const orderDtoToOrderRecord = (row: OrderDTO): OrderRecord => ({
  id: row.id,
  displayNo: row.displayNo,
  stapleTypeCode: row.stapleTypeCode as OrderRecord['stapleTypeCode'],
  sizeCode: row.sizeCode as OrderRecord['sizeCode'],
  customSizePriceCents:
    row.customSizePriceCents as OrderRecord['customSizePriceCents'],
  stapleAmountCode: row.stapleAmountCode as OrderRecord['stapleAmountCode'],
  extraStapleUnits: row.extraStapleUnits,
  selectedMeatCodes: row.selectedMeatCodes as OrderRecord['selectedMeatCodes'],
  greensCode: row.greensCode as OrderRecord['greensCode'],
  scallionCode: row.scallionCode as OrderRecord['scallionCode'],
  pepperCode: row.pepperCode as OrderRecord['pepperCode'],
  diningMethodCode: row.diningMethodCode as OrderRecord['diningMethodCode'],
  packagingCode: row.packagingCode as OrderRecord['packagingCode'],
  packagingMethodCode:
    row.packagingMethodCode as OrderRecord['packagingMethodCode'],
  totalPriceCents: row.totalPriceCents,
  stapleStepStatusCode:
    row.stapleStepStatusCode as OrderRecord['stapleStepStatusCode'],
  meatStepStatusCode:
    row.meatStepStatusCode as OrderRecord['meatStepStatusCode'],
  note: row.note,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  completedAt: row.completedAt,
})
