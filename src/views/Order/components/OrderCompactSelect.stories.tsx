import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'

import { OrderCompactSelect } from './OrderCompactSelect'

type ColorValue = 'red' | 'green' | 'blue'

const colorOptions: Readonly<{ value: ColorValue; label: string }[]> = [
  { value: 'red', label: '红色' },
  { value: 'green', label: '绿色' },
  { value: 'blue', label: '蓝色' },
]

const meta: Meta<typeof OrderCompactSelect> = {
  title: 'Order/OrderCompactSelect',
  component: OrderCompactSelect,
  decorators: [
    (Story) => (
      <div className='dark max-w-xs rounded-2xl bg-background p-4'>
        <Story />
      </div>
    ),
  ],
  parameters: {
    a11y: {
      test: 'error',
    },
  },
  args: {
    label: '颜色',
    value: 'red',
    options: colorOptions,
    onChange: fn(),
    isDisabled: false,
  },
}

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Disabled: Story = {
  args: {
    isDisabled: true,
  },
}

export const NoLabel: Story = {
  args: {
    label: undefined,
    value: 'green',
  },
}

export const NumericOptions: Story = {
  args: {
    label: '规格',
    value: 12,
    options: [10, 12, 15],
  },
}

export const Interaction: Story = {
  render: (args) => {
    const [value, setValue] = useState<ColorValue>(
      (args.value as ColorValue) ?? 'red',
    )

    return (
      <div className='w-full max-w-xs rounded-2xl bg-background p-4'>
        <OrderCompactSelect
          label='颜色'
          value={value}
          options={colorOptions}
          onChange={(nextValue) => {
            setValue(nextValue as ColorValue)
            args.onChange?.(nextValue)
          }}
        />
        <div className='mt-4 text-sm text-muted' role='status'>
          已选：{value}
        </div>
      </div>
    )
  },
  play: async ({ args, canvas, userEvent }) => {
    // HeroUI's Select trigger exposes its accessible name as the selected
    // option label combined with the `aria-label`, e.g. "红色 颜色".
    const trigger = canvas.getByRole('button', { name: /颜色/ })
    await userEvent.click(trigger)
    // Navigate the listbox with the keyboard: red -> green -> blue, then Enter.
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard('{Enter}')
    await expect(args.onChange).toHaveBeenCalledWith('blue')
  },
}
