export const copyDiagnosticText = async (text: string): Promise<boolean> => {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // HTTP WebViews may require the legacy clipboard path.
  }
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false
  const input = document.createElement('textarea')
  input.value = text
  input.setAttribute('readonly', '')
  input.style.position = 'fixed'
  input.style.opacity = '0'
  document.body.appendChild(input)
  try {
    input.focus()
    input.select()
    input.setSelectionRange(0, input.value.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    input.remove()
  }
}
