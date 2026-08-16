/* @vitest-environment jsdom */

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  type RenderResult,
} from '@testing-library/react'
import { cloneElement, isValidElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/services/apiClient'
import { orderTombstones } from '@/services/orderTombstones'
import { subscribeOrdersResync } from '@/services/orderResync'
import { useOrderStore } from '@/store/order'
import {
  DEFAULT_ORDER_FORM_VALUE,
  STEP_STATUS,
  type OrderRecord,
} from '@/types'
import OrderForm from './OrderForm'

const mocks = vi.hoisted(() => ({
  createMany: vi.fn(),
  update: vi.fn(),
}))

vi.mock('@/services/orderRepository', () => ({
  orderRepository: {
    createMany: mocks.createMany,
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
      Root: ({
        isOpen,
        onOpenChange,
        children,
        ...props
      }: Record<string, unknown>) => {
        if (!isOpen) {
          // Closed modal: HeroUI keeps the trigger rendered (in this app a
          // plain button that precedes the dialog) and opens the modal when
          // it is pressed. Reproduce that wiring so the create modal can be
          // opened in tests the way the app opens it.
          const childArray = Array.isArray(children)
            ? (children as React.ReactNode[])
            : []
          const trigger = childArray.find(
            (child): child is React.ReactElement =>
              isValidElement(child),
          )

          if (!trigger) {
            return null
          }

          return (
            <div {...props}>
              {cloneElement(trigger, {
                onClick: () => {
                  if (typeof onOpenChange === 'function') {
                    onOpenChange(true)
                  }
                },
              } as Record<string, unknown>)}
            </div>
          )
        }

        return <div {...props}>{children as React.ReactNode}</div>
      },
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

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

let view: RenderResult

const openEditForm = () => {
  view = render(<OrderForm mode='edit' />)
}

const openCreateForm = () => {
  view = render(<OrderForm mode='create' />)
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
    orderSyncSeq: 0,
  })
}

describe('OrderForm edit-session optimistic concurrency', () => {
  beforeEach(() => {
    resetStores()
    orderTombstones.reset()
    mocks.createMany.mockReset()
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

  it('re-pins expectedVersion to the resynced record after a 409 without closing the modal', async () => {
    // Review blocker: after a 409 the form must not stay pinned to the stale
    // opening version forever. Sticking with the modal open, a retry after
    // the resync carries the fresh authoritative version instead of
    // re-409ing on the old pin.
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

    mocks.update
      .mockRejectedValueOnce(
        new ApiError(409, 'order_conflict', '订单已被其他操作修改。'),
      )
      .mockResolvedValueOnce(
        makeOrder('a', { version: 12, note: 'retried edit' }),
      )

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '修改' }))
    })

    await act(async () => {
      await flushAsync()
    })

    // The first submit carried the pinned v10 and got the conflict; the
    // resync was requested while the modal stayed open and the store still
    // holds v10.
    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(mocks.update.mock.calls[0][2]).toBe(10)
    expect(resync).toHaveBeenCalledTimes(1)
    expect(useOrderStore.getState().ordersById['a']?.version).toBe(10)

    // The resync commit lands: the store advances to the authoritative v11.
    // The edit session restarts against it instead of keeping the v10 pin.
    act(() => {
      useOrderStore.getState().upsertOrder(
        makeOrder('a', { version: 11, note: 'resynced' }),
      )
    })
    await act(async () => {
      await flushAsync()
    })

    // Submitting again — without closing the modal — must now carry v11.
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '修改' }))
    })

    await act(async () => {
      await flushAsync()
    })

    expect(mocks.update).toHaveBeenCalledTimes(2)
    expect(mocks.update.mock.calls[1][2]).toBe(11)
    expect(mocks.update.mock.calls[1][2]).not.toBe(10)

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

  it('does not re-insert an order deleted while the edit was in flight when the PUT succeeds late', async () => {
    useOrderStore.getState().upsertOrder(
      makeOrder('a', { version: 10, note: 'original' }),
    )
    useOrderStore.getState().setUpdateTargetID('a')

    openEditForm()

    const pendingUpdate = deferred<OrderRecord>()
    mocks.update.mockReturnValue(pendingUpdate.promise)

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '修改' }))
    })

    // The order is deleted (another client) while the PUT is in flight: the
    // realtime handler registers the session-wide terminal tombstone and the
    // store empties.
    act(() => {
      orderTombstones.markRemoved('a')
      useOrderStore.getState().removeOrder('a')
    })

    // The PUT response settles last: the authoritative merge must not treat
    // it as a brand-new record and re-insert the deleted order.
    await act(async () => {
      pendingUpdate.resolve(
        makeOrder('a', { version: 11, note: 'late-success' }),
      )
      await flushAsync()
    })

    expect(useOrderStore.getState().ordersById['a']).toBeUndefined()
  })

  it('does not blind-insert a create that resolves after a full clear', async () => {
    // Review blocker P1: the client does not know the created id until the
    // HTTP response returns, so no id tombstone can cover it at clear time.
    // A full clear that committed while the POST was in flight may have
    // deleted the order — the late response must not be treated as
    // authoritative state; a resync decides instead whether it still exists.
    const resync = vi.fn()
    const stopResync = subscribeOrdersResync(resync)

    const pendingCreate = deferred<OrderRecord[]>()
    mocks.createMany.mockReturnValue(pendingCreate.promise)

    openCreateForm()

    // A closed modal keeps its trigger rendered; pressing it opens the
    // create session (HeroUI trigger wiring, reproduced by the modal mock).
    act(() => {
      fireEvent.click(
        screen.getByRole('button', { name: '创建订单' }),
      )
    })

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '创建' }))
    })
    expect(mocks.createMany).toHaveBeenCalledTimes(1)

    // While the POST is in flight, a full clear is processed elsewhere (the
    // sync hook): the clear epoch advances and the workspace empties.
    act(() => {
      orderTombstones.bumpClearEpoch()
      useOrderStore.getState().clearOrders()
    })

    // The create response lands last, carrying an id the client could not
    // have tombstoned at clear time.
    await act(async () => {
      pendingCreate.resolve([makeOrder('c', { version: 1, note: 'created' })])
      await flushAsync()
    })

    // No blind insert into the emptied workspace, and an authoritative
    // resync was requested to settle whether the order survived the clear.
    expect(useOrderStore.getState().ordersById['c']).toBeUndefined()
    expect(resync).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: '创建' })).toBeNull()

    stopResync()
  })

  it('closes the edit session when the 409 resync commits a snapshot without the record', async () => {
    // Review blocker P2: if the authoritative resync after a 409 reveals the
    // order was deleted meanwhile, there is no fresh record to restart the
    // session against — the modal must close instead of staying open on a
    // ghost (repeated submits would fail with '未找到要修改的订单').
    useOrderStore.getState().upsertOrder(
      makeOrder('a', { version: 10, note: 'original' }),
    )
    useOrderStore.getState().setUpdateTargetID('a')

    const resync = vi.fn()
    const stopResync = subscribeOrdersResync(resync)

    openEditForm()

    mocks.update.mockRejectedValue(
      new ApiError(409, 'order_conflict', '订单已被其他操作修改。'),
    )

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '修改' }))
    })

    await act(async () => {
      await flushAsync()
    })

    // The 409 surfaced, the resync was requested, and the modal stays open
    // while the resync is still in flight (absence alone must not close it).
    expect(resync).toHaveBeenCalledTimes(1)
    expect(useOrderStore.getState().updateTargetID).toBe('a')
    expect(useOrderStore.getState().ordersById['a']).toBeDefined()

    // The resync commit lands: the snapshot no longer contains 'a' (the
    // order was deleted while the conflict was being resolved). The commit
    // advances the store's reconciliation sequence.
    const syncSeqAtConflict = useOrderStore.getState().orderSyncSeq
    act(() => {
      useOrderStore.getState().setOrders([])
    })
    expect(useOrderStore.getState().orderSyncSeq).toBeGreaterThan(
      syncSeqAtConflict,
    )

    await act(async () => {
      await flushAsync()
    })

    // The edit session closed: no update target, no modal rendered.
    expect(useOrderStore.getState().updateTargetID).toBe('')
    expect(screen.queryByRole('button', { name: '修改' })).toBeNull()

    stopResync()
  })
})