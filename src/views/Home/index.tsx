import React from 'react'
import { useNavigate } from 'react-router'
import {
  CarbonDocument,
  CarbonChartMultitype,
  CarbonSettings,
} from '@/components/Icon'

const Home: React.FC = () => {
  const navigate = useNavigate()

  return (
    <div className='min-h-screen bg-base-200 p-6 flex flex-col items-center pt-20 md:justify-center md:pt-0 transition-all duration-300'>
      <h1 className='text-4xl md:text-6xl font-bold mb-12 md:mb-16 text-base-content/80 tracking-wide transition-all'>
        Legero
      </h1>

      <div className='grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8 w-full max-w-sm md:max-w-4xl transition-all'>
        <div
          onClick={() => navigate('/order')}
          className='card bg-base-100 shadow-xl hover:shadow-2xl hover:bg-base-100/60 hover:-translate-y-1 active:scale-95 transition-all duration-300 cursor-pointer group'
        >
          <div className='card-body flex flex-row md:flex-col items-center justify-center gap-4 py-8 md:py-12'>
            <CarbonDocument className='w-8 h-8 md:w-12 md:h-12 text-primary group-hover:scale-110 transition-transform duration-300' />
            <span className='text-xl md:text-2xl font-medium text-base-content/90'>
              订单管理
            </span>
          </div>
        </div>

        <div
          onClick={() => navigate('/statistics')}
          className='card bg-base-100 shadow-xl hover:shadow-2xl hover:bg-base-100/60 hover:-translate-y-1 active:scale-95 transition-all duration-300 cursor-pointer group'
        >
          <div className='card-body flex flex-row md:flex-col items-center justify-center gap-4 py-8 md:py-12'>
            <CarbonChartMultitype className='w-8 h-8 md:w-12 md:h-12 text-secondary group-hover:scale-110 transition-transform duration-300' />
            <span className='text-lg md:text-2xl font-medium text-base-content/90'>
              统计
            </span>
          </div>
        </div>

        <div
          onClick={() => navigate('/settings')}
          className='card bg-base-100 shadow-xl hover:shadow-2xl hover:bg-base-100/60 hover:-translate-y-1 active:scale-95 transition-all duration-300 cursor-pointer group'
        >
          <div className='card-body flex flex-row md:flex-col items-center justify-center gap-4 py-8 md:py-12'>
            <CarbonSettings className='w-8 h-8 md:w-12 md:h-12 text-accent group-hover:scale-110 transition-transform duration-300' />
            <span className='text-lg md:text-2xl font-medium text-base-content/90'>
              设置
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Home
