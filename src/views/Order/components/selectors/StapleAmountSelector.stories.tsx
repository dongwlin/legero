import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import {
  ADJUSTMENT,
  STAPLE_TYPE,
  type AdjustmentCode,
  type StapleTypeCode,
} from '@/types'

import { StapleAmountSelector } from './StapleAmountSelector'

type StatefulStapleAmountSelectorProps = {
  stapleTypeCode: StapleTypeCode | null
  stapleAmountCode: AdjustmentCode
  extraStapleUnits: number
  onStapleAmountCodeChange: (amountCode: AdjustmentCode) => void
  onExtraStapleUnitsChange: (units: number) => void
}

const StatefulStapleAmountSelector = ({
  stapleTypeCode,
  stapleAmountCode: initialStapleAmountCode,
  extraStapleUnits: initialExtraStapleUnits,
  onStapleAmountCodeChange,
  onExtraStapleUnitsChange,
}: StatefulStapleAmountSelectorProps) => {
  const [stapleAmountCode, setStapleAmountCode] =
    useState<AdjustmentCode>(initialStapleAmountCode)
  const [extraStapleUnits, setExtraStapleUnits] = useState(initialExtraStapleUnits)

  const handleStapleAmountCodeChange = (code: AdjustmentCode) => {
    setStapleAmountCode(code)
    onStapleAmountCodeChange(code)
  }

  const handleExtraStapleUnitsChange = (units: number) => {
    setExtraStapleUnits(units)
    onExtraStapleUnitsChange(units)
  }

  return (
    <div className='w-full max-w-xl rounded-2xl bg-background p-4'>
      <StapleAmountSelector
        stapleTypeCode={stapleTypeCode}
        stapleAmountCode={stapleAmountCode}
        extraStapleUnits={extraStapleUnits}
        onStapleAmountCodeChange={handleStapleAmountCodeChange}
        onExtraStapleUnitsChange={handleExtraStapleUnitsChange}
      />
    </div>
  )
}

const meta = {
  title: 'Order/Selectors/StapleAmountSelector',
  component: StapleAmountSelector,
  parameters: {
    a11y: {
      test: 'error',
    },
  },
  args: {
    stapleTypeCode: STAPLE_TYPE.riceSheet,
    stapleAmountCode: ADJUSTMENT.normal,
    extraStapleUnits: 0,
    onStapleAmountCodeChange: fn(),
    onExtraStapleUnitsChange: fn(),
  },
} satisfies Meta<typeof StapleAmountSelector>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => <StatefulStapleAmountSelector {...args} />,
}

export const YiNoodleBlocks: Story = {
  args: {
    stapleTypeCode: STAPLE_TYPE.yiNoodle,
    extraStapleUnits: 1,
  },
  render: (args) => <StatefulStapleAmountSelector {...args} />,
  play: async ({ args, canvas, userEvent }) => {
    const incrementButton = canvas.getByRole('button', { name: '增加面饼' })
    await userEvent.click(incrementButton)
    await expect(args.onExtraStapleUnitsChange).toHaveBeenLastCalledWith(2)
    await expect(canvas.getByText('3')).toBeInTheDocument()
  },
}

export const Disabled: Story = {
  args: {
    stapleTypeCode: null,
  },
  render: (args) => <StatefulStapleAmountSelector {...args} />,
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: '减少主食量' }),
    ).toBeDisabled()
    await expect(
      canvas.getByRole('button', { name: '增加主食量' }),
    ).toBeDisabled()
  },
}

export const IncrementStapleAmount: Story = {
  args: {
    stapleTypeCode: STAPLE_TYPE.riceSheet,
  },
  render: (args) => <StatefulStapleAmountSelector {...args} />,
  play: async ({ args, canvas, userEvent }) => {
    const incrementButton = canvas.getByRole('button', { name: '增加主食量' })
    await userEvent.click(incrementButton)
    await expect(args.onStapleAmountCodeChange).toHaveBeenLastCalledWith(
      ADJUSTMENT.more,
    )
    await expect(canvas.getByText('多')).toBeInTheDocument()
  },
}
