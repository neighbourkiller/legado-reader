/**
 * 跨平台剪贴板抽象
 * 遵循 AGENTS.md 规范，统一封装剪贴板写入操作，支持降级方案
 */

export async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  // 降级方案：创建临时文本域执行 copy 指令
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '-9999px'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  try {
    const successful = document.execCommand('copy')
    if (!successful) {
      throw new Error('复制到剪贴板失败')
    }
  } finally {
    document.body.removeChild(textarea)
  }
}
