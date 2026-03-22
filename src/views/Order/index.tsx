import React from 'react'
import Header from '@/components/Header'
import OrderControls from './components/list/OrderControls'
import OrderForm from './components/forms/OrderForm'
import OrderList from './components/list/OrderList'

const Order: React.FC = () => {
  return (
    <div className='flex h-screen flex-col bg-background text-foreground'>
      {/* 顶部导航栏 */}
      <Header title='订单' />

      {/* 主内容区 - 使用 flex-1 占据剩余空间 */}
      <div className='mx-auto flex h-full w-full max-w-5xl flex-1 flex-col overflow-hidden px-4 pt-[calc(4.75rem+env(safe-area-inset-top))] md:px-8'>
        {/* 控制面板部分 (统计、筛选、创建) */}
        <div className='flex-none'>
          <OrderControls />
        </div>

        {/* 订单列表部分 - 占据剩余垂直空间 */}
        <div className='flex-1 min-h-0 pb-4'>
          <OrderList />
        </div>
      </div>

      <OrderForm mode='edit' />
    </div>
  )
}

export default Order
