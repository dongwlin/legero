/**
 * 密码验证工具函数
 * 用于生成和验证基于日期的弱密码
 */

/**
 * 根据当前日期生成正确的密码
 * 格式：MMDD88（月日88）
 * @returns 6位数字密码
 */
export const generatePassword = (): string => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${month}${day}88`;
};

/**
 * 验证输入的密码是否正确
 * @param input 用户输入的密码
 * @returns 密码是否正确
 */
export const validatePassword = (input: string): boolean => {
  return input === generatePassword();
};
