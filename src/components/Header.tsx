import { CarbonArrowLeft } from '@/components/Icon'
import { Button } from '@heroui/react'
import React from 'react'
import { useNavigate } from 'react-router'

interface HeaderProps {
  title?: string
}

const Header: React.FC<HeaderProps> = ({ title = '' }) => {
  const navigate = useNavigate()

  const navigateToHomeView = () => {
    navigate('/', {
      replace: true,
    })
  }

  return (
    <header
      className='
      fixed top-0 left-0 right-0 z-10 flex items-center border-b border-separator
      bg-background/90 px-4 backdrop-blur-md md:px-8
      pt-[env(safe-area-inset-top)] h-[calc(4rem+env(safe-area-inset-top))]
      '
    >
      <Button.Root
        isIconOnly
        variant='ghost'
        className='shrink-0'
        onPress={navigateToHomeView}
        aria-label='返回首页'
      >
        <CarbonArrowLeft className='size-5 md:size-6' />
      </Button.Root>
      <h1 className='ml-4 text-xl font-semibold text-foreground select-none md:text-2xl'>
        {title}
      </h1>
    </header>
  )
}

export default Header
