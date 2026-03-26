import {
  STEP_STATUS,
  type OrderFormValue,
  type OrderRecord,
  type OrderStepKey,
  type StepStatusCode,
} from '@/types'

type OrderRequirementInput = Pick<OrderFormValue, 'stapleTypeCode' | 'selectedMeatCodes'>

const getStepFieldName = (
  stepKey: OrderStepKey,
): 'stapleStepStatusCode' | 'meatStepStatusCode' =>
  stepKey === 'staple' ? 'stapleStepStatusCode' : 'meatStepStatusCode'

export const needsStapleStep = (input: OrderRequirementInput): boolean =>
  input.stapleTypeCode !== null

export const needsMeatStep = (input: OrderRequirementInput): boolean =>
  input.selectedMeatCodes.length > 0

export const createInitialOrderStepStatus = (
  input: OrderRequirementInput,
): Pick<OrderRecord, 'stapleStepStatusCode' | 'meatStepStatusCode' | 'completedAt'> => ({
  stapleStepStatusCode: needsStapleStep(input)
    ? STEP_STATUS.notStarted
    : STEP_STATUS.unrequired,
  meatStepStatusCode: needsMeatStep(input)
    ? STEP_STATUS.notStarted
    : STEP_STATUS.unrequired,
  completedAt: null,
})

export const isStepCompleted = (statusCode: StepStatusCode): boolean =>
  statusCode === STEP_STATUS.completed

export const canServeOrder = (record: OrderRecord): boolean => {
  if (needsStapleStep(record) && !isStepCompleted(record.stapleStepStatusCode)) {
    return false
  }

  if (needsMeatStep(record) && !isStepCompleted(record.meatStepStatusCode)) {
    return false
  }

  return true
}

export const synchronizeOrderCompletion = (
  record: OrderRecord,
): OrderRecord => {
  if (record.completedAt !== null && !canServeOrder(record)) {
    return {
      ...record,
      completedAt: null,
    }
  }

  return record
}

export const toggleOrderStepStatus = (
  record: OrderRecord,
  stepKey: OrderStepKey,
): OrderRecord => {
  const stepFieldName = getStepFieldName(stepKey)
  const currentStatus = record[stepFieldName]

  if (currentStatus === STEP_STATUS.unrequired) {
    return record
  }

  const nextStatus =
    currentStatus === STEP_STATUS.completed
      ? STEP_STATUS.notStarted
      : STEP_STATUS.completed

  return synchronizeOrderCompletion({
    ...record,
    [stepFieldName]: nextStatus,
  })
}

export const toggleOrderServed = (
  record: OrderRecord,
  nowIsoString: string,
): OrderRecord => {
  if (!canServeOrder(record)) {
    return synchronizeOrderCompletion(record)
  }

  return {
    ...record,
    completedAt: record.completedAt === null ? nowIsoString : null,
  }
}
