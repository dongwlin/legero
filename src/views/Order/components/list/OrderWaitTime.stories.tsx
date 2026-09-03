import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import OrderWaitTime from './OrderWaitTime'
import { NowProvider } from './NowContext'

// `useNow()` reads from NowContext. Wrapping with a non-active NowProvider
// pins `now` to the provider's mount-time timestamp while never advancing it.
// Each story builds `createdAt` relative to the same module-load clock, so the
// rendered wait time stays within the intended threshold band regardless of
// small timing drift.
const NOW = Date.now()

const meta: Meta<typeof OrderWaitTime> = {
  title: 'Order/List/OrderWaitTime',
  component: OrderWaitTime,
  decorators: [
    (Story) => (
      <NowProvider active={false}>
        <div className='dark max-w-md rounded-2xl bg-background p-4 text-sm'>
          <Story />
        </div>
      </NowProvider>
    ),
  ],
  parameters: {
    a11y: {
      test: 'error',
    },
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const WithinThreshold: Story = {
  args: {
    createdAt: new Date(NOW - 5 * 60 * 1000).toISOString(),
    completedAt: null,
    waitTimeThresholdMinutes: 10,
  },
  play: async ({ canvas }) => {
    const text = canvas.getByText(/^\d{2}:\d{2}$/)
    await expect(text).toHaveClass('text-warning')
  },
}

export const OverThreshold: Story = {
  args: {
    createdAt: new Date(NOW - 15 * 60 * 1000).toISOString(),
    completedAt: null,
    waitTimeThresholdMinutes: 10,
  },
  play: async ({ canvas }) => {
    const text = canvas.getByText(/^\d{2}:\d{2}$/)
    await expect(text).toBeInTheDocument()
    await expect(text).toHaveClass('text-danger')
  },
}

export const SevereTimeout: Story = {
  args: {
    createdAt: new Date(NOW - 90 * 60 * 1000).toISOString(),
    completedAt: null,
    waitTimeThresholdMinutes: 10,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('--:--')).toBeInTheDocument()
  },
}

export const DisabledThreshold: Story = {
  args: {
    createdAt: new Date(NOW - 15 * 60 * 1000).toISOString(),
    completedAt: null,
    waitTimeThresholdMinutes: 0,
  },
  play: async ({ canvas }) => {
    const text = canvas.getByText(/^\d{2}:\d{2}$/)
    await expect(text).toBeInTheDocument()
    await expect(text).toHaveClass('text-warning')
  },
}
