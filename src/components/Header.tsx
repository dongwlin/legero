import { CarbonArrowLeft } from '@/components/Icon'
import React from 'react'
import { useNavigate } from 'react-router'

interface HeaderProps {
  title?: string
}

const Header: React.FC<HeaderProps> = ({ title = '' }) => {
  const navigate = useNavigate()

  const NavToHomeView = () => {
    navigate('/', {
      replace: true,
    })
  }

  return (
    <div
      className='
      fixed top-0 left-0 right-0 z-10 bg-base-100 shadow-sm flex items-center px-4 md:px-8
      pt-[env(safe-area-inset-top)] h-[calc(4rem+env(safe-area-inset-top))]
      '
    >
      <button
        className='btn btn-ghost btn-circle'
        onClick={NavToHomeView}
        aria-label='返回首页'
      >
        <CarbonArrowLeft className='w-6 h-6 md:w-8 md:h-8' />
      </button>
      <h1 className='ml-4 text-xl md:text-2xl font-bold select-none'>
        {title}
      </h1>
    </div>
  )
}

export default Header
