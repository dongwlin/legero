import React, { useEffect, useRef, useState } from 'react'
import { Button, toast } from '@heroui/react'
import { CarbonTrashCan } from '@/components/Icon'
import { apiBaseUrlInputClassName } from '@/components/apiBaseUrlFieldStyles'
import { useApiBaseUrl } from '@/hooks/useApiBaseUrl'
import { useSavedServers } from '@/hooks/useSavedServers'
import {
  clearStoredApiBaseUrl,
  setStoredApiBaseUrl,
} from '@/services/apiConfig'
import { clearStoredAuthTokens } from '@/services/apiClient'
import {
  findSavedServer,
  removeSavedServer,
  type SavedServerRecord,
  upsertSavedServer,
} from '@/services/savedServers'
import { probeServerHealth } from '@/services/serverHealth'
import { useAuthStore } from '@/store/auth'
import { useOrderStore } from '@/store/order'

type ApiBaseUrlFormProps = {
  onHealthStatusChange?: (status: ServerHealthStatus) => void
  onResolvedServerChange?: (change: ResolvedServerChange) => void
}

export type ServerHealthStatus =
  | 'idle'
  | 'checking'
  | 'reachable'
  | 'unreachable'

export type ResolvedServerChange =
  | {
      reason: 'probed' | 'selected'
      replacedCurrentServer: boolean
      server: SavedServerRecord | null
    }
  | {
      reason: 'cleared'
      replacedCurrentServer: boolean
      server: null
    }

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '服务器地址校验失败，请稍后重试。'

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AbortError'

const ApiBaseUrlForm: React.FC<ApiBaseUrlFormProps> = ({
  onHealthStatusChange,
  onResolvedServerChange,
}) => {
  const currentApiBaseUrl = useApiBaseUrl()
  const savedServers = useSavedServers()
  const setAnonymous = useAuthStore((state) => state.setAnonymous)
  const resetSyncState = useOrderStore((state) => state.resetSyncState)
  const [value, setValue] = useState(() => currentApiBaseUrl ?? '')
  const [healthStatus, setHealthStatus] = useState<ServerHealthStatus>(() =>
    currentApiBaseUrl ? 'reachable' : 'idle',
  )
  const [isSavedServerListOpen, setIsSavedServerListOpen] = useState(false)
  const probeAbortControllerRef = useRef<AbortController | null>(null)
  const probeRequestIdRef = useRef(0)

  useEffect(() => {
    setValue(currentApiBaseUrl ?? '')
    setHealthStatus(currentApiBaseUrl ? 'reachable' : 'idle')
  }, [currentApiBaseUrl])

  useEffect(() => {
    onHealthStatusChange?.(healthStatus)
  }, [healthStatus, onHealthStatusChange])

  useEffect(
    () => () => {
      probeAbortControllerRef.current?.abort()
    },
    [],
  )

  const resetSession = () => {
    clearStoredAuthTokens()
    setAnonymous()
    resetSyncState()
  }

  const handleProbeServer = async () => {
    const trimmedValue = value.trim()

    if (trimmedValue === '') {
      setHealthStatus('idle')
      return
    }

    const requestId = probeRequestIdRef.current + 1
    probeRequestIdRef.current = requestId
    probeAbortControllerRef.current?.abort()

    const controller = new AbortController()
    probeAbortControllerRef.current = controller

    setHealthStatus('checking')

    try {
      const normalizedBaseUrl = await probeServerHealth(
        value,
        controller.signal,
      )

      if (probeRequestIdRef.current !== requestId) {
        return
      }

      const matchedServer = findSavedServer(normalizedBaseUrl)
      const replacedCurrentServer =
        currentApiBaseUrl !== null && currentApiBaseUrl !== normalizedBaseUrl

      setStoredApiBaseUrl(normalizedBaseUrl)
      upsertSavedServer({ baseUrl: normalizedBaseUrl })
      setValue(normalizedBaseUrl)
      setHealthStatus('reachable')

      if (replacedCurrentServer) {
        resetSession()
      }

      onResolvedServerChange?.({
        reason: 'probed',
        replacedCurrentServer,
        server: matchedServer,
      })
    } catch (error) {
      if (isAbortError(error) || probeRequestIdRef.current !== requestId) {
        return
      }

      setHealthStatus('unreachable')
      toast.danger(getErrorMessage(error))
    } finally {
      if (probeAbortControllerRef.current === controller) {
        probeAbortControllerRef.current = null
      }
    }
  }

  const handleSelectServer = (server: SavedServerRecord) => {
    probeAbortControllerRef.current?.abort()

    const replacedCurrentServer =
      currentApiBaseUrl !== null && currentApiBaseUrl !== server.baseUrl

    setStoredApiBaseUrl(server.baseUrl)
    setValue(server.baseUrl)
    setHealthStatus('reachable')
    setIsSavedServerListOpen(false)

    if (replacedCurrentServer) {
      resetSession()
    }

    onResolvedServerChange?.({
      reason: 'selected',
      replacedCurrentServer,
      server,
    })
  }

  const handleDeleteServer = (server: SavedServerRecord) => {
    probeAbortControllerRef.current?.abort()
    removeSavedServer(server.baseUrl)

    const deletedCurrentServer = currentApiBaseUrl === server.baseUrl

    if (!deletedCurrentServer) {
      return
    }

    clearStoredApiBaseUrl()
    setValue('')
    setHealthStatus('idle')
    resetSession()
    onResolvedServerChange?.({
      reason: 'cleared',
      replacedCurrentServer: true,
      server: null,
    })
  }

  const renderStatusIndicator = () => {
    if (healthStatus === 'checking') {
      return <span className='text-xs text-muted'>检查中...</span>
    }

    if (healthStatus === 'reachable') {
      return (
        <span
          className='text-sm font-semibold text-success'
          aria-label='服务器可连接'
        >
          ✓
        </span>
      )
    }

    if (healthStatus === 'unreachable') {
      return (
        <span
          className='text-sm font-semibold text-danger'
          aria-label='服务器不可连接'
        >
          ✕
        </span>
      )
    }

    return null
  }

  return (
    <div className='space-y-4'>
      <label className='block space-y-2'>
        <div className='flex items-center justify-between gap-3'>
          <span className='text-sm font-medium text-foreground'>服务器</span>
          {renderStatusIndicator()}
        </div>
        <input
          autoCapitalize='none'
          autoCorrect='off'
          className={apiBaseUrlInputClassName}
          placeholder='https://example.com'
          spellCheck={false}
          type='url'
          value={value}
          onChange={(event) => {
            const nextValue = event.target.value
            const normalizedDraft = nextValue.trim().replace(/\/+$/, '')

            setValue(nextValue)

            if (
              normalizedDraft !== '' &&
              normalizedDraft === (currentApiBaseUrl ?? '')
            ) {
              setHealthStatus('reachable')
              return
            }

            setHealthStatus('idle')
          }}
          onBlur={() => {
            void handleProbeServer()
          }}
        />
      </label>

      <Button.Root
        className='sm:w-auto'
        variant='outline'
        onPress={() => {
          setIsSavedServerListOpen((current) => !current)
        }}
      >
        {isSavedServerListOpen ? '收起服务器列表' : '选择服务器'}
      </Button.Root>

      {isSavedServerListOpen ? (
        <div className='space-y-2 rounded-2xl border border-border/60 bg-background px-3 py-3'>
          {savedServers.length === 0 ? (
            <p className='px-1 py-2 text-sm text-muted'>暂无已保存服务器。</p>
          ) : (
            savedServers.map((server) => {
              const isCurrentServer = server.baseUrl === currentApiBaseUrl

              return (
                <div key={server.baseUrl} className='flex items-center gap-2'>
                  <button
                    type='button'
                    className={`flex-1 rounded-2xl border px-4 py-3 text-left transition-colors ${
                      isCurrentServer
                        ? 'border-accent/60 bg-accent/10'
                        : 'border-border/60 hover:border-accent/40 hover:bg-background/80'
                    }`}
                    onClick={() => {
                      handleSelectServer(server)
                    }}
                  >
                    <div className='text-sm font-medium text-foreground'>
                      {server.baseUrl}
                    </div>
                    <div className='mt-1 text-xs text-muted'>
                      {server.phone ? `手机号 ${server.phone}` : '未关联手机号'}
                    </div>
                  </button>

                  <button
                    type='button'
                    aria-label={`删除 ${server.baseUrl}`}
                    className='rounded-2xl border border-border/60 p-3 text-muted transition-colors hover:border-danger/40 hover:text-danger'
                    onClick={() => {
                      handleDeleteServer(server)
                    }}
                  >
                    <CarbonTrashCan className='h-4 w-4' />
                  </button>
                </div>
              )
            })
          )}
        </div>
      ) : null}
    </div>
  )
}

export default ApiBaseUrlForm
