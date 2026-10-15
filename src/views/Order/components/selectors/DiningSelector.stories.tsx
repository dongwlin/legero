import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import {
  DINING_METHOD,
  PACKAGING,
  PACKAGING_METHOD,
  type DiningMethodCode,
  type PackagingCode,
  type PackagingMethodCode,
} from '@/types'

import { DiningSelector } from './DiningSelector'

type StatefulDiningSelectorProps = {
  diningMethodCode: DiningMethodCode
  packagingCode: PackagingCode | null
  packagingMethodCode: PackagingMethodCode | null
  onDiningMethodCodeChange: (method: DiningMethodCode) => void
  onPackagingCodeChange: (packaging: PackagingCode) => void
  onPackagingMethodCodeChange: (method: PackagingMethodCode) => void
}

const StatefulDiningSelector = ({
  diningMethodCode: initialDiningMethodCode,
  packagingCode: initialPackagingCode,
  packagingMethodCode: initialPackagingMethodCode,
  onDiningMethodCodeChange,
  onPackagingCodeChange,
  onPackagingMethodCodeChange,
}: StatefulDiningSelectorProps) => {
  const [diningMethodCode, setDiningMethodCode] = useState(initialDiningMethodCode)
  const [packagingCode, setPackagingCode] = useState(initialPackagingCode)
  const [packagingMethodCode, setPackagingMethodCode] = useState(
    initialPackagingMethodCode,
  )

  const handleDiningMethodCodeChange = (code: DiningMethodCode) => {
    setDiningMethodCode(code)
    onDiningMethodCodeChange(code)
  }

  const handlePackagingCodeChange = (code: PackagingCode) => {
    setPackagingCode(code)
    onPackagingCodeChange(code)
  }

  const handlePackagingMethodCodeChange = (code: PackagingMethodCode) => {
    setPackagingMethodCode(code)
    onPackagingMethodCodeChange(code)
  }

  return (
    <DiningSelector
      diningMethodCode={diningMethodCode}
      packagingCode={packagingCode}
      packagingMethodCode={packagingMethodCode}
      onDiningMethodCodeChange={handleDiningMethodCodeChange}
      onPackagingCodeChange={handlePackagingCodeChange}
      onPackagingMethodCodeChange={handlePackagingMethodCodeChange}
      showTakeoutOptions={diningMethodCode === DINING_METHOD.takeout}
    />
  )
}

const meta = {
  title: 'Order/Selectors/DiningSelector',
  component: DiningSelector,
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
    diningMethodCode: DINING_METHOD.dineIn,
    packagingCode: null,
    packagingMethodCode: null,
    onDiningMethodCodeChange: fn(),
    onPackagingCodeChange: fn(),
    onPackagingMethodCodeChange: fn(),
    showTakeoutOptions: true,
  },
} satisfies Meta<typeof DiningSelector>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => <StatefulDiningSelector {...args} />,
}

export const DineIn: Story = {
  args: {
    diningMethodCode: DINING_METHOD.dineIn,
    packagingCode: null,
    packagingMethodCode: null,
  },
  render: (args) => <StatefulDiningSelector {...args} />,
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('button', { name: '包装' })).not.toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: '打包' })).not.toBeInTheDocument()
  },
}

export const Takeout: Story = {
  args: {
    diningMethodCode: DINING_METHOD.takeout,
    packagingCode: PACKAGING.container,
    packagingMethodCode: PACKAGING_METHOD.together,
  },
  render: (args) => <StatefulDiningSelector {...args} />,
  play: async ({ canvas }) => {
    // HeroUI Select triggers combine their selected value's label with the
    // aria-label, so matching by substring is reliable.
    await expect(canvas.getByRole('button', { name: /包装/ })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: /打包/ })).toBeInTheDocument()
  },
}
