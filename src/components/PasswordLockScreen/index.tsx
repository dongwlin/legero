import React, { useState, useEffect } from 'react'
import { validatePassword } from '@/services/passwordValidator'
import { Button, Card } from '@heroui/react'

interface PasswordLockScreenProps {
  onUnlock: () => void
  onCancel?: () => void
}

const PasswordLockScreen: React.FC<PasswordLockScreenProps> = ({
  onUnlock,
  onCancel,
}) => {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleNumberClick = (num: string) => {
    setPassword((current) => {
      if (current.length >= 6 || success) {
        return current
      }

      return current + num
    })
    setError(false)
  }

  const handleDelete = () => {
    if (!success) {
      setPassword((current) => current.slice(0, -1))
      setError(false)
    }
  }

  const handleConfirm = () => {
    if (password.length !== 6) {
      setError(true)
      return
    }

    if (validatePassword(password)) {
      setSuccess(true)
      // 延迟执行解锁，让用户看到成功反馈
      setTimeout(() => {
        onUnlock()
      }, 300)
    } else {
      setError(true)
      setShake(true)
      setPassword('')
      setTimeout(() => setShake(false), 500)
    }
  }

  // 防止键盘输入
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const numbers = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '']

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-md'
      role='dialog'
      aria-modal='true'
      aria-labelledby='password-lock-title'
    >
      <Card.Root
        variant='default'
        className={`w-full max-w-sm border border-border/70 bg-overlay p-0 shadow-overlay transition-all duration-300 ${shake
            ? 'animate-shake'
            : success
              ? 'scale-105 opacity-0'
              : 'scale-100'
          }`}
      >
        <Card.Content className='px-6 py-6'>
          <Card.Title
            id='password-lock-title'
            className='mb-2 text-center text-2xl font-semibold'
          >
            {success ? '验证成功' : '请输入密码'}
          </Card.Title>
          <Card.Description className='mb-6 text-center leading-6'>
            输入 6 位密码以继续访问受保护内容。
          </Card.Description>

          <div className='mb-8 flex justify-center gap-4'>
            {[...Array(6)].map((_, index) => (
              <div
                key={index}
                className={`size-5 rounded-full border-2 transition-all duration-300 ${index < password.length
                    ? success
                      ? 'scale-110 border-success bg-success'
                      : 'scale-110 border-accent bg-accent'
                    : 'border-border-secondary'
                  }`}
                aria-label={`密码位 ${index + 1}`}
              />
            ))}
          </div>

          {error && !success && (
            <div
              className='mb-4 text-center font-medium text-danger motion-safe:animate-pulse'
              role='alert'
              aria-live='polite'
            >
              {password.length !== 6 ? '请输入6位密码' : '密码错误，请重试'}
            </div>
          )}

          {success && (
            <div
              className='mb-4 text-center font-medium text-success'
              role='status'
              aria-live='polite'
            >
              解锁成功
            </div>
          )}

          <div
            className='mb-4 grid grid-cols-3 gap-3'
            role='group'
            aria-label='数字键盘'
          >
            {numbers.map((num, index) => {
              if (num === '') {
                return <div key={index} className='aspect-square' />
              }
              return (
                <Button.Root
                  key={num}
                  className='mx-auto size-14 rounded-full p-0 text-2xl font-semibold'
                  aria-label={`数字 ${num}`}
                  isDisabled={success}
                  variant='ghost'
                  onPress={() => handleNumberClick(num)}
                >
                  {num}
                </Button.Root>
              )
            })}
          </div>

          <div className='flex gap-3'>
            {password.length === 0 && onCancel && (
              <Button.Root
                className='flex-1'
                isDisabled={success}
                variant='outline'
                onPress={onCancel}
              >
                取消
              </Button.Root>
            )}
            {password.length > 0 && (
              <Button.Root
                className='flex-1'
                isDisabled={success}
                variant='ghost'
                onPress={handleDelete}
              >
                删除
              </Button.Root>
            )}
            <Button.Root
              className='flex-1'
              isDisabled={password.length === 0 || success}
              variant='primary'
              onPress={handleConfirm}
            >
              确认
            </Button.Root>
          </div>
        </Card.Content>
      </Card.Root>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
          20%, 40%, 60%, 80% { transform: translateX(5px); }
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
      `}</style>
    </div>
  )
}

export default PasswordLockScreen
