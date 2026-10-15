import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent } from 'storybook/test'
import { MemoryRouter } from 'react-router'
import OrderBenchmark from '@/views/Settings/Benchmark'
import { makeBenchmarkPreviewResult } from '@/views/Settings/Benchmark/previewData'

const meta = {
  title: 'Settings/OrderBenchmark',
  component: OrderBenchmark,
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={['/settings/benchmark']}>
        <Story />
      </MemoryRouter>
    ),
  ],
  parameters: { a11y: { test: 'error' } },
} satisfies Meta<typeof OrderBenchmark>

export default meta
type Story = StoryObj<typeof meta>

export const Idle: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: '开始测试 5 轮' })).toBeEnabled()
    await expect(canvas.getByText(/不会读取或修改真实订单/)).toBeInTheDocument()
  },
}

export const CompletedPreview: Story = {
  args: { runBenchmark: async () => makeBenchmarkPreviewResult() },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: '开始测试 5 轮' }))
    await expect(canvas.getByText('5 轮平均结果')).toBeInTheDocument()
    await expect(canvas.getByText('1820 单，其中今日 130 单')).toBeInTheDocument()
  },
}

export const Failure: Story = {
  args: { runBenchmark: async () => { throw new Error('Illustrative benchmark error') } },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button', { name: '开始测试 5 轮' }))
    await expect(canvas.getByRole('alert')).toHaveTextContent('测试未完成')
  },
}
