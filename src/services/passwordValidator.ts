/**
 * 根据当前日期生成弱密码。
 * 格式：MMDD88（月日88）
 */
export const generatePassword = (): string => {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  return `${month}${day}88`
}

export const validatePassword = (input: string): boolean => {
  return input === generatePassword()
}
