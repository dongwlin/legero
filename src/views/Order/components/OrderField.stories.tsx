import type { Meta, StoryObj } from '@storybook/react-vite'

import OrderField from './OrderField'

const meta = {
  title: 'Order/OrderField',
  component: OrderField,
  parameters: {
    a11y: {
      test: 'error',
    },
  },
  decorators: [
    (Story) => (
      <div className='dark max-w-xl rounded-2xl bg-background p-4'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof OrderField>

export default meta
type Story = StoryObj<typeof meta>

const SampleContent = ({ text }: { text: string }) => (
  <div className='rounded-xl border border-border/60 bg-background px-4 py-3 text-foreground'>
    {text}
  </div>
)

export const Default: Story = {
  args: {
    label: '数量',
    children: <SampleContent text='内容区域' />,
  },
}

export const WithDescription: Story = {
  args: {
    label: '主食量',
    description: '根据主食类型显示不同的选择器',
    children: <SampleContent text='内容区域' />,
  },
}

export const NoHeader: Story = {
  args: {
    children: <SampleContent text='无标题的内容区域' />,
  },
}

export const CustomContent: Story = {
  args: {
    label: '自定义内容类',
    contentClassName: 'flex flex-1 flex-col justify-center',
    children: (
      <div className='rounded-xl border border-border/60 bg-background px-4 py-3 text-center text-foreground'>
        纵向居中的内容
      </div>
    ),
  },
}
