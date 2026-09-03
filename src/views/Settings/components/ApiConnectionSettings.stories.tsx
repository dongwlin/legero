import type { Meta, StoryObj } from '@storybook/react-vite'

import ApiConnectionSettings from './ApiConnectionSettings'

const meta = {
  title: 'Settings/ApiConnectionSettings',
  component: ApiConnectionSettings,
  parameters: {
    a11y: {
      test: 'error',
    },
  },
  decorators: [
    (Story) => (
      <div className='max-w-2xl bg-background p-4'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ApiConnectionSettings>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const ServerAddress: Story = {
  play: async ({ canvas }) => {
    const input = canvas.getByRole('textbox', { name: '服务器地址' })
    await input
  },
}
