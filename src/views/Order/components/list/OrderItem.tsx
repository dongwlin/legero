import {
  needsMeatStep,
  needsNoodlesStep,
  NoodleType,
  OrderItem as OI,
  StepStatus,
} from '@/types'
import React, { useEffect, useRef, useState } from 'react'
import { CarbonEdit, CarbonTrashCan } from '@/components/Icon'
import {
  getMeatsRequest,
  getOtherRequest,
  getSizePrice,
} from '@/services/order'
import { useOrderStore } from '@/store/order'
import { useOrderSettingsStore } from '@/store/orderSettings'
import dayjs from 'dayjs'

const getNoodleTypeClass = (noodleType: NoodleType | undefined): string => {
  let noodleColor = ''

  switch (noodleType) {
    case '河粉':
      noodleColor = 'bg-blue-500'
      break
    case '米粉':
      noodleColor = 'bg-green-500'
      break
    case '伊面':
      noodleColor = 'bg-yellow-500'
      break
    default:
      noodleColor = 'bg-gray-500' // TODO
  }

  return `text-2xl mr-4 ${noodleColor}`
}

const getStepBtnClass = (stepStatus: StepStatus): string => {
  let btnState = 'btn-outline'
  switch (stepStatus) {
    case 'not-started':
      break
    case 'in-progress':
      btnState = 'btn-info'
      break
    case 'completed':
      btnState = 'btn-success'
      break
    default:
    // do nothing
  }
  return `btn mr-4 text-xl ${btnState}`
}

const getServeMealBtnClass = (createdAt: string): string => {
  const base = 'btn text-xl'
  if (!createdAt) {
    return base + ' ' + 'btn-outline'
  }
  return base + ' ' + 'btn-success'
}

const OrderItem: React.FC<OI> = (item) => {
  const removeOrder = useOrderStore((state) => state.removeOrder)
  const updateOrder = useOrderStore((state) => state.updateOrder)
  const setUpdateTargetID = useOrderStore((state) => state.setUpdateTargetID)
  const { waitTimeThresholdMinutes } = useOrderSettingsStore()

  const dialogRef = useRef<HTMLDialogElement>(null)
  const [currentTime, setCurrentTime] = useState(() => Date.now())

  // 每秒更新当前时间以实现实时等待时间显示
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  // 计算等待时间（秒）
  const waitTime = item.completedAt ? 0 : Math.floor((currentTime - new Date(item.createdAt).getTime()) / 1000)

  // 判断等待时间是否超时（分钟）
  const isWaitTimeOverThreshold = waitTime > 0 && waitTimeThresholdMinutes > 0 && (waitTime / 60) >= waitTimeThresholdMinutes

  // 格式化等待时间显示
  const formatWaitTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hours > 0) {
      return `${hours} 小时 ${minutes} 分 ${secs} 秒`
    } else if (minutes > 0) {
      return `${minutes} 分 ${secs} 秒`
    } else {
      return `${secs} 秒`
    }
  }

  const id = item.id.length === 12 ? Number(item.id.substring(8, 12)) : item.id
  const noodleTypeClass = getNoodleTypeClass(item.noodleType)
  const sizePrice = getSizePrice(item)
  const meatReq = getMeatsRequest(item)
  const req = getOtherRequest(item)
  const serveMealBtnClass = getServeMealBtnClass(item.completedAt)

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

  const openDeleteDialog = () => {
    if (dialogRef.current) {
      dialogRef.current.showModal()
    }
  }

  return (
    <>
      <div className='text-3xl opacity-80 tabular-nums text-center'>{id}</div>
      <div className='list-col-grow flex flex-row'>
        {item.noodleType !== '无' && (
          <div className={noodleTypeClass}>{item.noodleType}</div>
        )}
        <div className='text-3xl mr-2'>{sizePrice}元</div>
        <div className='text-3xl'>{item.dining.diningMethod}</div>
      </div>
      <div className='list-col-wrap text-2xl'>
        {meatReq !== '' && <div>{meatReq}</div>}
        <div>{req}</div>
        <div className='italic'>{item.note}</div>
        <div className='flex flex-row my-2'>
          {item.progress.noodles != 'unrequired' && (
            <button
              className={getStepBtnClass(item.progress.noodles)}
              onClick={handleUpdateNoodleStep}
            >
              粉
            </button>
          )}
          {item.progress.meat != 'unrequired' && (
            <button
              className={getStepBtnClass(item.progress.meat)}
              onClick={handleUpdateMeatStep}
            >
              肉
            </button>
          )}

          <button
            className={serveMealBtnClass}
            disabled={
              (needsNoodlesStep(item) &&
                item.progress.noodles !== 'completed') ||
              (needsMeatStep(item) && item.progress.meat !== 'completed')
            }
            onClick={handleServeMeal}
          >
            出餐
          </button>
        </div>
        <div className='text-base opacity-60'>
          {dayjs(item.createdAt).format('YYYY-MM-DD HH:mm:ss')}
          {!item.completedAt && (
            <span className={`ml-2 font-semibold ${isWaitTimeOverThreshold ? 'text-error' : 'text-warning'}`}>
              ({formatWaitTime(waitTime)})
            </span>
          )}
        </div>
      </div>
      <button
        className='btn btn-square btn-primary'
        onClick={() => setUpdateTargetID(item.id)}
      >
        <CarbonEdit className='size-6' />
      </button>
      <button
        className='btn btn-square btn-error'
        onClick={() => openDeleteDialog()}
      >
        <CarbonTrashCan className='size-6' />
      </button>
      <dialog ref={dialogRef} className='modal'>
        <div className='modal-box'>
          <div className='text-2xl'>确认删除该订单？</div>
          <div className='modal-action'>
            <button
              className='btn btn-xl btn-error'
              onClick={() => {
                if (dialogRef.current) {
                  dialogRef.current.close()
                }
                removeOrder(item.id)
              }}
            >
              确认
            </button>
            <form method='dialog'>
              <button className='btn btn-xl'>取消</button>
            </form>
          </div>
        </div>
        <form method='dialog' className='modal-backdrop'>
          <button>Cancel</button>
        </form>
      </dialog>
    </>
  )
}

export default React.memo(OrderItem)
