import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { SIZE, STAPLE_TYPE, type SizeCode, type StapleTypeCode } from '@/types'

import { SizeSelector } from './SizeSelector'

type StatefulSizeSelectorProps = {
  sizeCode: SizeCode
  stapleTypeCode: StapleTypeCode | null
  customSizePriceCents: number | null
  onSizeCodeChange: (sizeCode: SizeCode) => void
  onCustomSizePriceCentsChange: (priceCents: number | null) => void
}

const StatefulSizeSelector = ({
  sizeCode: initialSizeCode,
  stapleTypeCode,
  customSizePriceCents: initialCustomSizePriceCents,
  onSizeCodeChange,
  onCustomSizePriceCentsChange,
}: StatefulSizeSelectorProps) => {
  const [sizeCode, setSizeCode] = useState(initialSizeCode)
  const [customSizePriceCents, setCustomSizePriceCents] = useState<number | null>(
    initialCustomSizePriceCents,
  )

  const handleSizeCodeChange = (code: SizeCode) => {
    setSizeCode(code)
    setCustomSizePriceCents(code === SIZE.custom ? customSizePriceCents : null)
    onSizeCodeChange(code)
  }

  const handleCustomSizePriceCentsChange = (priceCents: number | null) => {
    setCustomSizePriceCents(priceCents)
    onCustomSizePriceCentsChange(priceCents)
  }

  const showCustomPrice = sizeCode === SIZE.custom

  return (
    <div className='w-full max-w-xl rounded-2xl bg-background p-4'>
      <SizeSelector
        sizeCode={sizeCode}
        stapleTypeCode={stapleTypeCode}
        customSizePriceCents={customSizePriceCents}
        onSizeCodeChange={handleSizeCodeChange}
        onCustomSizePriceCentsChange={handleCustomSizePriceCentsChange}
        showCustomPrice={showCustomPrice}
      />
    </div>
  )
}

const meta = {
  title: 'Order/Selectors/SizeSelector',
  component: SizeSelector,
  parameters: {
    a11y: {
      test: 'error',
    },
  },
  args: {
    sizeCode: SIZE.medium,
    stapleTypeCode: STAPLE_TYPE.riceSheet,
    customSizePriceCents: null,
    onSizeCodeChange: fn(),
    onCustomSizePriceCentsChange: fn(),
    showCustomPrice: false,
  },
} satisfies Meta<typeof SizeSelector>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => <StatefulSizeSelector {...args} />,
}

export const RiceStaple: Story = {
  args: {
    sizeCode: SIZE.medium,
    stapleTypeCode: STAPLE_TYPE.rice,
  },
  render: (args) => <StatefulSizeSelector {...args} />,
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole('button', { name: '小' })).not.toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: '15' })).toBeInTheDocument()
  },
}

export const CustomPrice: Story = {
  args: {
    sizeCode: SIZE.custom,
    customSizePriceCents: 1500,
  },
  render: (args) => <StatefulSizeSelector {...args} />,
  play: async ({ canvas }) => {
    const priceInput = canvas.getByRole('spinbutton', { name: '自定义价格' })
    await expect(priceInput).toHaveValue(15)
  },
}

export const EnterCustomPrice: Story = {
  args: {
    sizeCode: SIZE.medium,
    stapleTypeCode: STAPLE_TYPE.riceSheet,
  },
  render: (args) => <StatefulSizeSelector {...args} />,
  play: async ({ args, canvas, userEvent }) => {
    const customButton = canvas.getByRole('button', { name: '自定义' })
    await userEvent.click(customButton)
    await expect(args.onSizeCodeChange).toHaveBeenCalledWith(SIZE.custom)

    const priceInput = await canvas.getByRole('spinbutton', {
      name: '自定义价格',
    })
    await userEvent.clear(priceInput)
    await userEvent.type(priceInput, '13')
    await expect(args.onCustomSizePriceCentsChange).toHaveBeenLastCalledWith(1300)
  },
}

export const KeyboardSelection: Story = {
  args: {
    sizeCode: SIZE.small,
  },
  render: (args) => <StatefulSizeSelector {...args} />,
  play: async ({ args, canvas, userEvent }) => {
    // With riceSheet staple, size buttons render their price label (10/12/15).
    const largeButton = canvas.getByRole('button', { name: '15' })
    largeButton.focus()
    await expect(largeButton).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect(args.onSizeCodeChange).toHaveBeenCalledWith(SIZE.large)
    await expect(largeButton).toHaveAttribute('aria-pressed', 'true')
  },
}
