/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ save: vi.fn() }))
vi.mock('@heroui/react', () => ({ Button: { Root: ({ children, onPress, isDisabled }: {
  children: ReactNode; onPress: () => void; isDisabled?: boolean
}) => <button onClick={onPress} disabled={isDisabled}>{children}</button> } }))
vi.mock('@/services/diagnosticExport', async (original) => ({
  ...await original<typeof import('@/services/diagnosticExport')>(), exportDiagnosticJson: mocks.save,
}))
import DiagnosticExport from '@/components/DiagnosticExport'
import { DiagnosticExportError } from '@/services/diagnosticExport'

describe('DiagnosticExport', () => {
  beforeEach(() => {
    mocks.save.mockReset().mockResolvedValue({ status: 'download-initiated', filename: 'result.json', byteLength: 9 })
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } })
  })
  afterEach(cleanup)

  it('copies, displays and saves exactly the same captured JSON, preserving it for retry', async () => {
    const json = '{"五轮":[1,2,3,4,5]}'
    mocks.save.mockRejectedValueOnce(new DiagnosticExportError('STORAGE_UNAVAILABLE'))
    const view = render(<DiagnosticExport json={json} purpose='order-benchmark' refreshable />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '保存结果文件' })) })
    expect(screen.getByText(/存储不可用或空间不足/)).not.toBeNull()
    view.rerender(<DiagnosticExport json='{"new":true}' purpose='order-benchmark' refreshable />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '复制诊断信息' })) })
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(json)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '重试保存结果文件' })) })
    expect(mocks.save.mock.calls.map(([value]) => value)).toEqual([json, json])
    expect(screen.getByText(/已发起下载/)).not.toBeNull()
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(json)
    fireEvent.click(screen.getByRole('button', { name: '获取最新导出快照' }))
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('{"new":true}')
  })

  it('describes native handoff without claiming external save or recipient success', async () => {
    mocks.save.mockResolvedValue({ status: 'share-opened', filename: 'native.json', byteLength: 20 })
    render(<DiagnosticExport json='{}' purpose='realtime-diagnostics' />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '保存结果文件' })) })
    expect(screen.getByText(/无法确认外部接收结果/)).not.toBeNull()
    expect(screen.getByText(/回读校验/)).not.toBeNull()
  })

  it('retains results after cancellation and does not expose raw errors', async () => {
    mocks.save.mockRejectedValueOnce(new DiagnosticExportError('CANCELLED')).mockRejectedValueOnce(new Error('private path / credentials'))
    render(<DiagnosticExport json='{}' purpose='order-benchmark' />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '保存结果文件' })) })
    expect(screen.getByText(/保存已取消/)).not.toBeNull()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '保存结果文件' })) })
    expect(screen.getByText(/文件写入失败/)).not.toBeNull()
    expect(screen.queryByText(/private path/)).toBeNull()
  })

  it('prevents duplicate saves and aborts only on page departure, not backgrounding for system UI', () => {
    mocks.save.mockReturnValue(new Promise(() => {}))
    const view = render(<DiagnosticExport json='{}' purpose='order-benchmark' />)
    fireEvent.click(screen.getByRole('button', { name: '保存结果文件' }))
    fireEvent.click(screen.getByRole('button', { name: '正在保存…' }))
    expect(mocks.save).toHaveBeenCalledTimes(1)
    const signal = mocks.save.mock.calls[0][1].signal as AbortSignal
    fireEvent(document, new Event('visibilitychange'))
    expect(signal.aborted).toBe(false)
    view.unmount()
    expect(signal.aborted).toBe(true)
  })
})
