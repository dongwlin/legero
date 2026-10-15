import { afterEach, describe, expect, it, vi } from 'vitest'
import { generatePassword, validatePassword } from '@/services/passwordValidator'

describe('password validator', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('generates the month-day password with zero padding', () => {
    const localDate = new Date(2026, 3, 9, 12, 0, 0)
    vi.useFakeTimers()
    vi.setSystemTime(localDate)

    expect(generatePassword()).toBe('040988')
  })

  it('accepts only the generated password for the current day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 23, 8, 0, 0))

    expect(validatePassword('112388')).toBe(true)
    expect(validatePassword('112288')).toBe(false)
    expect(validatePassword('1123')).toBe(false)
  })
})
