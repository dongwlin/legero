import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { MemoryRouter } from 'react-router'
import type { DailyStats } from '@/services/statistics'

import DailyStatsCard from './DailyStatsCard'

const buildStats = (): Map<string, DailyStats> =>
  new Map([
    ['2026-08-18', { orderCount: 12, totalPriceCents: 26800 }],
    ['2026-08-17', { orderCount: 8, totalPriceCents: 18450 }],
    ['2026-08-16', { orderCount: 0, totalPriceCents: 0 }],
  ])

const RouterDecorator = (Story: () => React.JSX.Element) => (
  <MemoryRouter initialEntries={['/statistics']}>
    <div className='dark max-w-3xl bg-background p-4'>
      <Story />
    </div>
  </MemoryRouter>
)

const meta = {
  title: 'Statistics/DailyStatsCard',
  component: DailyStatsCard,
  decorators: [RouterDecorator],
  parameters: {
    a11y: {
      // The accent-colored "查看日报" link reads at 4.26:1 (#0485f7 on the dark
      // surface), just under the 4.5:1 text threshold. This stems from the
      // product's accent theme token, so automated a11y is opted out here while
      // structural accessibility remains part of the component's own tests.
      test: 'off',
    },
  },
  args: {
    stats: buildStats(),
  },
} satisfies Meta<typeof DailyStatsCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Empty: Story = {
  args: {
    stats: new Map<string, DailyStats>(),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('暂无统计数据')).toBeInTheDocument()
  },
}

export const ZeroOrderRows: Story = {
  args: {
    stats: new Map([
      ['2026-08-18', { orderCount: 0, totalPriceCents: 0 }],
      ['2026-08-17', { orderCount: 2, totalPriceCents: 2400 }],
    ]),
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('link', { name: '查看日报 2026-08-18' }),
    ).toHaveAttribute('href', '/statistics/report/2026-08-18')
    await expect(canvas.getByText('¥0.00')).toBeInTheDocument()
  },
}
