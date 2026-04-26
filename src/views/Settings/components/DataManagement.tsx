import { orderRepository } from '@/services/orderRepository'
import type { ClearWorkspaceMode } from '@/services/apiTypes'
import { useOrderStore } from '@/store/order'
import { AlertDialog, Button, buttonVariants } from '@heroui/react'
import React, { useState } from 'react'
import SettingsSection from './SettingsSection'

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '清空订单失败，请稍后重试。'

const getRefreshErrorMessage = (): string => '数据已清理，但本地刷新失败，请稍后返回订单页确认最新状态。'

type ClearAction = {
  mode: ClearWorkspaceMode
  triggerLabel: string
  dialogTitle: string
  dialogDescription: string
}

const clearActions: ClearAction[] = [
  {
    mode: 'before_today',
    triggerLabel: '清空除今日外的数据',
    dialogTitle: '确认清空历史数据',
    dialogDescription:
      '确定要清空今日之前的订单数据吗？今日订单会保留，此操作不可恢复，请谨慎操作。',
  },
  {
    mode: 'all',
    triggerLabel: '清空所有订单',
    dialogTitle: '确认清空数据',
    dialogDescription:
      '确定要清空所有订单数据吗？此操作不可恢复，请谨慎操作。',
  },
]

const DataManagement: React.FC = () => {
  const clear = useOrderStore((state) => state.clearOrders)
  const setOrders = useOrderStore((state) => state.setOrders)
  const [pendingMode, setPendingMode] = useState<ClearWorkspaceMode | null>(null)
  const [clearError, setClearError] = useState<string | null>(null)

  const handleClear = async (mode: ClearWorkspaceMode) => {
    setPendingMode(mode)
    setClearError(null)

    try {
	  await orderRepository.clearWorkspace(mode)

	  if (mode === 'all') {
	    clear()
	    return
	  }

	  try {
	    const nextOrders = await orderRepository.list('all')
	    setOrders(nextOrders)
	  } catch {
	    setClearError(getRefreshErrorMessage())
	  }
    } catch (error) {
      setClearError(getErrorMessage(error))
    } finally {
	  setPendingMode(null)
    }
  }

  return (
    <SettingsSection
      title='数据管理'
      description='谨慎执行高风险操作，删除的数据无法恢复。'
    >
      <div className='space-y-4'>
        <p className='text-sm leading-6 text-muted'>
          可按需清空历史订单，或移除当前工作区中的全部订单记录。删除的数据无法恢复。
        </p>
        {clearError ? (
          <p className='text-sm text-danger'>{clearError}</p>
        ) : null}

        <div className='flex flex-col gap-3 md:flex-row md:flex-wrap'>
          {clearActions.map((action) => {
            const isPending = pendingMode === action.mode

            return (
              <AlertDialog.Root key={action.mode}>
                <AlertDialog.Trigger
                  className={`${buttonVariants({
                    variant: 'danger',
                  })} w-full md:w-auto`}
                >
                  {action.triggerLabel}
                </AlertDialog.Trigger>

                <AlertDialog.Backdrop variant='blur'>
                  <AlertDialog.Container size='sm' placement='center'>
                    <AlertDialog.Dialog>
                      <AlertDialog.Header>
                        <AlertDialog.Icon status='danger' />
                        <AlertDialog.Heading>{action.dialogTitle}</AlertDialog.Heading>
                      </AlertDialog.Header>
                      <AlertDialog.Body className='pt-4 text-sm leading-6 text-muted'>
                        {action.dialogDescription}
                      </AlertDialog.Body>
                      <AlertDialog.Footer className='mt-6 gap-3 flex-row justify-end'>
                        <Button.Root slot='close' variant='outline'>
                          取消
                        </Button.Root>
                        <Button.Root
                          slot='close'
                          variant='danger'
                          isDisabled={pendingMode !== null}
                          onPress={() => {
                            void handleClear(action.mode)
                          }}
                        >
                          {isPending ? '清空中...' : '确认'}
                        </Button.Root>
                      </AlertDialog.Footer>
                    </AlertDialog.Dialog>
                  </AlertDialog.Container>
                </AlertDialog.Backdrop>
              </AlertDialog.Root>
            )
          })}
        </div>
      </div>
    </SettingsSection>
  )
}

export default DataManagement
