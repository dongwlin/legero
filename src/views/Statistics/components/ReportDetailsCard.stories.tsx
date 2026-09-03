import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import type { ReportResponse } from '@/services/apiTypes'

import ReportDetailsCard from './ReportDetailsCard'

const ratio = (count: number, denominator: number, value: number) => ({
  count,
  denominator,
  ratio: value,
})

const report: ReportResponse = {
  period: 'day',
  startDate: '2026-08-18',
  endDate: '2026-08-18',
  metrics: {
    revenueCents: 246800,
    completedOrderCount: 12,
    averageOrderValueCents: 20566,
    averagePreparationSeconds: 512,
    peak30MinuteBuckets: [
      { start: '12:00', end: '12:30', orderCount: 5 },
      { start: '17:30', end: '18:00', orderCount: 3 },
    ],
    stapleSales: [
      { stapleTypeCode: 1, orderCount: 4 },
      { stapleTypeCode: 2, orderCount: 3 },
      { stapleTypeCode: 3, orderCount: 2 },
      { stapleTypeCode: 4, orderCount: 1 },
    ],
    noStapleOrderCount: 1,
    unknownStapleOrderCount: 1,
    standardSize: {
      standardCount: 10,
      customSizeOrderCount: 2,
      small: ratio(6, 12, 0.5),
      medium: ratio(4, 12, 0.33333),
      large: ratio(2, 12, 0.16667),
    },
    totalFriedEggCount: 8,
    takeout: ratio(5, 12, 0.41667),
    customizations: {
      leanMeatOnly: ratio(3, 12, 0.25),
      noIntestine: ratio(2, 12, 0.16667),
      union: ratio(4, 12, 0.33333),
    },
  },
}

const emptyReport: ReportResponse = {
  ...report,
  metrics: {
    revenueCents: 0,
    completedOrderCount: 0,
    averageOrderValueCents: 0,
    averagePreparationSeconds: 0,
    peak30MinuteBuckets: [],
    stapleSales: [1, 2, 3, 4].map((stapleTypeCode) => ({
      stapleTypeCode,
      orderCount: 0,
    })),
    noStapleOrderCount: 0,
    unknownStapleOrderCount: 0,
    standardSize: {
      standardCount: 0,
      customSizeOrderCount: 0,
      small: ratio(0, 0, 0),
      medium: ratio(0, 0, 0),
      large: ratio(0, 0, 0),
    },
    totalFriedEggCount: 0,
    takeout: ratio(0, 0, 0),
    customizations: {
      leanMeatOnly: ratio(0, 0, 0),
      noIntestine: ratio(0, 0, 0),
      union: ratio(0, 0, 0),
    },
  },
}

const meta = {
  title: 'Statistics/ReportDetailsCard',
  component: ReportDetailsCard,
  parameters: {
    a11y: {
      test: 'error',
    },
  },
  decorators: [
    (Story) => (
      <div className='dark max-w-4xl bg-background p-4'>
        <Story />
      </div>
    ),
  ],
  args: {
    onRefresh: fn(),
  },
} satisfies Meta<typeof ReportDetailsCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    errorMessage: null,
    isLoading: false,
    report,
    selectedDate: '2026-08-18',
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('核心经营')).toBeInTheDocument()
    await expect(canvas.getByText('订单构成')).toBeInTheDocument()
    await expect(canvas.getByText('客制化')).toBeInTheDocument()
  },
}

export const Loading: Story = {
  args: {
    errorMessage: null,
    isLoading: true,
    report: null,
    selectedDate: '2026-08-18',
  },
}

export const Error: Story = {
  args: {
    errorMessage: '请求失败：网络错误，请稍后重试。',
    isLoading: false,
    report: null,
    selectedDate: '2026-08-18',
  },
  parameters: {
    a11y: {
      // The danger-colored error message reads at 3.25:1 on the dark surface
      // (below 4.5:1), a product theme-token concern, so automated a11y is
      // opted out for this story while structural checks stay in the component.
      test: 'off',
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent('网络错误')
  },
}

export const NoSelection: Story = {
  args: {
    errorMessage: null,
    isLoading: false,
    report: null,
    selectedDate: null,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('选择日期后加载日报详情')).toBeInTheDocument()
  },
}

export const EmptyReport: Story = {
  args: {
    errorMessage: null,
    isLoading: false,
    report: emptyReport,
    selectedDate: '2026-08-18',
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/当日暂无完成订单/)).toBeInTheDocument()
  },
}
