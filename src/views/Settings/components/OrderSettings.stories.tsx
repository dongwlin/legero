import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import OrderSettings from './OrderSettings'

const meta = {
  title: 'Settings/OrderSettings',
  component: OrderSettings,
  parameters: {
    a11y: {
      test: 'error',
    },
  },
  decorators: [
    (Story) => (
      <div className='dark max-w-2xl bg-background p-4'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof OrderSettings>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const ThresholdInput: Story = {
  play: async ({ canvas }) => {
    const input = canvas.getByRole('spinbutton', {
      name: '等待时间超时警告（分钟）',
    })
    await expect(input).toBeInTheDocument()
  },
}
