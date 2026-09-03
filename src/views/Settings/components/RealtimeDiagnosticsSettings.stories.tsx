import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'
import { MemoryRouter } from 'react-router'

import RealtimeDiagnosticsSettings from './RealtimeDiagnosticsSettings'

const meta = {
  title: 'Settings/RealtimeDiagnosticsSettings',
  component: RealtimeDiagnosticsSettings,
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={['/settings']}>
        <div className='dark max-w-2xl bg-background p-4'>
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
  parameters: {
    a11y: {
      test: 'error',
    },
  },
} satisfies Meta<typeof RealtimeDiagnosticsSettings>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByText('实时连接诊断')).toBeInTheDocument()
    await expect(
      canvas.getByRole('link', { name: /查看实时连接诊断/ }),
    ).toHaveAttribute('href', '/settings/diagnostics')
  },
}
