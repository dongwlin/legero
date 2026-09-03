import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { ADJUSTMENT, type AdjustmentCode } from '@/types'

import { IngredientSelector } from './IngredientSelector'

type StatefulIngredientSelectorProps = {
  greensCode: AdjustmentCode
  scallionCode: AdjustmentCode
  pepperCode: AdjustmentCode
  onGreensCodeChange: (value: AdjustmentCode) => void
  onScallionCodeChange: (value: AdjustmentCode) => void
  onPepperCodeChange: (value: AdjustmentCode) => void
}

const StatefulIngredientSelector = ({
  greensCode: initialGreensCode,
  scallionCode: initialScallionCode,
  pepperCode: initialPepperCode,
  onGreensCodeChange,
  onScallionCodeChange,
  onPepperCodeChange,
}: StatefulIngredientSelectorProps) => {
  const [greensCode, setGreensCode] = useState(initialGreensCode)
  const [scallionCode, setScallionCode] = useState(initialScallionCode)
  const [pepperCode, setPepperCode] = useState(initialPepperCode)

  const handleGreensCodeChange = (code: AdjustmentCode) => {
    setGreensCode(code)
    onGreensCodeChange(code)
  }

  const handleScallionCodeChange = (code: AdjustmentCode) => {
    setScallionCode(code)
    onScallionCodeChange(code)
  }

  const handlePepperCodeChange = (code: AdjustmentCode) => {
    setPepperCode(code)
    onPepperCodeChange(code)
  }

  return (
    <div className='w-full max-w-xl rounded-2xl bg-background p-4'>
      <IngredientSelector
        greensCode={greensCode}
        scallionCode={scallionCode}
        pepperCode={pepperCode}
        onGreensCodeChange={handleGreensCodeChange}
        onScallionCodeChange={handleScallionCodeChange}
        onPepperCodeChange={handlePepperCodeChange}
      />
    </div>
  )
}

const meta = {
  title: 'Order/Selectors/IngredientSelector',
  component: IngredientSelector,
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
    greensCode: ADJUSTMENT.normal,
    scallionCode: ADJUSTMENT.normal,
    pepperCode: ADJUSTMENT.less,
    onGreensCodeChange: fn(),
    onScallionCodeChange: fn(),
    onPepperCodeChange: fn(),
  },
} satisfies Meta<typeof IngredientSelector>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => <StatefulIngredientSelector {...args} />,
}

export const Adjustments: Story = {
  args: {
    greensCode: ADJUSTMENT.more,
    scallionCode: ADJUSTMENT.none,
    pepperCode: ADJUSTMENT.normal,
  },
  render: (args) => <StatefulIngredientSelector {...args} />,
}
