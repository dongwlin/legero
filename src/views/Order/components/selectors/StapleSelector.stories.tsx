import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { STAPLE_TYPE, type StapleTypeCode } from '@/types'

import { StapleSelector } from './StapleSelector'

type StatefulStapleSelectorProps = {
  stapleTypeCode: StapleTypeCode | null
  onStapleEnabledChange: (checked: boolean) => void
  onStapleTypeCodeChange: (code: StapleTypeCode) => void
}

const StatefulStapleSelector = ({
  stapleTypeCode: initialStapleTypeCode,
  onStapleEnabledChange,
  onStapleTypeCodeChange,
}: StatefulStapleSelectorProps) => {
  const [stapleTypeCode, setStapleTypeCode] = useState<StapleTypeCode | null>(
    initialStapleTypeCode,
  )

  const handleStapleEnabledChange = (checked: boolean) => {
    setStapleTypeCode(checked ? (stapleTypeCode ?? STAPLE_TYPE.riceSheet) : null)
    onStapleEnabledChange(checked)
  }

  const handleStapleTypeCodeChange = (code: StapleTypeCode) => {
    setStapleTypeCode(code)
    onStapleTypeCodeChange(code)
  }

  return (
    <div className='w-full max-w-xl rounded-2xl bg-background p-4'>
      <StapleSelector
        stapleTypeCode={stapleTypeCode}
        onStapleEnabledChange={handleStapleEnabledChange}
        onStapleTypeCodeChange={handleStapleTypeCodeChange}
      />
    </div>
  )
}

const meta = {
  title: 'Order/Selectors/StapleSelector',
  component: StapleSelector,
  parameters: {
    a11y: {
      test: 'error',
    },
  },
  args: {
    stapleTypeCode: STAPLE_TYPE.riceSheet,
    onStapleEnabledChange: fn(),
    onStapleTypeCodeChange: fn(),
  },
} satisfies Meta<typeof StapleSelector>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => <StatefulStapleSelector {...args} />,
}

export const Disabled: Story = {
  args: {
    stapleTypeCode: null,
  },
  render: (args) => <StatefulStapleSelector {...args} />,
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: '河粉' }),
    ).toBeDisabled()
  },
}

export const ToggleStapleEnabled: Story = {
  args: {
    stapleTypeCode: null,
  },
  render: (args) => <StatefulStapleSelector {...args} />,
  play: async ({ args, canvas, userEvent }) => {
    const toggle = canvas.getByRole('switch', { name: '是否带主食' })
    await userEvent.click(toggle)
    await expect(args.onStapleEnabledChange).toHaveBeenCalledWith(true)
    await expect(canvas.getByRole('button', { name: '河粉' })).toBeEnabled()
  },
}

export const KeyboardStapleSelection: Story = {
  args: {
    stapleTypeCode: STAPLE_TYPE.riceSheet,
  },
  render: (args) => <StatefulStapleSelector {...args} />,
  play: async ({ args, canvas, userEvent }) => {
    const riceNoodleButton = canvas.getByRole('button', { name: '米粉' })
    riceNoodleButton.focus()
    await expect(riceNoodleButton).toHaveFocus()
    await userEvent.keyboard(' ')
    await expect(args.onStapleTypeCodeChange).toHaveBeenCalledWith(
      STAPLE_TYPE.riceVermicelli,
    )
    await expect(riceNoodleButton).toHaveAttribute('aria-pressed', 'true')
  },
}
