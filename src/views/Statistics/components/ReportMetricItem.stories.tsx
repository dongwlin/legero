import type { Meta, StoryObj } from '@storybook/react-vite'

import ReportMetricItem from './ReportMetricItem'

const meta = {
  title: 'Statistics/ReportMetricItem',
  component: ReportMetricItem,
  parameters: {
    a11y: {
      test: 'error',
    },
    layout: 'padded',
  },
  decorators: [
    (Story) => (
      <div className='dark max-w-md rounded-2xl border border-border/70 bg-background p-4'>
        <dl>
          <Story />
        </dl>
      </div>
    ),
  ],
} satisfies Meta<typeof ReportMetricItem>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    label: '营业额',
    value: '¥24.68',
  },
}

export const WithDescription: Story = {
  args: {
    label: '小份占比',
    value: '50%（1/2）',
    description: '自定义 1 单',
  },
}

export const LongValue: Story = {
  args: {
    label: '高峰期时段',
    value: '12:00–12:30（2 单）、17:30–18:00（1 单）',
    description: '最繁忙的三个 30 分钟时段',
  },
}

export const NodeValue: Story = {
  args: {
    label: '主食销量',
    value: (
      <span className='flex flex-wrap gap-x-3 gap-y-1'>
        <span>河粉 1 单</span>
        <span>米粉 1 单</span>
      </span>
    ),
    description: '无主食 0 单 · 未知主食 0 单',
  },
}
