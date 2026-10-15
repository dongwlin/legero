import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { MemoryRouter } from 'react-router'
import OrderBenchmarkSettings from '@/views/Settings/components/OrderBenchmarkSettings'

const meta = {
  title: 'Settings/OrderBenchmarkSettings',
  component: OrderBenchmarkSettings,
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={['/settings']}>
        <div className='max-w-2xl bg-background p-4'><Story /></div>
      </MemoryRouter>
    ),
  ],
  parameters: { a11y: { test: 'error' } },
} satisfies Meta<typeof OrderBenchmarkSettings>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('link', { name: /测试订单处理性能/ })).toHaveAttribute('href', '/settings/benchmark')
  },
}
