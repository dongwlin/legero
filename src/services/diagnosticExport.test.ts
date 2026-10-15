/* @vitest-environment jsdom */

import { Blob as NodeBlob } from 'node:buffer'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DiagnosticExportError, exportDiagnosticJson } from '@/services/diagnosticExport'
import { makeBenchmarkPreviewResult } from '@/views/Settings/Benchmark/previewData'

const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  canShare: vi.fn(),
  share: vi.fn(),
  readdir: vi.fn(),
  mkdir: vi.fn(),
  rmdir: vi.fn(),
  writeFile: vi.fn(),
  readFile: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: mocks.isNativePlatform } }))
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: {
    readdir: mocks.readdir,
    mkdir: mocks.mkdir,
    rmdir: mocks.rmdir,
    writeFile: mocks.writeFile,
    readFile: mocks.readFile,
  },
}))
vi.mock('@capacitor/share', () => ({ Share: { share: mocks.share, canShare: mocks.canShare } }))

const source = JSON.stringify(makeBenchmarkPreviewResult(), null, 2)
const options = { purpose: 'order-benchmark', appVersion: '0.0.23' } as const
const diskFiles = new Map<string, string>()
const diskDirectories = new Map<string, number>()
const browserFiles = new Map<string, NodeBlob>()
const digest = (value: Uint8Array) => createHash('sha256').update(value).digest('hex')
let createObjectURL: ReturnType<typeof vi.fn>
let revokeObjectURL: ReturnType<typeof vi.fn>
let click: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('Blob', NodeBlob)
  mocks.isNativePlatform.mockReturnValue(false)
  mocks.canShare.mockResolvedValue({ value: true })
  mocks.share.mockResolvedValue({ activityType: '' })
  diskFiles.clear()
  diskDirectories.clear()
  browserFiles.clear()
  mocks.mkdir.mockImplementation(async ({ path }: { path: string }) => {
    if (diskDirectories.has(path)) throw { code: 'EEXIST' }
    diskDirectories.set(path, Date.now())
  })
  mocks.readdir.mockImplementation(async () => ({ files: Array.from(diskDirectories, ([name, mtime]) => ({ name, mtime, type: 'directory' })) }))
  mocks.rmdir.mockImplementation(async ({ path }: { path: string }) => {
    diskDirectories.delete(path)
    for (const name of diskFiles.keys()) {
      if (name.startsWith(`${path}/`)) diskFiles.delete(name)
    }
  })
  mocks.writeFile.mockImplementation(async ({ path, data }: { path: string; data: string }) => {
    diskFiles.set(path, data)
    return { uri: `file:///cache/${path}` }
  })
  mocks.readFile.mockImplementation(async ({ path }: { path: string }) => ({ data: diskFiles.get(path) }))
  createObjectURL = vi.fn((blob: NodeBlob) => {
    const url = `blob:diagnostic-${browserFiles.size}`
    browserFiles.set(url, blob)
    return url
  })
  revokeObjectURL = vi.fn()
  class ExportURL extends URL {}
  Object.defineProperties(ExportURL, {
    createObjectURL: { value: createObjectURL },
    revokeObjectURL: { value: revokeObjectURL },
  })
  vi.stubGlobal('URL', ExportURL)
  click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

afterEach(() => {
  window.dispatchEvent(new Event('pagehide'))
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('diagnostic JSON file export', () => {
  it.each(['browser', 'native'] as const)('round-trips a large UTF-8 result without truncation using %s', async (platform) => {
    mocks.isNativePlatform.mockReturnValue(platform === 'native')
    const original = {
      ...makeBenchmarkPreviewResult(),
      samples: Array.from({ length: 8_000 }, (_, index) => ({
        elapsedMs: index / 7,
        scenario: '合成性能样本，不含业务数据',
        action: 'optimistic commit and controls/list derivation',
      })),
    }
    const serialized = JSON.stringify(original, null, 2)
    const originalBytes = Buffer.from(serialized, 'utf8')
    expect(originalBytes.byteLength).toBeGreaterThan(Buffer.byteLength(source) * 10)
    expect(originalBytes.byteLength).toBeGreaterThan(1_000_000)

    const result = await exportDiagnosticJson(serialized, options)
    const readback = platform === 'native'
      ? Buffer.from(Array.from(diskFiles.values())[0], 'utf8')
      : Buffer.from(await Array.from(browserFiles.values())[0].arrayBuffer())

    expect(result.byteLength).toBe(originalBytes.byteLength)
    expect(readback.byteLength).toBe(originalBytes.byteLength)
    expect(digest(readback)).toBe(digest(originalBytes))
    expect(JSON.parse(readback.toString('utf8'))).toEqual(original)
    expect(result.status).toBe(platform === 'native' ? 'share-opened' : 'download-initiated')
    if (platform === 'native') {
      expect(mocks.writeFile).toHaveBeenCalledWith(expect.objectContaining({ data: serialized, encoding: 'utf8', directory: 'CACHE' }))
      expect(mocks.share).toHaveBeenCalledWith(expect.objectContaining({ files: [expect.stringMatching(/^file:\/\/\/cache\//)] }))
    } else {
      expect(Array.from(browserFiles.values())[0].type).toBe('application/json;charset=utf-8')
    }
  })

  it('uses neutral UTC/version filenames and unique names for repeated browser downloads', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-15T05:06:07.890Z'))
    const first = await exportDiagnosticJson(source, { purpose: 'realtime-diagnostics' })
    const second = await exportDiagnosticJson(source, { purpose: 'performance-recording', appVersion: 'private/path/secret' })
    const third = await exportDiagnosticJson(source, options)
    expect(first.filename).toMatch(/^legero-realtime-diagnostics-20261015T050607890Z-version-unknown-/)
    expect(second.filename).toContain('-version-unknown-')
    expect(second.filename).not.toContain('secret')
    expect(third.filename).toContain('-0.0.23-')
    expect(new Set([first.filename, second.filename, third.filename]).size).toBe(3)
    expect(click).toHaveBeenCalledTimes(3)
    expect(document.querySelectorAll('a[download]')).toHaveLength(0)
    expect(revokeObjectURL).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(revokeObjectURL).toHaveBeenCalledTimes(3)
  })

  it('releases browser resources on page leave, abort, click failure and repeated exports', async () => {
    const controller = new AbortController()
    await exportDiagnosticJson(source, { ...options, signal: controller.signal })
    controller.abort()
    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
    for (let index = 0; index < 10; index += 1) await exportDiagnosticJson(source, options)
    expect(revokeObjectURL).toHaveBeenCalledTimes(3)
    window.dispatchEvent(new Event('pagehide'))
    expect(revokeObjectURL).toHaveBeenCalledTimes(11)
    click.mockImplementationOnce(() => { throw new Error('secret filesystem path') })
    await expect(exportDiagnosticJson(source, options)).rejects.toMatchObject({ message: 'WRITE_FAILED', code: 'WRITE_FAILED' })
    expect(document.querySelectorAll('a[download]')).toHaveLength(0)
    expect(revokeObjectURL).toHaveBeenCalledTimes(12)
  })

  it('rejects a pre-cancelled operation without creating a file or download', async () => {
    const controller = new AbortController()
    controller.abort()
    for (const native of [true, false]) {
      mocks.isNativePlatform.mockReturnValue(native)
      await expect(exportDiagnosticJson(source, { ...options, signal: controller.signal })).rejects.toMatchObject({ code: 'CANCELLED' })
    }
    expect(mocks.writeFile).not.toHaveBeenCalled()
    expect(createObjectURL).not.toHaveBeenCalled()
  })

  it('retries a native directory collision and keeps duplicate saves as separate intact files', async () => {
    mocks.isNativePlatform.mockReturnValue(true)
    mocks.mkdir.mockRejectedValueOnce({ code: 'EEXIST' })
    const first = await exportDiagnosticJson(source, options)
    const second = await exportDiagnosticJson(source, options)
    expect(first.filename).not.toBe(second.filename)
    expect(mocks.mkdir).toHaveBeenCalledTimes(3)
    expect(Array.from(diskFiles.values())).toEqual([source, source])
  })

  it('never overwrites after exhausting native collision retries', async () => {
    mocks.isNativePlatform.mockReturnValue(true)
    mocks.mkdir.mockRejectedValue({ code: 'EEXIST' })
    await expect(exportDiagnosticJson(source, options)).rejects.toMatchObject({ code: 'WRITE_FAILED' })
    expect(mocks.mkdir).toHaveBeenCalledTimes(4)
    expect(mocks.writeFile).not.toHaveBeenCalled()
  })

  it.each([
    ['EACCES', 'PERMISSION_DENIED'],
    ['ENOSPC', 'STORAGE_UNAVAILABLE'],
    ['UNIMPLEMENTED', 'UNAVAILABLE'],
    ['unknown', 'WRITE_FAILED'],
  ])('returns a safe %s error and allows retry with the same JSON', async (code, expected) => {
    mocks.isNativePlatform.mockReturnValue(true)
    mocks.writeFile.mockRejectedValueOnce({ code, message: 'private local path and token' })
    await expect(exportDiagnosticJson(source, options)).rejects.toMatchObject({ code: expected, message: expected })
    expect(mocks.share).not.toHaveBeenCalled()
    expect(diskDirectories.size).toBe(0)
    await expect(exportDiagnosticJson(source, options)).resolves.toMatchObject({ status: 'share-opened' })
    expect(Array.from(diskFiles.values())).toEqual([source])
  })

  it('rejects a truncated native readback without sharing and preserves the source for retry', async () => {
    mocks.isNativePlatform.mockReturnValue(true)
    mocks.readFile.mockResolvedValueOnce({ data: source.slice(0, -1) })
    await expect(exportDiagnosticJson(source, options)).rejects.toMatchObject({ code: 'READBACK_MISMATCH' })
    expect(mocks.share).not.toHaveBeenCalled()
    expect(diskFiles.size).toBe(0)
    await expect(exportDiagnosticJson(source, options)).resolves.toMatchObject({ status: 'share-opened' })
    expect(Array.from(diskFiles.values())).toEqual([source])
  })

  it('cleans an in-flight write on route cancellation and allows a fresh save', async () => {
    mocks.isNativePlatform.mockReturnValue(true)
    const controller = new AbortController()
    mocks.writeFile.mockImplementationOnce(async ({ path, data }: { path: string; data: string }) => {
      diskFiles.set(path, data)
      controller.abort()
      return { uri: `file:///cache/${path}` }
    })
    await expect(exportDiagnosticJson(source, { ...options, signal: controller.signal })).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(mocks.share).not.toHaveBeenCalled()
    expect(diskFiles.size).toBe(0)
    await expect(exportDiagnosticJson(source, options)).resolves.toMatchObject({ status: 'share-opened' })
  })

  it('handles chooser cancellation and failure safely without claiming delivery or discarding the source', async () => {
    mocks.isNativePlatform.mockReturnValue(true)
    mocks.share.mockRejectedValueOnce(new Error('Share canceled'))
    await expect(exportDiagnosticJson(source, options)).rejects.toMatchObject({ code: 'CANCELLED' })
    mocks.share.mockRejectedValueOnce(new Error('receiver path/token'))
    await expect(exportDiagnosticJson(source, options)).rejects.toMatchObject({ code: 'SHARE_FAILED', message: 'SHARE_FAILED' })
    await expect(exportDiagnosticJson(source, options)).resolves.toMatchObject({ status: 'share-opened' })
    expect(Array.from(diskFiles.values())).toEqual([source, source, source])
  })

  it('bounds the native cache while preserving unrelated cache directories', async () => {
    mocks.isNativePlatform.mockReturnValue(true)
    diskDirectories.set('unrelated-cache', 0)
    for (let index = 0; index < 10; index += 1) {
      diskDirectories.set(`legero-diagnostic-export-old-${index}`, index)
    }
    await exportDiagnosticJson(source, options)
    expect(diskDirectories.size).toBe(9)
    expect(diskDirectories.has('unrelated-cache')).toBe(true)
    expect(diskDirectories.has('legero-diagnostic-export-old-0')).toBe(false)
    expect(diskDirectories.has('legero-diagnostic-export-old-9')).toBe(true)
  })

  it('does not open competing native choosers and releases the lock after returning', async () => {
    mocks.isNativePlatform.mockReturnValue(true)
    let finishShare: (() => void) | undefined
    mocks.share.mockImplementationOnce(() => new Promise<void>((resolve) => { finishShare = resolve }))
    const pending = exportDiagnosticJson(source, options)
    await vi.waitFor(() => expect(mocks.share).toHaveBeenCalledTimes(1))
    await expect(exportDiagnosticJson(source, options)).rejects.toBeInstanceOf(DiagnosticExportError)
    await expect(exportDiagnosticJson(source, options)).rejects.toMatchObject({ code: 'BUSY' })
    finishShare?.()
    await pending
    await expect(exportDiagnosticJson(source, options)).resolves.toMatchObject({ status: 'share-opened' })
  })

  it('reports unsupported native sharing without writing a private-only file', async () => {
    mocks.isNativePlatform.mockReturnValue(true)
    mocks.canShare.mockResolvedValue({ value: false })
    await expect(exportDiagnosticJson(source, options)).rejects.toMatchObject({ code: 'UNAVAILABLE' })
    expect(mocks.writeFile).not.toHaveBeenCalled()
  })
})
