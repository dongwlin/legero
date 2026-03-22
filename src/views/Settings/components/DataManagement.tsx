import { useOrderStore } from '@/store/order'
import { AlertDialog, Button, buttonVariants } from '@heroui/react'
import React from 'react'
import SettingsSection from './SettingsSection'

const DataManagement: React.FC = () => {
  const clear = useOrderStore((state) => state.clearOrders)

  const handleClear = () => {
    clear()
  }

  return (
    <SettingsSection
      title='数据管理'
      description='谨慎执行高风险操作，删除的数据无法恢复。'
    >
      <div className='space-y-4'>
        <p className='text-sm leading-6 text-muted'>
          清空后会移除当前设备上的所有订单记录与本地缓存。
        </p>

        <AlertDialog.Root>
          <AlertDialog.Trigger
            className={`${buttonVariants({
              variant: 'danger',
            })} w-full md:w-auto`}
          >
            清空所有订单
          </AlertDialog.Trigger>

          <AlertDialog.Backdrop variant='blur'>
            <AlertDialog.Container size='sm'>
              <AlertDialog.Dialog>
                <AlertDialog.Header>
                  <AlertDialog.Icon status='danger' />
                  <AlertDialog.Heading>确认清空数据</AlertDialog.Heading>
                </AlertDialog.Header>
                <AlertDialog.Body className='pt-4 text-sm leading-6 text-muted'>
                  确定要清空所有订单数据吗？此操作不可恢复，请谨慎操作。
                </AlertDialog.Body>
                <AlertDialog.Footer className='mt-6 flex-col-reverse gap-3 sm:flex-row sm:justify-end'>
                  <Button.Root slot='close' variant='outline'>
                    取消
                  </Button.Root>
                  <Button.Root
                    slot='close'
                    variant='danger'
                    onPress={handleClear}
                  >
                    确认清空
                  </Button.Root>
                </AlertDialog.Footer>
              </AlertDialog.Dialog>
            </AlertDialog.Container>
          </AlertDialog.Backdrop>
        </AlertDialog.Root>
      </div>
    </SettingsSection>
  )
}

export default DataManagement
