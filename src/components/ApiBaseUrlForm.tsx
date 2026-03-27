import React, { useEffect, useMemo, useState } from 'react'
import { Button } from '@heroui/react'
import { useApiBaseUrl } from '@/hooks/useApiBaseUrl'
import { setStoredApiBaseUrl } from '@/services/apiConfig'

type ApiBaseUrlFormProps = {
  submitLabel?: string
}

const inputClassName =
  'w-full rounded-2xl border border-border/60 bg-background px-4 py-3 text-sm text-foreground outline-none transition-colors duration-200 placeholder:text-muted focus:border-accent/50'

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : '保存 API 地址失败，请稍后重试。'

const ApiBaseUrlForm: React.FC<ApiBaseUrlFormProps> = ({
  submitLabel = '保存',
}) => {
  const currentApiBaseUrl = useApiBaseUrl()
  const [value, setValue] = useState(() => currentApiBaseUrl ?? '')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    setValue(currentApiBaseUrl ?? '')
  }, [currentApiBaseUrl])

  const normalizedDraft = useMemo(() => value.trim().replace(/\/+$/, ''), [value])
  const isDirty = normalizedDraft !== (currentApiBaseUrl ?? '')

  const handleSave = async () => {
    setIsSaving(true)
    setErrorMessage(null)
    setInfoMessage(null)

    try {
      const nextValue = setStoredApiBaseUrl(value)
      setValue(nextValue)
      setInfoMessage('API 地址已保存，应用会立即按新地址重新连接。')
    } catch (error) {
      setErrorMessage(getErrorMessage(error))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className='space-y-4'>
      <label className='block space-y-2'>
        <span className='text-sm font-medium text-foreground'>服务器</span>
        <input
          autoCapitalize='none'
          autoCorrect='off'
          className={inputClassName}
          spellCheck={false}
          type='url'
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setErrorMessage(null)
            setInfoMessage(null)
          }}
        />
      </label>

      {errorMessage ? <p className='text-sm text-danger'>{errorMessage}</p> : null}
      {infoMessage ? <p className='text-sm text-success'>{infoMessage}</p> : null}

      <div className='flex flex-col gap-3 sm:flex-row'>
        <Button.Root
          className='sm:w-auto'
          isDisabled={!normalizedDraft || !isDirty || isSaving}
          variant='secondary'
          onPress={() => {
            void handleSave()
          }}
        >
          {isSaving ? '保存中...' : submitLabel}
        </Button.Root>

        {isDirty ? (
          <Button.Root
            className='sm:w-auto'
            variant='outline'
            onPress={() => {
              setValue(currentApiBaseUrl ?? '')
              setErrorMessage(null)
              setInfoMessage(null)
            }}
          >
            还原
          </Button.Root>
        ) : null}
      </div>
    </div>
  )
}

export default ApiBaseUrlForm
