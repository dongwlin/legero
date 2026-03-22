import React from 'react'
import { Card } from '@heroui/react'
import { Link } from 'react-router'
import {
  CarbonDocument,
  CarbonChartMultitype,
  CarbonSettings,
} from '@/components/Icon'

type HomeShortcut = {
  description: string
  icon: React.ComponentType<{ className?: string }>
  iconClassName: string
  iconSurfaceClassName: string
  path: string
  title: string
}

const HOME_SHORTCUTS: HomeShortcut[] = [
  {
    title: '订单',
    description: '创建、编辑并跟进当日订单',
    path: '/order',
    icon: CarbonDocument,
    iconClassName:
      'size-8 text-accent transition-transform duration-300 group-hover:scale-110 md:size-10',
    iconSurfaceClassName: 'bg-accent-soft',
  },
  {
    title: '统计',
    description: '查看每日营业数据与趋势',
    path: '/statistics',
    icon: CarbonChartMultitype,
    iconClassName:
      'size-8 text-success transition-transform duration-300 group-hover:scale-110 md:size-10',
    iconSurfaceClassName: 'bg-success-soft',
  },
  {
    title: '设置',
    description: '调整主题、密码与基础配置',
    path: '/settings',
    icon: CarbonSettings,
    iconClassName:
      'size-8 text-warning transition-transform duration-300 group-hover:scale-110 md:size-10',
    iconSurfaceClassName: 'bg-warning-soft',
  },
]

const Home: React.FC = () => {

  return (
    <div className='min-h-dvh bg-background px-6 py-10 text-foreground md:flex md:items-center md:justify-center md:px-8 md:py-12'>
      <div className='mx-auto flex w-full max-w-5xl flex-col items-center'>
        <div className='mb-8 flex flex-col items-center text-center md:mb-12'>
          <h1 className='relative mb-4 flex items-center justify-center'>
            <span className='block bg-linear-to-r from-foreground to-muted bg-clip-text pb-[0.12em] text-4xl leading-[1.08] font-semibold tracking-[0.2em] text-transparent select-none sm:text-5xl md:text-7xl md:tracking-[0.32em]'>
              Legero
            </span>
            <span className='absolute right-0 top-1 size-2 rounded-full bg-accent shadow-[0_0_16px_var(--color-accent)] motion-safe:animate-pulse md:size-2.5'></span>
          </h1>
          <p className='max-w-xl text-center text-xs uppercase tracking-[0.28em] text-muted select-none sm:text-sm md:text-base md:tracking-[0.48em]'>
            Order Management System
          </p>
        </div>

        <div className='grid w-full grid-cols-1 gap-4 md:grid-cols-3 md:gap-6'>
          {HOME_SHORTCUTS.map(
            ({
              description,
              icon: Icon,
              iconClassName,
              iconSurfaceClassName,
              path,
              title,
            }) => (
              <Link
                key={path}
                to={path}
                className='group block rounded-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 focus-visible:ring-offset-background'
              >
                <Card.Root
                  variant='default'
                  className='h-full min-h-44 border border-border/70 bg-surface p-0 transition-transform duration-300 group-hover:-translate-y-1 group-hover:border-border-secondary group-hover:shadow-xl md:min-h-60'
                >
                  <Card.Content className='flex h-full flex-row items-center gap-4 px-5 py-6 md:flex-col md:justify-center md:gap-6 md:px-8 md:py-10'>
                    <div
                      className={`flex size-16 shrink-0 items-center justify-center rounded-3xl border border-border/50 ${iconSurfaceClassName} md:size-20`}
                    >
                      <Icon className={iconClassName} />
                    </div>
                    <div className='flex min-w-0 flex-1 flex-col gap-1 md:items-center md:text-center'>
                      <Card.Title className='text-xl md:text-2xl'>
                        {title}
                      </Card.Title>
                      <Card.Description className='text-sm leading-6 md:text-base'>
                        {description}
                      </Card.Description>
                    </div>
                  </Card.Content>
                </Card.Root>
              </Link>
            ),
          )}
        </div>
      </div>
    </div>
  )
}

export default Home
