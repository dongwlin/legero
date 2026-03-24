import {
  needsMeatStep,
  needsNoodlesStep,
  NoodleType,
  OrderItem as OI,
  StepStatus,
} from '@/types'
import React, { useState } from 'react'
import { CarbonEdit, CarbonTrashCan } from '@/components/Icon'
import {
  getMeatsRequest,
  getOtherRequest,
  getSizePrice,
} from '@/services/order'
import { useOrderStore } from '@/store/order'
import { useOrderSettingsStore } from '@/store/orderSettings'
import { AlertDialog, Button, Card } from '@heroui/react'
import dayjs from 'dayjs'

type OrderItemProps = {
  order: OI
  now: number
}

const getNoodleTypeClass = (noodleType: NoodleType | undefined): string => {
  switch (noodleType) {
    case '河粉':
      return 'border-sky-500/35 bg-sky-500/12 text-sky-700 dark:text-sky-300'
    case '米粉':
      return 'border-emerald-500/35 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
    case '伊面':
      return 'border-amber-500/35 bg-amber-500/12 text-amber-700 dark:text-amber-300'
    default:
      return 'border-border/70 bg-background text-foreground'
  }
}

const getStepButtonProps = (stepStatus: StepStatus) => {
  switch (stepStatus) {
    case 'not-started':
      return {
        className: 'border-border/60 text-foreground hover:bg-background-secondary',
        variant: 'outline' as const,
      }
    case 'in-progress':
      return {
        className: 'border-accent/40 bg-accent-soft/65 text-accent hover:bg-accent-soft/80',
        variant: 'secondary' as const,
      }
    case 'completed':
      return {
        className: 'border-success/40 bg-success/12 text-success hover:bg-success/18',
        variant: 'secondary' as const,
      }
    default:
      return {
        className: 'border-border/60 text-foreground hover:bg-background-secondary',
        variant: 'outline' as const,
      }
  }
}

const getServeMealButtonProps = ({
  completedAt,
  isDisabled,
  needsMeatCompletion,
  needsNoodleCompletion,
}: {
  completedAt: string
  isDisabled: boolean
  needsMeatCompletion: boolean
  needsNoodleCompletion: boolean
}) => {
  if (isDisabled) {
    return {
      className:
        'rounded-2xl border-dashed border-border/80 bg-background-secondary/80 font-bold text-muted shadow-none',
      label: needsNoodleCompletion && needsMeatCompletion
        ? '待粉肉'
        : needsNoodleCompletion
          ? '待粉'
          : '待肉',
      variant: 'outline' as const,
    }
  }

  if (!completedAt) {
    return {
      className: 'rounded-2xl font-bold',
      label: '出餐',
      variant: 'primary' as const,
    }
  }

  return {
    className:
      'rounded-2xl border-success/40 bg-success/12 font-bold text-success hover:bg-success/18',
    label: '出餐',
    variant: 'secondary' as const,
  }
}

const SEVERE_TIMEOUT_SECONDS = 60 * 60

const formatWaitTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

const renderHighlightedForbiddenText = (text: string): React.ReactNode => {
  if (!text.includes('不要')) {
    return text
  }

  return text.split('不要').map((part, index) => (
    <React.Fragment key={`${part}-${index}`}>
      {index > 0 && (
        <span className='mx-0.5 inline-block rounded bg-red-100 px-1 text-red-700'>
          不要
        </span>
      )}
      {part}
    </React.Fragment>
  ))
}

const OrderItem: React.FC<OrderItemProps> = ({ order, now }) => {
  const item = order
  const removeOrder = useOrderStore((state) => state.removeOrder)
  const updateOrder = useOrderStore((state) => state.updateOrder)
  const setUpdateTargetID = useOrderStore((state) => state.setUpdateTargetID)
  const { waitTimeThresholdMinutes } = useOrderSettingsStore()
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)


  // 计算等待时间（秒）
  const waitTime = item.completedAt
    ? 0
    : Math.floor((now - new Date(item.createdAt).getTime()) / 1000)

  // 判断等待时间是否超时（分钟）
  const isWaitTimeOverThreshold =
    waitTime > 0 &&
    waitTimeThresholdMinutes > 0 &&
    waitTime / 60 >= waitTimeThresholdMinutes
  const isSevereTimeout = !item.completedAt && waitTime >= SEVERE_TIMEOUT_SECONDS

  const id = item.id.length === 12 ? Number(item.id.substring(8, 12)) : item.id
  const noodleTypeClass = getNoodleTypeClass(item.noodleType)
  const sizePrice = getSizePrice(item)
  const meatReq = getMeatsRequest(item)
  const req = getOtherRequest(item)
  const noodleStepButton = getStepButtonProps(item.progress.noodles)
  const meatStepButton = getStepButtonProps(item.progress.meat)
  const waitTimeToneClass =
    isSevereTimeout || isWaitTimeOverThreshold ? 'text-danger' : 'text-warning'
  const orderCardToneClass = item.completedAt
    ? 'border-success/25'
    : isSevereTimeout || isWaitTimeOverThreshold
      ? 'border-warning/35'
      : 'border-border/70'
  const needsNoodleCompletion =
    needsNoodlesStep(item) && item.progress.noodles !== 'completed'
  const needsMeatCompletion =
    needsMeatStep(item) && item.progress.meat !== 'completed'
  const isServeMealDisabled = needsNoodleCompletion || needsMeatCompletion
  const serveMealButton = getServeMealButtonProps({
    completedAt: item.completedAt,
    isDisabled: isServeMealDisabled,
    needsNoodleCompletion,
    needsMeatCompletion,
  })

  const handleUpdateNoodleStep = () => {
    let newStatus: StepStatus = 'not-started'
    switch (item.progress.noodles) {
      case 'not-started':
        newStatus = 'completed'
        break
      // case 'in-progress':
      //   newStatus = 'completed'
      //   break
      case 'completed':
        newStatus = 'not-started'
        break
    }
    updateOrder(item.id, {
      ...item,
      progress: {
        ...item.progress,
        noodles: newStatus,
      },
      completedAt: newStatus !== 'completed' ? '' : item.completedAt,
    })
  }

  const handleUpdateMeatStep = () => {
    let newStatus: StepStatus = 'not-started'
    switch (item.progress.meat) {
      case 'not-started':
        newStatus = 'completed'
        break
      // case 'in-progress':
      //   newStatus = 'completed'
      //   break
      case 'completed':
        newStatus = 'not-started'
        break
    }
    updateOrder(item.id, {
      ...item,
      progress: {
        ...item.progress,
        meat: newStatus,
      },
      completedAt: newStatus !== 'completed' ? '' : item.completedAt,
    })
  }

  const handleServeMeal = () => {
    if (!item.completedAt) {
      const now = dayjs()
      updateOrder(item.id, {
        ...item,
        completedAt: now.toISOString(),
      })
      return
    }

    updateOrder(item.id, {
      ...item,
      completedAt: '',
    })
  }

  return (
    <>
      <Card.Root
        variant='secondary'
        className={`border p-0 transition-shadow duration-200 hover:shadow-lg ${orderCardToneClass}`}
      >
        <Card.Content className='space-y-4 p-4 md:p-5'>
          <div className='flex flex-wrap items-start justify-between gap-4'>
            <div className='flex-1 space-y-3'>
              <div className='flex flex-wrap items-center gap-3'>
                <span className='inline-flex shrink-0 items-center font-mono text-base font-medium leading-none tabular-nums text-muted md:text-xl'>
                  #{id}
                </span>
                {item.noodleType !== '无' ? (
                  <span
                    className={`inline-flex min-h-12 items-center rounded-2xl border px-4 py-2 text-lg font-semibold shadow-sm md:min-h-14 md:text-xl ${noodleTypeClass}`}
                  >
                    {item.noodleType}
                  </span>
                ) : null}
                <span className='inline-flex min-h-12 items-center rounded-2xl border border-border/70 bg-background px-4 py-2 text-xl font-bold text-foreground shadow-sm tabular-nums md:min-h-14 md:text-2xl'>
                  ¥{sizePrice}
                </span>
                <span className='inline-flex min-h-12 items-center rounded-2xl border border-border/60 bg-background-secondary/70 px-4 py-2 text-lg font-semibold text-foreground shadow-sm md:min-h-14 md:text-xl'>
                  {item.dining.diningMethod}
                </span>
                {item.completedAt ? (
                  <span className='inline-flex min-h-12 items-center rounded-2xl border border-success/30 bg-success/12 px-4 py-2 text-base font-semibold text-success shadow-sm md:min-h-14 md:text-lg'>
                    已出餐
                  </span>
                ) : null}
              </div>

              <div className='space-y-2 text-base leading-7 text-foreground md:text-lg'>
                {meatReq !== '' ? (
                  <div>{renderHighlightedForbiddenText(meatReq)}</div>
                ) : null}
                {req ? <div>{renderHighlightedForbiddenText(req)}</div> : null}
                {item.note ? (
                  <div className='italic text-muted'>{item.note}</div>
                ) : null}
              </div>
            </div>

            <div className='flex shrink-0 gap-3 self-start'>
              <Button.Root
                isIconOnly
                className='size-12 rounded-2xl border border-border/70 bg-background/95 shadow-sm touch-manipulation transition-[background-color,border-color,box-shadow] duration-200 data-[hovered=true]:border-border-secondary data-[hovered=true]:bg-background data-[hovered=true]:shadow-md md:size-14'
                variant='secondary'
                aria-label='编辑订单'
                onPress={() => setUpdateTargetID(item.id)}
              >
                <CarbonEdit className='size-5 md:size-6' />
              </Button.Root>
              <AlertDialog.Root isOpen={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
                <Button.Root
                  isIconOnly
                  className='size-12 rounded-2xl touch-manipulation md:size-14'
                  variant='danger'
                  aria-label='删除订单'
                >
                  <CarbonTrashCan className='size-5 md:size-6' />
                </Button.Root>
                <AlertDialog.Backdrop variant='blur'>
                  <AlertDialog.Container size='sm'>
                    <AlertDialog.Dialog className='border border-border/70 bg-background shadow-xl'>
                      <AlertDialog.Header>
                        <AlertDialog.Icon status='danger' />
                        <AlertDialog.Heading>确认删除订单</AlertDialog.Heading>
                      </AlertDialog.Header>
                      <AlertDialog.Body className='pt-4 text-sm leading-6 text-muted'>
                        确定要删除订单 #{id} 吗？此操作不可恢复。
                      </AlertDialog.Body>
                      <AlertDialog.Footer className='mt-6 flex-col-reverse gap-3 sm:flex-row sm:justify-end'>
                        <Button.Root slot='close' variant='outline'>
                          取消
                        </Button.Root>
                        <Button.Root
                          slot='close'
                          variant='danger'
                          onPress={() => removeOrder(item.id)}
                        >
                          确认
                        </Button.Root>
                      </AlertDialog.Footer>
                    </AlertDialog.Dialog>
                  </AlertDialog.Container>
                </AlertDialog.Backdrop>
              </AlertDialog.Root>
            </div>
          </div>

          <div className='flex flex-wrap gap-3'>
            {item.progress.noodles !== 'unrequired' ? (
              <Button.Root
                className={`h-14 min-w-24 rounded-2xl px-6 text-lg font-semibold shadow-sm touch-manipulation md:h-16 md:min-w-28 md:text-xl ${noodleStepButton.className}`}
                variant={noodleStepButton.variant}
                onPress={handleUpdateNoodleStep}
              >
                粉
              </Button.Root>
            ) : null}
            {item.progress.meat !== 'unrequired' ? (
              <Button.Root
                className={`h-14 min-w-24 rounded-2xl px-6 text-lg font-semibold shadow-sm touch-manipulation md:h-16 md:min-w-28 md:text-xl ${meatStepButton.className}`}
                variant={meatStepButton.variant}
                onPress={handleUpdateMeatStep}
              >
                肉
              </Button.Root>
            ) : null}
            <Button.Root
              className={`h-14 min-w-28 px-6 text-lg shadow-sm touch-manipulation md:h-16 md:min-w-32 md:text-xl ${serveMealButton.className}`}
              isDisabled={isServeMealDisabled}
              variant={serveMealButton.variant}
              onPress={handleServeMeal}
            >
              {serveMealButton.label}
            </Button.Root>
          </div>

          <div className='flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted md:text-base'>
            <span className='font-mono tabular-nums'>
              {dayjs(item.createdAt).format('YYYY-MM-DD HH:mm:ss')}
            </span>
            {!item.completedAt ? (
              <span className='inline-flex items-center gap-2 whitespace-nowrap'>
                <span
                  aria-hidden='true'
                  className='inline-block h-[1em] w-px shrink-0 rounded-full bg-current opacity-60'
                />
                {isSevereTimeout ? (
                  <span
                    className={`font-mono tabular-nums ${waitTimeToneClass}`}
                  >
                    --:--
                  </span>
                ) : (
                  <span className={`font-mono tabular-nums ${waitTimeToneClass}`}>
                    {formatWaitTime(waitTime)}
                  </span>
                )}
              </span>
            ) : null}
          </div>
        </Card.Content>
      </Card.Root>

    </>
  )
}

const areOrderItemPropsEqual = (
  prevProps: OrderItemProps,
  nextProps: OrderItemProps,
) => {
  if (prevProps.order !== nextProps.order) {
    return false
  }

  if (!prevProps.order.completedAt && prevProps.now !== nextProps.now) {
    return false
  }

  return true
}

export default React.memo(OrderItem, areOrderItemPropsEqual)
