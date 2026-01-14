import React from 'react'
import Header from '@/components/Header'
import OrderControls from './components/OrderControls'
import OrderEditForm from './components/OrderEditForm'
import OrderList from './components/OrderList'

const Order: React.FC = () => {
  return (
    <div className='h-screen bg-base-100 flex flex-col'>
      {/* 顶部导航栏 */}
      <Header title='订单' />

      {/* 主内容区 - 使用 flex-1 占据剩余空间 */}
      <div className='flex-1 flex flex-col pt-[calc(5rem+env(safe-area-inset-top))] px-4 md:px-8 max-w-4xl mx-auto w-full h-full overflow-hidden'>
        {/* 控制面板部分 (统计、筛选、创建) */}
        <div className='flex-none'>
          <OrderControls />
        </div>

        {/* 订单列表部分 - 占据剩余垂直空间 */}
        <div className='flex-1 min-h-0 pb-4'>
          <OrderList />
        </div>
      </div>

      <OrderEditForm />
    </div>
  )
}

export default Order
