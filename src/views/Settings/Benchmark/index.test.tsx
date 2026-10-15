/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  OrderBenchmarkError,
  type OrderBenchmarkProgress,
  type OrderBenchmarkResult,
} from '@/services/orderBenchmark'

const mocks = vi.hoisted(() => ({ runBenchmark: vi.fn() }))

vi.mock('@heroui/react', () => {
  const passthrough = ({ children, ...props }: Record<string, unknown>) => <div {...props}>{children as ReactNode}</div>
  const button = ({ children, isDisabled, onPress, ...props }: Record<string, unknown>) => (
    <button {...props} disabled={Boolean(isDisabled)} onClick={onPress as (() => void) | undefined}>{children as ReactNode}</button>
  )
  return {
    Button: { Root: button },
    Card: { Root: passthrough, Header: passthrough, Title: passthrough, Description: passthrough, Content: passthrough },
  }
})

vi.mock('@/components/Header', () => ({ default: ({ title }: { title: string }) => <header>{title}</header> }))
vi.mock('@/services/orderBenchmark', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/orderBenchmark')>()
  return { ...actual, runOrderBenchmark: mocks.runBenchmark }
})

import OrderBenchmark from '@/views/Settings/Benchmark'
import { makeBenchmarkPreviewResult } from '@/views/Settings/Benchmark/previewData'

const start = () => fireEvent.click(screen.getByRole('button', { name: '开始测试 5 轮' }))

describe('OrderBenchmark', () => {
  beforeEach(() => {
    mocks.runBenchmark.mockReset()
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    Object.defineProperty(document, 'execCommand', { configurable: true, value: undefined })
  })

  afterEach(() => { cleanup() })

  it('runs the shared five-trial protocol and displays means and all raw trials', async () => {
    const result = makeBenchmarkPreviewResult()
    mocks.runBenchmark.mockResolvedValue(result)
    render(<OrderBenchmark />)
    expect(screen.getByText(/不会读取或修改真实订单/)).not.toBeNull()
    expect(screen.getByText(/不包含网络、服务器响应或页面完整渲染耗时/)).not.toBeNull()
    await act(async () => { start() })
    expect(mocks.runBenchmark).toHaveBeenCalledTimes(1)
    expect(screen.getByText('5 轮平均结果')).not.toBeNull()
    expect(screen.getAllByText('查看 5 轮原始耗时')).toHaveLength(result.means.length)
    const data = screen.getByRole('textbox', { name: '完整测试结果 JSON' }) as HTMLTextAreaElement
    expect(JSON.parse(data.value)).toEqual(result)
    expect(screen.getByRole('button', { name: '重新测试 5 轮' })).not.toBeNull()
  })

  it('ignores late progress and completion from a cancelled run after a rerun starts', async () => {
    let finish: (result: OrderBenchmarkResult) => void = () => {}
    let firstProgress: (value: OrderBenchmarkProgress) => void = () => {}
    let callCount = 0
    mocks.runBenchmark.mockImplementation(({ onProgress }: { onProgress: (value: OrderBenchmarkProgress) => void }) => {
      callCount += 1
      if (callCount === 1) {
        firstProgress = onProgress
        onProgress({ run: 2, totalRuns: 5, totalOrders: 520, action: 'meat' })
        return new Promise<OrderBenchmarkResult>((resolve) => { finish = resolve })
      }

      onProgress({ run: 1, totalRuns: 5, totalOrders: 130, action: 'staple' })
      return new Promise<OrderBenchmarkResult>(() => {})
    })
    render(<OrderBenchmark />)
    start()
    expect(screen.getByText('第 2 / 5 轮 · 520 单 · 肉')).not.toBeNull()
    expect(screen.getByRole('button', { name: '测试进行中' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '取消测试' }))
    expect(mocks.runBenchmark.mock.calls[0][0].signal.aborted).toBe(true)
    expect(screen.getByText(/测试已取消/)).not.toBeNull()

    start()
    expect(screen.getByText('第 1 / 5 轮 · 130 单 · 主食')).not.toBeNull()
    act(() => { firstProgress({ run: 5, totalRuns: 5, totalOrders: 1820, action: 'served' }) })
    expect(screen.getByText('第 1 / 5 轮 · 130 单 · 主食')).not.toBeNull()
    expect(screen.queryByText('第 5 / 5 轮 · 1820 单 · 出餐')).toBeNull()

    await act(async () => { finish(makeBenchmarkPreviewResult()) })
    expect(screen.getByText('第 1 / 5 轮 · 130 单 · 主食')).not.toBeNull()
    expect(screen.queryByText('5 轮平均结果')).toBeNull()
  })

  it('aborts a running test when unmounted and ignores subsequent progress', () => {
    mocks.runBenchmark.mockReturnValue(new Promise(() => {}))
    const view = render(<OrderBenchmark />)
    start()
    const { signal } = mocks.runBenchmark.mock.calls[0][0]
    view.unmount()
    expect(signal.aborted).toBe(true)
  })

  it('stops when the application is backgrounded', () => {
    mocks.runBenchmark.mockReturnValue(new Promise(() => {}))
    render(<OrderBenchmark />)
    start()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    fireEvent(document, new Event('visibilitychange'))
    expect(mocks.runBenchmark.mock.calls[0][0].signal.aborted).toBe(true)
    expect(screen.getByText(/测试已取消/)).not.toBeNull()
  })

  it('recovers from errors with a new run', async () => {
    mocks.runBenchmark.mockRejectedValueOnce(new Error('test failure')).mockResolvedValueOnce(makeBenchmarkPreviewResult())
    render(<OrderBenchmark />)
    await act(async () => { start() })
    expect(screen.getByRole('alert').textContent).toContain('UNEXPECTED_FAILURE')
    expect(screen.getByRole('alert').textContent).not.toContain('test failure')
    const diagnostic = screen.getByRole('textbox', { name: '订单基准测试诊断 JSON' }) as HTMLTextAreaElement
    expect(JSON.parse(diagnostic.value)).toMatchObject({
      kind: 'order-benchmark-failure',
      code: 'UNEXPECTED_FAILURE',
    })
    await act(async () => { start() })
    expect(screen.getByText('5 轮平均结果')).not.toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows a safe diagnostic code for known benchmark failures', async () => {
    mocks.runBenchmark.mockRejectedValueOnce(new OrderBenchmarkError('INVALID_FIXTURE'))
    render(<OrderBenchmark />)
    await act(async () => { start() })

    expect(screen.getByRole('alert').textContent).toContain('模拟订单数据校验失败')
    expect(screen.getByRole('alert').textContent).toContain('INVALID_FIXTURE')
    expect(screen.getByRole('alert').textContent).not.toContain('Order benchmark failed')
  })

  it('copies the complete report', async () => {
    const result = makeBenchmarkPreviewResult()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    mocks.runBenchmark.mockResolvedValue(result)
    render(<OrderBenchmark />)
    await act(async () => { start() })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '复制测试结果' })) })
    expect(writeText).toHaveBeenCalledWith(JSON.stringify(result, null, 2))
    expect(screen.getByRole('button', { name: '已复制结果' })).not.toBeNull()
  })

  it('supports HTTP WebViews with a legacy copy path', async () => {
    const copy = vi.fn().mockReturnValue(true)
    Object.defineProperty(document, 'execCommand', { configurable: true, value: copy })
    mocks.runBenchmark.mockResolvedValue(makeBenchmarkPreviewResult())
    render(<OrderBenchmark />)
    await act(async () => { start() })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '复制测试结果' })) })
    expect(copy).toHaveBeenCalledWith('copy')
    expect(screen.getByRole('button', { name: '已复制结果' })).not.toBeNull()
  })

  it('offers selectable report text if automatic copy is unavailable', async () => {
    mocks.runBenchmark.mockResolvedValue(makeBenchmarkPreviewResult())
    render(<OrderBenchmark />)
    await act(async () => { start() })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '复制测试结果' })) })
    expect(screen.getByText(/当前环境无法自动复制/)).not.toBeNull()
    const data = screen.getByRole('textbox', { name: '完整测试结果 JSON' }) as HTMLTextAreaElement
    expect(data.closest('details')?.open).toBe(true)
    fireEvent.focus(data)
    expect(data.selectionStart).toBe(0)
    expect(data.selectionEnd).toBe(data.value.length)
  })
})
