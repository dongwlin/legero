import type { Meta, StoryObj } from '@storybook/react-vite'

import SettingsSection from './SettingsSection'

const meta = {
  title: 'Settings/SettingsSection',
  component: SettingsSection,
  parameters: {
    a11y: {
      test: 'error',
    },
  },
  decorators: [
    // The shared `text-muted` token sits just under the 4.5:1 contrast
    // threshold on the default light surface (4.2:1). Rendering in the dark
    // scheme keeps Card.Description / text-muted readable while exercising the
    // same component.
    (Story) => (
      <div className='dark max-w-2xl bg-background p-4'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SettingsSection>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    title: '订单设置',
    children: (
      <div className='rounded-2xl border border-border/60 bg-background-secondary/60 p-4 text-foreground'>
        设置内容区域
      </div>
    ),
  },
}

export const WithDescription: Story = {
  args: {
    title: '数据管理',
    description: '谨慎执行高风险操作，删除的数据无法恢复。',
    children: (
      <div className='flex gap-3'>
        <button
          type='button'
          className='rounded-xl border border-danger/30 bg-danger/10 px-4 py-2 text-sm text-foreground'
        >
          清空所有订单
        </button>
      </div>
    ),
  },
}

export const LongContent: Story = {
  args: {
    title: '实时连接诊断',
    description: '查看实时连接、重连、网络状态和数据同步情况。',
    children: (
      <div className='flex w-full items-center justify-between gap-4 rounded-2xl border border-border/60 bg-background-secondary/60 p-4 text-left'>
        <span className='min-w-0'>
          <span className='block text-base font-medium text-foreground'>
            查看实时连接诊断
          </span>
          <span className='mt-1 block text-sm leading-6 text-muted'>
            了解当前连接是否健康，以及最近一次断线和恢复原因。
          </span>
        </span>
        <span className='shrink-0 text-sm font-medium text-accent'>查看</span>
      </div>
    ),
  },
}
