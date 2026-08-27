import type {
  BookSource,
  CompatibilityIssue,
  SourceCompatibilityReport,
} from '@/source/types/BookSource'

const UNSUPPORTED_API_PATTERNS: Array<[RegExp, string, string]> = [
  [/\bPackages\b/, 'UNSUPPORTED_ANDROID_API', '使用了 Packages/任意 Java 类'],
  [/\bjava\.(?:io|nio\.file)\b/, 'UNSUPPORTED_ANDROID_FILESYSTEM', '使用了 Android/Java 文件系统'],
  [/\b(?:startActivity|context\.|activity\.|toast\s*\()/i, 'UNSUPPORTED_ANDROID_UI', '使用了 Android 系统界面能力'],
  [/\b(?:payAction|purchase|buyChapter)\b/i, 'UNSUPPORTED_PAY_ACTION', '使用了付费动作'],
]

function collectStrings(value: unknown, path: string, target: Array<{ path: string; value: string }>) {
  if (typeof value === 'string') {
    if (value.trim()) target.push({ path, value })
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    collectStrings(child, path ? `${path}.${key}` : key, target)
  }
}

export function inspectSourceCompatibility(source: BookSource): SourceCompatibilityReport {
  const issues: CompatibilityIssue[] = []
  if (![0, 2].includes(source.bookSourceType)) {
    issues.push({
      status: 'unsupported',
      code: 'UNSUPPORTED_SOURCE_TYPE',
      path: 'bookSourceType',
      message: `当前仅执行文本(0)与图片(2)书源；类型 ${source.bookSourceType} 可导入但不可运行`,
    })
  }

  const strings: Array<{ path: string; value: string }> = []
  collectStrings(source, '', strings)
  for (const entry of strings) {
    for (const [pattern, code, message] of UNSUPPORTED_API_PATTERNS) {
      if (pattern.test(entry.value)) {
        issues.push({ status: 'unsupported', code, path: entry.path, message })
      }
    }
    if (/<webjs>|@webjs:/i.test(entry.value) && !source.useWebView) {
      issues.push({
        status: 'partial',
        code: 'WEBVIEW_REQUIRED',
        path: entry.path,
        message: '该规则包含 webJs，需要启用 WebView 通道',
      })
    }
  }

  const unique = issues.filter((issue, index) =>
    issues.findIndex(other => other.code === issue.code && other.path === issue.path) === index)
  const status = unique.some(issue => issue.status === 'unsupported')
    ? 'unsupported'
    : unique.length > 0 ? 'partial' : 'supported'

  return {
    status,
    issues: unique,
    checkedAt: Date.now(),
    mode: source.webReaderCompatibilityMode || 'legado',
  }
}
