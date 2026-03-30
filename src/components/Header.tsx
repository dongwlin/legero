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
      fixed top-0 left-0 right-0 z-10 border-b border-separator
      bg-background/90 px-4 backdrop-blur-md md:px-8
      pt-[env(safe-area-inset-top)] h-[calc(4rem+env(safe-area-inset-top))]
      '
    >
      <div className='relative flex h-full items-center justify-center'>
        <Button.Root
          isIconOnly
          variant='ghost'
          className='absolute left-0 top-1/2 shrink-0 -translate-y-1/2'
          onPress={navigateToHomeView}
          aria-label='返回首页'
        >
          <CarbonArrowLeft className='size-5 md:size-6' />
        </Button.Root>
        <h1 className='w-full px-14 text-center text-xl font-semibold text-foreground select-none truncate md:px-20 md:text-2xl'>
          {title}
        </h1>
      </div>
    </header>
  )
}

export default Header
