import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'

import { MeatSelector } from '@/views/Order/components/selectors/MeatSelector'
import { MEAT, MEAT_LABELS, type MeatCode } from '@/types'

type StatefulMeatSelectorProps = {
  selectedMeatCodes: MeatCode[]
  onSelectedMeatCodesChange: (codes: MeatCode[]) => void
  showPorkKidney: boolean
}

const StatefulMeatSelector = ({
  selectedMeatCodes: initialSelectedMeatCodes,
  onSelectedMeatCodesChange,
  showPorkKidney,
}: StatefulMeatSelectorProps) => {
  const [selectedMeatCodes, setSelectedMeatCodes] = useState<MeatCode[]>(
    initialSelectedMeatCodes,
  )

  const handleSelectedMeatCodesChange = (nextCodes: MeatCode[]) => {
    setSelectedMeatCodes(nextCodes)
    onSelectedMeatCodesChange(nextCodes)
  }

  return (
    <div className='w-full max-w-xl rounded-2xl bg-background p-4'>
      <MeatSelector
        selectedMeatCodes={selectedMeatCodes}
        onSelectedMeatCodesChange={handleSelectedMeatCodesChange}
        showPorkKidney={showPorkKidney}
      />
      <div className='mt-4 text-sm text-foreground' role='status' aria-live='polite'>
        已选：
        {selectedMeatCodes.length > 0
          ? selectedMeatCodes.map((code) => MEAT_LABELS[code]).join('、')
          : '无'}
      </div>
    </div>
  )
}

const meta = {
  title: 'Order/Selectors/MeatSelector',
  component: MeatSelector,
  parameters: {
    a11y: {
      test: 'error',
    },
  },
  args: {
    selectedMeatCodes: [MEAT.leanPork, MEAT.liver],
    onSelectedMeatCodesChange: fn(),
    showPorkKidney: true,
  },
} satisfies Meta<typeof MeatSelector>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => <StatefulMeatSelector {...args} />,
}

export const SmallPortion: Story = {
  args: {
    selectedMeatCodes: [
      MEAT.leanPork,
      MEAT.liver,
      MEAT.bloodCurd,
      MEAT.largeIntestine,
      MEAT.smallIntestine,
    ],
    showPorkKidney: false,
  },
  render: (args) => <StatefulMeatSelector {...args} />,
  play: async ({ canvas }) => {
    await expect(
      canvas.queryByRole('checkbox', { name: '猪腰' }),
    ).not.toBeInTheDocument()
    await expect(canvas.getByRole('checkbox', { name: '瘦肉' })).toBeChecked()
  },
}

export const KeyboardSelection: Story = {
  args: {
    selectedMeatCodes: [MEAT.leanPork],
  },
  render: (args) => <StatefulMeatSelector {...args} />,
  play: async ({ args, canvas, userEvent }) => {
    const liverCheckbox = canvas.getByRole('checkbox', { name: '猪肝' })
    liverCheckbox.focus()
    await expect(liverCheckbox).toHaveFocus()
    await userEvent.keyboard(' ')
    await expect(liverCheckbox).toBeChecked()
    await expect(canvas.getByRole('status')).toHaveTextContent('已选：瘦肉、猪肝')

    const porkCheckbox = canvas.getByRole('checkbox', { name: '瘦肉' })
    porkCheckbox.focus()
    await userEvent.keyboard(' ')
    await expect(porkCheckbox).not.toBeChecked()
    await expect(canvas.getByRole('status')).toHaveTextContent('已选：猪肝')
    await expect(args.onSelectedMeatCodesChange).toHaveBeenLastCalledWith([
      MEAT.liver,
    ])
  },
}
