import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'

import { AddOnSelector } from './AddOnSelector'

type StatefulAddOnSelectorProps = {
  friedEggCount: number
  tofuSkewerCount: number
  onFriedEggCountChange: (count: number) => void
  onTofuSkewerCountChange: (count: number) => void
}

const StatefulAddOnSelector = ({
  friedEggCount: initialFriedEggCount,
  tofuSkewerCount: initialTofuSkewerCount,
  onFriedEggCountChange,
  onTofuSkewerCountChange,
}: StatefulAddOnSelectorProps) => {
  const [friedEggCount, setFriedEggCount] = useState(initialFriedEggCount)
  const [tofuSkewerCount, setTofuSkewerCount] = useState(initialTofuSkewerCount)

  const handleFriedEggChange = (count: number) => {
    setFriedEggCount(count)
    onFriedEggCountChange(count)
  }

  const handleTofuSkewerChange = (count: number) => {
    setTofuSkewerCount(count)
    onTofuSkewerCountChange(count)
  }

  return (
    <div className='w-full max-w-xl rounded-2xl bg-background p-4'>
      <AddOnSelector
        friedEggCount={friedEggCount}
        tofuSkewerCount={tofuSkewerCount}
        onFriedEggCountChange={handleFriedEggChange}
        onTofuSkewerCountChange={handleTofuSkewerChange}
      />
    </div>
  )
}

const meta = {
  title: 'Order/Selectors/AddOnSelector',
  component: AddOnSelector,
  parameters: {
    a11y: {
      test: 'error',
    },
  },
  decorators: [
    (Story) => (
      <div className='dark w-full max-w-xl rounded-2xl bg-background p-4'>
        <Story />
      </div>
    ),
  ],
  args: {
    friedEggCount: 1,
    tofuSkewerCount: 0,
    onFriedEggCountChange: fn(),
    onTofuSkewerCountChange: fn(),
  },
} satisfies Meta<typeof AddOnSelector>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => <StatefulAddOnSelector {...args} />,
}

export const Counters: Story = {
  args: {
    friedEggCount: 3,
    tofuSkewerCount: 2,
  },
  render: (args) => <StatefulAddOnSelector {...args} />,
}

export const KeyboardIncrement: Story = {
  args: {
    friedEggCount: 0,
    tofuSkewerCount: 0,
  },
  render: (args) => <StatefulAddOnSelector {...args} />,
  play: async ({ args, canvas, userEvent }) => {
    const incrementEgg = canvas.getByRole('button', { name: '增加煎蛋数量' })
    incrementEgg.focus()
    await expect(incrementEgg).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect(args.onFriedEggCountChange).toHaveBeenLastCalledWith(1)
  },
}

export const DecrementNeverBelowZero: Story = {
  args: {
    friedEggCount: 0,
    tofuSkewerCount: 0,
  },
  render: (args) => <StatefulAddOnSelector {...args} />,
  play: async ({ args, canvas, userEvent }) => {
    const decrementEgg = canvas.getByRole('button', { name: '减少煎蛋数量' })
    await userEvent.click(decrementEgg)
    await expect(args.onFriedEggCountChange).toHaveBeenLastCalledWith(0)
  },
}
