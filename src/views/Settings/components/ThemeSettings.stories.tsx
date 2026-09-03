import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import ThemeSettings from './ThemeSettings'

const meta = {
  title: 'Settings/ThemeSettings',
  component: ThemeSettings,
  parameters: {
    a11y: {
      test: 'error',
    },
  },
  decorators: [
    (Story) => (
      <div className='dark max-w-2xl bg-background p-4'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ThemeSettings>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const SystemSelected: Story = {
  play: async ({ canvas }) => {
    const systemRadio = canvas.getByRole('radio', { name: /跟随系统/ })
    await expect(systemRadio).toBeInTheDocument()
    await expect(canvas.getByText('外观设置')).toBeInTheDocument()
  },
}
