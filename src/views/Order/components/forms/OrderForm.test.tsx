/* @vitest-environment jsdom */

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  type RenderResult,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/services/apiClient'
import { subscribeOrdersResync } from '@/services/orderResync'
import { useOrderStore } from '@/store/order'
import {
  DEFAULT_ORDER_FORM_VALUE,
  STEP_STATUS,
  type OrderRecord,
} from '@/types'
import OrderForm from './OrderForm'

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
}))

vi.mock('@/services/orderRepository', () => ({
  orderRepository: {
    update: mocks.update,
  },
}))

vi.mock('@/hooks/useAndroidBackButton', () => ({
  registerAndroidBackInterceptor: () => () => {},
}))

vi.mock('@heroui/react', () => {
  const passthrough = ({ children, ...props }: Record<string, unknown>) => (
    <div {...props}>{children as React.ReactNode}</div>
  )

  const renderChildren = (
    children: unknown,
    extra: Record<string, unknown> = {},
  ): React.ReactNode => {
    if (typeof children === 'function') {
      return children(extra) as React.ReactNode
    }

    return children as React.ReactNode
  }

  return {
    Button: {
      Root: ({ children, isDisabled, onPress, ...props }: Record<string, unknown>) => (
        <button
          type='button'
          disabled={Boolean(isDisabled)}
          onClick={() => {
            if (!isDisabled && typeof onPress === 'function') {
              onPress()
            }
          }}
          {...props}
        >
          {children as React.ReactNode}
        </button>
      ),
    },
    CloseButton: ({ onPress, ...props }: Record<string, unknown>) => (
      <button
        type='button'
        onClick={() => {
          if (typeof onPress === 'function') {
            onPress()
          }
        }}
        {...props}
      >
        ×
      </button>
    ),
    Separator: passthrough,
    TextArea: ({ value, onChange, ...props }: Record<string, unknown>) => (
      <textarea
        value={value as string | undefined}
        onChange={
          onChange as
            | ((event: React.ChangeEvent<HTMLTextAreaElement>) => void)
            | undefined
        }
        {...props}
      />
    ),
    Modal: {
      Root: ({ isOpen, children, ...props }: Record<string, unknown>) =>
        isOpen ? <div {...props}>{children as React.ReactNode}</div> : null,
      Backdrop: passthrough,
      Container: passthrough,
      Dialog: ({ children, ...props }: Record<string, unknown>) => (
        <div {...props}>{renderChildren(children, { close: () => {} })}</div>
      ),
      Header: passthrough,
      Body: passthrough,
      Footer: passthrough,
    },
    Switch: {
      Root: ({ isSelected, onChange, children, ...props }: Record<string, unknown>) => (
        <button
          type='button'
          role='switch'
          aria-checked={Boolean(isSelected)}
          onClick={() => {
            if (typeof onChange === 'function') {
              onChange(!isSelected)
            }
          }}
          {...props}
        >
          {children as React.ReactNode}
        </button>
      ),
      Control: passthrough,
      Thumb: passthrough,
    },
    Checkbox: {
      Root: ({ isSelected, onChange, children, ...props }: Record<string, unknown>) => (
        <button
          type='button'
          role='checkbox'
          aria-checked={Boolean(isSelected)}
          onClick={() => {
            if (typeof onChange === 'function') {
              onChange(!isSelected)
            }
          }}
          {...props}
        >
          {children as React.ReactNode}
        </button>
      ),
      Control: passthrough,
      Indicator: passthrough,
      Content: passthrough,
    },
    Label: passthrough,
    Input: ({ value, onChange, ...props }: Record<string, unknown>) => (
      <input
        value={value as string | number | undefined}
        onChange={
          onChange as
            | ((event: React.ChangeEvent<HTMLInputElement>) => void)
            | undefined
        }
        {...props}
      />
    ),
    Select: {
      Root: ({ children, ...props }: Record<string, unknown>) => (
        <div {...props}>{children as React.ReactNode}</div>
      ),
      Trigger: passthrough,
      Value: passthrough,
      Indicator: passthrough,
      Popover: passthrough,
    },
    ListBox: Object.assign(
      ({ children, ...props }: Record<string, unknown>) => (
        <div {...props}>{children as React.ReactNode}</div>
      ),
      {
        Item: ({ children, ...props }: Record<string, unknown>) => (
          <div {...props}>{children as React.ReactNode}</div>
        ),
        ItemIndicator: () => null,
      },
    ),
  }
})

const makeOrder = (
  id: string,
  overrides: Partial<OrderRecord> = {},
): OrderRecord => ({
  ...DEFAULT_ORDER_FORM_VALUE,
  id,
  version: 1,
  displayNo: id,
  totalPriceCents: 1500,
  stapleStepStatusCode: STEP_STATUS.notStarted,
  meatStepStatusCode: STEP_STATUS.notStarted,
  createdAt: '2025-01-01T00:00:00+08:00',
  updatedAt: '2025-01-01T00:00:00+08:00',
  completedAt: null,
  ...overrides,
})

const flushAsync = async () => {
  for (let i = 0; i < 50; i += 1) {
    await Promise.resolve()
  }
}

let view: RenderResult

const openEditForm = () => {
  view = render(<OrderForm mode='edit' />)
}

/**
 * Re-renders the form shell with identical props, simulating the parent
 * list re-rendering on a realtime refresh. OrderForm re-derives activeItem
 * from the live store on such a re-render, which is exactly the window in
 * which a pinned session version is required to keep OCC intact.
 */
const rerenderEditForm = () => {
  view.rerender(<OrderForm mode='edit' />)
}

const resetStores = () => {
  localStorage.clear()
  useOrderStore.setState({
    ordersById: {},
    orderDisplayIds: [],
    filter: 'all',
    updateTargetID: '',
    isQuickCalcMode: false,
    quickCalcSelectedOrderIds: [],
    lastHydratedAt: null,
    status: 'idle',
    errorMessage: null,
  })
}

describe('OrderForm edit-session optimistic concurrency', () => {
  beforeEach(() => {
    resetStores()
    mocks.update.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('pins expectedVersion to the version observed at session open when realtime advances the store', async () => {
    useOrderStore.getState().upsertOrder(
      makeOrder('a', { version: 10, note: 'original' }),
    )
    useOrderStore.getState().setUpdateTargetID('a')

    openEditForm()

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'local edit' },
    })

    // Another client commits v11 while the form is still open: the store
    // record (and therefore the live activeItem lookup) moves to v11, but
    // the edit session must keep its opening version.
    act(() => {
      useOrderStore.getState().upsertOrder(
        makeOrder('a', { version: 11, note: 'remote edit' }),
      )
    })

    // The list re-renders on the realtime refresh, which re-renders the
    // form shell too: the submit closure then re-reads activeItem from the
    // store (v11) instead of the initially rendered record (v10).
    rerenderEditForm()

    mocks.update.mockResolvedValue(
      makeOrder('a', { version: 12, note: 'local edit' }),
    )

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '修改' }))
    })

    await act(async () => {
      await flushAsync()
    })

    // The submit carries the v10-based form content with expectedVersion 10
    // (NOT the store's current 11), so the server's OCC check sees the
    // concurrent modification and rejects it instead of silently overwriting.
    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(mocks.update).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({ note: 'local edit' }),
      10,
    )
    expect(mocks.update.mock.calls[0][2]).not.toBe(11)

    // The v12 response is newer than the v11 realtime state: version-aware
    // merge applies it and the session closes.
    expect(useOrderStore.getState().ordersById['a']?.version).toBe(12)
    expect(useOrderStore.getState().updateTargetID).toBe('')
  })

  it('surfaces a 409 order_conflict on a stale pinned version and requests a resync', async () => {
    useOrderStore.getState().upsertOrder(
      makeOrder('a', { version: 10, note: 'original' }),
    )
    useOrderStore.getState().setUpdateTargetID('a')

    const resync = vi.fn()
    const stopResync = subscribeOrdersResync(resync)

    openEditForm()

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'local edit' },
    })

    act(() => {
      useOrderStore.getState().upsertOrder(
        makeOrder('a', { version: 11, note: 'remote edit' }),
      )
    })

    mocks.update.mockRejectedValue(
      new ApiError(409, 'order_conflict', '订单已被其他操作修改。'),
    )

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '修改' }))
    })

    await act(async () => {
      await flushAsync()
    })

    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(mocks.update).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({ note: 'local edit' }),
      10,
    )

    // Conflict recovery: the authoritative list refetch is requested, the
    // conflict is surfaced, and the authoritative v11 store state survives.
    expect(resync).toHaveBeenCalledTimes(1)
    expect(screen.getByText('订单已被其他操作修改。')).toBeTruthy()
    expect(useOrderStore.getState().updateTargetID).toBe('a')
    expect(useOrderStore.getState().ordersById['a']?.version).toBe(11)

    stopResync()
  })

  it('re-pins expectedVersion when the edit session is reopened after the store advanced', async () => {
    useOrderStore.getState().upsertOrder(
      makeOrder('a', { version: 10, note: 'original' }),
    )
    useOrderStore.getState().setUpdateTargetID('a')

    openEditForm()

    // The session is closed without submitting; meanwhile another client
    // commits v11.
    act(() => {
      useOrderStore.getState().setUpdateTargetID('')
    })

    act(() => {
      useOrderStore.getState().upsertOrder(
        makeOrder('a', { version: 11, note: 'remote edit' }),
      )
    })

    // Re-opening the edit session starts from the fresh store state: the new
    // session must pin v11, not reuse the previous session's v10.
    act(() => {
      useOrderStore.getState().setUpdateTargetID('a')
    })

    mocks.update.mockResolvedValue(
      makeOrder('a', { version: 12, note: 'remote edit' }),
    )

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '修改' }))
    })

    await act(async () => {
      await flushAsync()
    })

    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(mocks.update).toHaveBeenCalledWith('a', expect.anything(), 11)
  })
})