import { Button } from '@heroui/react'
import { useEffect, useRef, useState } from 'react'
import { copyDiagnosticText } from '@/services/diagnosticClipboard'
import { DiagnosticExportError, exportDiagnosticJson } from '@/services/diagnosticExport'

interface DiagnosticExportProps {
  json: string
  purpose: 'order-benchmark' | 'realtime-diagnostics' | 'performance-recording'
  appVersion?: string | null
  copyLabel?: string
  copiedLabel?: string
  textLabel?: string
  refreshable?: boolean
}

const DiagnosticExport = ({
  json, purpose, appVersion, copyLabel = '复制诊断信息', copiedLabel = '已复制',
  textLabel = '完整诊断数据 JSON', refreshable = false,
}: DiagnosticExportProps) => {
  const [capture, setCapture] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'manual'>('idle')
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [saveFailed, setSaveFailed] = useState(false)
  const active = useRef<AbortController | null>(null)
  const mounted = useRef(false)
  const text = capture ?? json

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      active.current?.abort()
    }
  }, [])

  const handleCopy = async () => {
    setCapture(text)
    const copied = await copyDiagnosticText(text)
    if (mounted.current) setCopyState(copied ? 'copied' : 'manual')
  }

  const handleSave = async () => {
    if (active.current) return
    setCapture(text)
    const controller = new AbortController()
    active.current = controller
    setSaving(true)
    setSaveFailed(false)
    setSaveMessage('正在准备结果文件…')
    try {
      const saved = await exportDiagnosticJson(text, { purpose, appVersion, signal: controller.signal })
      if (!mounted.current) return
      setSaveMessage(saved.status === 'download-initiated'
        ? `已发起下载：${saved.filename}（${saved.byteLength} 字节）。请在浏览器下载记录中确认文件。`
        : `文件已写入并回读校验，已调用系统分享：${saved.filename}（${saved.byteLength} 字节）。请在目标应用确认保存；本应用无法确认外部接收结果。`)
    } catch (error) {
      if (!mounted.current) return
      const code = error instanceof DiagnosticExportError ? error.code : 'WRITE_FAILED'
      const messages: Record<string, string> = {
        CANCELLED: '保存已取消。结果已保留，可重试。',
        BUSY: '另一个文件正在保存，请稍后重试。',
        UNAVAILABLE: '当前环境无法保存文件，可复制或手动取得下方 JSON。',
        PERMISSION_DENIED: '文件权限不可用。结果已保留，调整权限后可重试。',
        STORAGE_UNAVAILABLE: '存储不可用或空间不足。结果已保留，可重试。',
        WRITE_FAILED: '文件写入失败。结果已保留，可重试。',
        READBACK_MISMATCH: '文件回读校验失败，未交给系统分享。结果已保留，可重试。',
        SHARE_FAILED: '未能交给系统分享。结果已保留，可重试。',
      }
      setSaveFailed(code !== 'CANCELLED')
      setSaveMessage(messages[code] ?? messages.WRITE_FAILED)
    } finally {
      active.current = null
      if (mounted.current) setSaving(false)
    }
  }

  return (
    <section className='space-y-3' aria-label='导出结果文件'>
      <div className='flex flex-col flex-wrap gap-3 sm:flex-row'>
        <Button.Root className='min-h-11 w-full sm:w-auto' isDisabled={saving} onPress={() => { void handleSave() }}>
          {saving ? '正在保存…' : saveFailed ? '重试保存结果文件' : '保存结果文件'}
        </Button.Root>
        <Button.Root className='min-h-11 w-full sm:w-auto' variant='outline' onPress={() => { void handleCopy() }}>
          {copyState === 'copied' ? copiedLabel : copyLabel}
        </Button.Root>
        {refreshable && capture !== null ? (
          <Button.Root className='min-h-11 w-full sm:w-auto' variant='outline' isDisabled={saving} onPress={() => {
            setCapture(null)
            setCopyState('idle')
            setSaveMessage('')
            setSaveFailed(false)
          }}>获取最新导出快照</Button.Root>
        ) : null}
      </div>
      <p aria-live='polite' className={`text-sm leading-6 ${saveFailed ? 'text-danger' : 'text-foreground/75'}`}>
        {saveMessage || '建议保存 JSON 文件以取得完整数据；复制长文本可能受设备限制。文件只在本地处理，不会自动上传。'}
      </p>
      <p aria-live='polite' className='text-sm leading-6 text-foreground/75'>
        {copyState === 'copied' ? '已复制当前完整 JSON，可粘贴用于排查。'
          : copyState === 'manual' ? '当前环境无法自动复制。请长按下方文本，选择全部后复制。'
            : refreshable && capture !== null ? '导出快照已固定，重试和复制使用同一份数据；页面实时指标继续更新。' : null}
      </p>
      <details open={copyState === 'manual'} className='rounded-2xl border border-border/70 bg-background-secondary/35 px-4'>
        <summary className='min-h-11 cursor-pointer py-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'>完整数据（JSON）</summary>
        <textarea aria-label={textLabel} readOnly value={text} rows={12}
          onFocus={(event) => event.currentTarget.select()}
          className='mb-4 block w-full resize-y rounded-lg border border-border bg-background p-3 font-mono text-xs leading-5 text-foreground selection:bg-accent/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent' />
      </details>
    </section>
  )
}

export default DiagnosticExport
