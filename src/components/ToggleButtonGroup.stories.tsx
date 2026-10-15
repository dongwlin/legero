import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'

import {
  ToggleButtonGroup,
  type ToggleButtonOption,
} from '@/components/ToggleButtonGroup'

type ToggleValue = 'all' | 'meat' | 'staple'

const options: readonly ToggleButtonOption<ToggleValue>[] = [
  { value: 'all', label: '全部' },
  { value: 'meat', label: '肉类' },
  { value: 'staple', label: '主食' },
]

type StatefulToggleButtonGroupProps = {
  options: readonly ToggleButtonOption<ToggleValue>[]
  value?: ToggleValue | null
  onChange: (value: ToggleValue) => void
  isDisabled?: boolean
}

const StatefulToggleButtonGroup = ({
  options: groupOptions,
  value: initialValue = null,
  onChange,
  isDisabled,
}: StatefulToggleButtonGroupProps) => {
  const [value, setValue] = useState<ToggleValue | null>(initialValue)

  return (
    <ToggleButtonGroup
      options={groupOptions}
      value={value}
      isDisabled={isDisabled}
      onChange={(nextValue) => {
        setValue(nextValue)
        onChange(nextValue)
      }}
    />
  )
}

const meta = {
  title: 'Components/ToggleButtonGroup',
  component: ToggleButtonGroup,
  parameters: {
    a11y: {
      test: 'error',
    },
  },
  args: {
    options,
    value: 'all' as ToggleValue,
    onChange: fn(),
  },
} satisfies Meta<typeof ToggleButtonGroup>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Selected: Story = {
  args: {
    value: 'staple',
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: '主食' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  },
}

export const Disabled: Story = {
  args: {
    isDisabled: true,
  },
  play: async ({ canvas }) => {
    for (const option of options) {
      await expect(canvas.getByRole('button', { name: option.label })).toBeDisabled()
    }
  },
}

export const DarkTheme: Story = {
  args: {
    value: 'meat',
  },
  decorators: [
    (Story) => (
      <div className='dark min-h-20 bg-background p-4'>
        <Story />
      </div>
    ),
  ],
}

export const KeyboardSelection: Story = {
  render: (args) => (
    <StatefulToggleButtonGroup
      options={options}
      value={args.value as ToggleValue | null | undefined}
      isDisabled={args.isDisabled}
      onChange={args.onChange as (value: ToggleValue) => void}
    />
  ),
  play: async ({ args, canvas, userEvent }) => {
    const allButton = canvas.getByRole('button', { name: '全部' })
    const meatButton = canvas.getByRole('button', { name: '肉类' })
    allButton.focus()

    await userEvent.tab()
    await expect(meatButton).toHaveFocus()
    await userEvent.keyboard('{Enter}')

    await expect(meatButton).toHaveAttribute('aria-pressed', 'true')
    await expect(allButton).toHaveAttribute('aria-pressed', 'false')
    await expect(args.onChange).toHaveBeenCalledWith('meat')
  },
}
