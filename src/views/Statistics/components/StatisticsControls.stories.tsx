import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import dayjs from 'dayjs'

import StatisticsControls from './StatisticsControls'

type StatefulControlsProps = {
  isLoading?: boolean
  onCalculate: () => void
  onFromDateChange: (value: string) => void
  onToDateChange: (value: string) => void
}

const StatefulControls = ({
  isLoading = false,
  onCalculate,
  onFromDateChange,
  onToDateChange,
}: StatefulControlsProps) => {
  const [fromDate, setFromDate] = useState(() =>
    dayjs().startOf('month').format('YYYY-MM-DD'),
  )
  const [toDate, setToDate] = useState(() => dayjs().format('YYYY-MM-DD'))

  const handleFromDateChange = (value: string) => {
    setFromDate(value)
    onFromDateChange(value)
  }

  const handleToDateChange = (value: string) => {
    setToDate(value)
    onToDateChange(value)
  }

  return (
    <StatisticsControls
      fromDate={fromDate}
      isLoading={isLoading}
      toDate={toDate}
      onCalculate={onCalculate}
      onFromDateChange={handleFromDateChange}
      onToDateChange={handleToDateChange}
    />
  )
}

const meta = {
  title: 'Statistics/StatisticsControls',
  component: StatisticsControls,
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
  args: {
    fromDate: '2026-08-01',
    isLoading: false,
    onCalculate: fn(),
    onFromDateChange: fn(),
    onToDateChange: fn(),
    toDate: '2026-08-31',
  },
} satisfies Meta<typeof StatisticsControls>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Loading: Story = {
  args: {
    isLoading: true,
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: '统计中...' })).toBeDisabled()
  },
}

export const DisabledWhenEmpty: Story = {
  args: {
    fromDate: '',
    toDate: '',
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: '统计' })).toBeDisabled()
  },
}

export const Interactive: Story = {
  render: (args) => <StatefulControls {...args} />,
  play: async ({ args, canvas, userEvent }) => {
    const fromDateInput = canvas.getByLabelText('开始日期')
    const toDateInput = canvas.getByLabelText('结束日期')

    await userEvent.click(fromDateInput)
    await userEvent.clear(fromDateInput)
    await userEvent.type(fromDateInput, '2026-09-01')
    await expect(fromDateInput).toHaveValue('2026-09-01')
    await expect(args.onFromDateChange).toHaveBeenCalled()

    await userEvent.click(toDateInput)
    await userEvent.clear(toDateInput)
    await userEvent.type(toDateInput, '2026-09-15')
    await expect(toDateInput).toHaveValue('2026-09-15')
    await expect(args.onToDateChange).toHaveBeenCalled()

    await userEvent.click(canvas.getByRole('button', { name: '统计' }))
    await expect(args.onCalculate).toHaveBeenCalled()
  },
}
