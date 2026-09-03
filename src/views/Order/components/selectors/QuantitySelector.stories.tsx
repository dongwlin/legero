import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'

import { QuantitySelector } from './QuantitySelector'

type StatefulQuantitySelectorProps = {
  num: number
  setNum: (num: number) => void
}

const StatefulQuantitySelector = ({
  num: initialNum,
  setNum: onSetNum,
}: StatefulQuantitySelectorProps) => {
  const [num, setNum] = useState(initialNum)

  return (
    <div className='w-full max-w-xl rounded-2xl bg-background p-4'>
      <QuantitySelector
        num={num}
        setNum={(nextNum) => {
          setNum(nextNum)
          onSetNum(nextNum)
        }}
      />
    </div>
  )
}

const meta = {
  title: 'Order/Selectors/QuantitySelector',
  component: QuantitySelector,
  parameters: {
    a11y: {
      test: 'error',
    },
  },
  args: {
    num: 1,
    setNum: fn(),
  },
} satisfies Meta<typeof QuantitySelector>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => <StatefulQuantitySelector {...args} />,
}

export const LargeQuantity: Story = {
  args: {
    num: 5,
  },
  render: (args) => <StatefulQuantitySelector {...args} />,
}

export const Increment: Story = {
  args: {
    num: 1,
  },
  render: (args) => <StatefulQuantitySelector {...args} />,
  play: async ({ args, canvas, userEvent }) => {
    const incrementButton = canvas.getByRole('button', { name: '增加数量' })
    await userEvent.click(incrementButton)
    await expect(args.setNum).toHaveBeenLastCalledWith(2)
    await expect(canvas.getByText('2')).toBeInTheDocument()
  },
}

export const DecrementNeverBelowOne: Story = {
  args: {
    num: 1,
  },
  render: (args) => <StatefulQuantitySelector {...args} />,
  play: async ({ args, canvas, userEvent }) => {
    const decrementButton = canvas.getByRole('button', { name: '减少数量' })
    await userEvent.click(decrementButton)
    await expect(args.setNum).toHaveBeenLastCalledWith(1)
    await expect(canvas.getByText('1')).toBeInTheDocument()
  },
}

export const KeyboardArithmetic: Story = {
  args: {
    num: 2,
  },
  render: (args) => <StatefulQuantitySelector {...args} />,
  play: async ({ args, canvas, userEvent }) => {
    const incrementButton = canvas.getByRole('button', { name: '增加数量' })
    incrementButton.focus()
    await expect(incrementButton).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect(args.setNum).toHaveBeenLastCalledWith(3)
  },
}
