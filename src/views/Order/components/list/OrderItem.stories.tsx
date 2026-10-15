import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn } from 'storybook/test'
import { useOrderStore } from '@/store/order'
import {
  DEFAULT_ORDER_FORM_VALUE,
  STEP_STATUS,
  type OrderRecord,
} from '@/types'

import OrderItem from './OrderItem'

const makeOrder = (overrides: Partial<OrderRecord> = {}): OrderRecord => ({
  ...DEFAULT_ORDER_FORM_VALUE,
  id: 'order-1',
  version: 1,
  displayNo: '001',
  totalPriceCents: 1500,
  stapleStepStatusCode: STEP_STATUS.notStarted,
  meatStepStatusCode: STEP_STATUS.notStarted,
  createdAt: '2026-08-18T11:50:00+08:00',
  updatedAt: '2026-08-18T11:50:00+08:00',
  completedAt: null,
  ...overrides,
})

const withOrder = (record: OrderRecord) => {
  useOrderStore.setState({
    ordersById: { [record.id]: record },
    orderDisplayIds: [record.id],
    filter: 'all',
    updateTargetID: '',
    isQuickCalcMode: false,
    quickCalcSelectedOrderIds: [],
    status: 'ready',
  })
}

// Static render story for the core order card. The action buttons are rendered
// but not exercised here, so no network/service calls are triggered.
const meta = {
  title: 'Order/List/OrderItem',
  component: OrderItem,
  parameters: {
    a11y: {
      test: 'error',
    },
  },
  args: {
    id: 'order-1',
    isQuickCalcMode: false,
    isQuickCalcSelected: false,
    onEnterQuickCalc: fn(),
    onToggleQuickCalcSelection: fn(),
  },
  decorators: [
    (Story) => {
      withOrder(makeOrder())
      return (
        <div className='dark max-w-xl bg-background p-4'>
          <Story />
        </div>
      )
    },
  ],
} satisfies Meta<typeof OrderItem>

export default meta
type Story = StoryObj<typeof meta>

export const PendingOrder: Story = {
  play: async ({ canvas }) => {
    // displayNo is rendered via getDisplayNoText as a zero-padded "#00n".
    await expect(canvas.getByText('#1')).toBeInTheDocument()
    await expect(canvas.getByText('河粉')).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: '出餐' })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: '主食' })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: '肉' })).toBeInTheDocument()
  },
}

export const CompletedOrder: Story = {
  decorators: [
    (Story) => {
      withOrder(
        makeOrder({
          completedAt: '2026-08-18T11:55:00+08:00',
          meatStepStatusCode: STEP_STATUS.completed,
        }),
      )
      return (
        <div className='dark max-w-xl bg-background p-4'>
          <Story />
        </div>
      )
    },
  ],
}

export const QuickCalcSelected: Story = {
  args: {
    id: 'order-1',
    isQuickCalcMode: true,
    isQuickCalcSelected: true,
    onEnterQuickCalc: fn(),
    onToggleQuickCalcSelection: fn(),
  },
}
