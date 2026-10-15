import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

export type DiagnosticExportPurpose =
  | 'order-benchmark'
  | 'realtime-diagnostics'
  | 'performance-recording'

export type DiagnosticExportErrorCode =
  | 'CANCELLED'
  | 'BUSY'
  | 'UNAVAILABLE'
  | 'PERMISSION_DENIED'
  | 'STORAGE_UNAVAILABLE'
  | 'WRITE_FAILED'
  | 'READBACK_MISMATCH'
  | 'SHARE_FAILED'

export class DiagnosticExportError extends Error {
  constructor(public readonly code: DiagnosticExportErrorCode) {
    super(code)
    this.name = 'DiagnosticExportError'
  }
}

export type DiagnosticExportOptions = {
  purpose: DiagnosticExportPurpose
  appVersion?: string | null
  signal?: AbortSignal
}

export type DiagnosticExportResult = {
  /** Neither status confirms that the user or a recipient saved the file. */
  status: 'download-initiated' | 'share-opened'
  filename: string
  byteLength: number
}

const CACHE_PREFIX = 'legero-diagnostic-export-'
const MAX_CACHED_EXPORTS = 8
const DOWNLOAD_URL_LIFETIME_MS = 60_000
const pendingDownloads = new Set<() => void>()
let nativeExportPending = false
let filenameSequence = 0

const checkCancelled = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DiagnosticExportError('CANCELLED')
}

const nativeErrorCode = (error: unknown): string => {
  if (typeof error !== 'object' || error === null || !('code' in error)) return ''
  return typeof error.code === 'string' ? error.code : ''
}

const safeExportError = (
  error: unknown,
  fallback: DiagnosticExportErrorCode,
): DiagnosticExportError => {
  if (error instanceof DiagnosticExportError) return error
  const code = nativeErrorCode(error)
  const message = error instanceof Error ? error.message : (
    typeof error === 'object' && error !== null && 'message' in error &&
    typeof error.message === 'string' ? error.message : ''
  )
  if (code === 'AbortError' || code === 'CANCELLED' ||
    (error instanceof Error && error.name === 'AbortError') ||
    /^Share cancel(?:led|ed)\.?$/i.test(message)) {
    return new DiagnosticExportError('CANCELLED')
  }
  if (code === 'EACCES' || code === 'EPERM' || code === 'OS-PLUG-FILE-0007') {
    return new DiagnosticExportError('PERMISSION_DENIED')
  }
  if (code === 'ENOSPC' || code === 'EDQUOT' || code === 'EROFS') {
    return new DiagnosticExportError('STORAGE_UNAVAILABLE')
  }
  if (code === 'UNIMPLEMENTED' || code === 'UNAVAILABLE') {
    return new DiagnosticExportError('UNAVAILABLE')
  }
  // Never surface bridge error messages: they can contain local paths or data.
  return new DiagnosticExportError(fallback)
}

const createFilename = (options: DiagnosticExportOptions): string => {
  const utc = new Date().toISOString().replace(/[-:]/g, '').replace('.', '')
  const version = options.appVersion && /^[\da-zA-Z][\da-zA-Z.+-]{0,47}$/.test(options.appVersion)
    ? options.appVersion : 'version-unknown'
  filenameSequence += 1
  const nonce = globalThis.crypto?.randomUUID?.() ??
    `${Math.random().toString(36).slice(2)}-${filenameSequence}`
  return `legero-${options.purpose}-${utc}-${version}-${nonce}-${filenameSequence}.json`
}

const downloadInBrowser = (
  serializedJson: string,
  options: DiagnosticExportOptions,
  filename: string,
  byteLength: number,
): DiagnosticExportResult => {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new DiagnosticExportError('UNAVAILABLE')
  }
  checkCancelled(options.signal)
  // Keep at most eight outstanding URLs even if the page never gets hidden.
  if (pendingDownloads.size >= MAX_CACHED_EXPORTS) pendingDownloads.values().next().value?.()
  const blob = new Blob([serializedJson], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  let timeout: ReturnType<typeof setTimeout> | undefined
  const cleanup = () => {
    if (!pendingDownloads.delete(cleanup)) return
    if (timeout !== undefined) clearTimeout(timeout)
    URL.revokeObjectURL(url)
    window.removeEventListener('pagehide', cleanup)
    options.signal?.removeEventListener('abort', cleanup)
  }
  pendingDownloads.add(cleanup)
  window.addEventListener('pagehide', cleanup, { once: true })
  options.signal?.addEventListener('abort', cleanup, { once: true })
  try {
    anchor.href = url
    anchor.download = filename
    anchor.hidden = true
    document.body.append(anchor)
    checkCancelled(options.signal)
    anchor.click()
    timeout = setTimeout(cleanup, DOWNLOAD_URL_LIFETIME_MS)
    return { status: 'download-initiated', filename, byteLength }
  } catch (error) {
    cleanup()
    throw safeExportError(error, 'WRITE_FAILED')
  } finally {
    anchor.remove()
  }
}

const pruneNativeCache = async () => {
  const { files } = await Filesystem.readdir({ directory: Directory.Cache, path: '' })
  const exports = files.filter((file) => file.type === 'directory' &&
    /^legero-diagnostic-export-[\da-zA-Z-]+$/.test(file.name))
    .sort((left, right) => right.mtime - left.mtime)
  // Do not delete a just-shared file: recipients may read after chooser completion.
  // Retain seven prior files; the next file makes the bounded eighth cache entry.
  for (const file of exports.slice(MAX_CACHED_EXPORTS - 1)) {
    await Filesystem.rmdir({ directory: Directory.Cache, path: file.name, recursive: true })
  }
}

const shareNativeFile = async (
  serializedJson: string,
  options: DiagnosticExportOptions,
  byteLength: number,
): Promise<DiagnosticExportResult> => {
  if (nativeExportPending) throw new DiagnosticExportError('BUSY')
  nativeExportPending = true
  let directory: string | undefined
  let handedToSystem = false
  try {
    checkCancelled(options.signal)
    const canShare = await Share.canShare()
    checkCancelled(options.signal)
    if (!canShare.value) throw new DiagnosticExportError('UNAVAILABLE')
    await pruneNativeCache()
    checkCancelled(options.signal)
    let filename = ''
    // Claim a new directory without recursive creation so an existing file is
    // never overwritten, even if a random identifier collides across launches.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      filename = createFilename(options)
      const candidate = `${CACHE_PREFIX}${filename.slice(0, -5).replace(/[^\da-zA-Z-]/g, '-')}`
      try {
        await Filesystem.mkdir({ directory: Directory.Cache, path: candidate, recursive: false })
        directory = candidate
        break
      } catch (error) {
        if (!['EEXIST', 'OS-PLUG-FILE-0010'].includes(nativeErrorCode(error))) throw error
      }
    }
    if (!directory) throw new DiagnosticExportError('WRITE_FAILED')
    checkCancelled(options.signal)
    const path = `${directory}/${filename}`
    const { uri } = await Filesystem.writeFile({
      directory: Directory.Cache,
      path,
      data: serializedJson,
      encoding: Encoding.UTF8,
    })
    checkCancelled(options.signal)
    const readback = await Filesystem.readFile({ directory: Directory.Cache, path, encoding: Encoding.UTF8 })
    checkCancelled(options.signal)
    if (readback.data !== serializedJson) throw new DiagnosticExportError('READBACK_MISMATCH')
    handedToSystem = true
    try {
      await Share.share({ files: [uri], title: filename, dialogTitle: '保存或分享结果文件' })
    } catch (error) {
      throw safeExportError(error, 'SHARE_FAILED')
    }
    checkCancelled(options.signal)
    return { status: 'share-opened', filename, byteLength }
  } catch (error) {
    throw safeExportError(error, 'WRITE_FAILED')
  } finally {
    if (directory && !handedToSystem) {
      await Filesystem.rmdir({ directory: Directory.Cache, path: directory, recursive: true }).catch(() => {})
    }
    nativeExportPending = false
  }
}

/** Accept the exact JSON used by copying; never recompute or reserialize values. */
export const exportDiagnosticJson = async (
  serializedJson: string,
  options: DiagnosticExportOptions,
): Promise<DiagnosticExportResult> => {
  try {
    checkCancelled(options.signal)
    const byteLength = new TextEncoder().encode(serializedJson).byteLength
    if (Capacitor.isNativePlatform()) return await shareNativeFile(serializedJson, options, byteLength)
    return downloadInBrowser(serializedJson, options, createFilename(options), byteLength)
  } catch (error) {
    throw safeExportError(error, 'WRITE_FAILED')
  }
}
