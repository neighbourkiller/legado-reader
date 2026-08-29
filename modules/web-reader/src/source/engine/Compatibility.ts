import type {
  BookSource,
  CompatibilityIssue,
  SourceCompatibilityReport,
} from '@/source/types/BookSource'
import { SOURCE_ENGINE_VERSION } from '@/source/audit/SourceAuditTypes'

const UNSUPPORTED_API_PATTERNS: Array<[RegExp, string, string]> = [
  [/\bPackages\b/, 'UNSUPPORTED_ANDROID_API', '使用了 Packages/任意 Java 类'],
  [/\bjava\.(?:lang|util|security|io|net)\b/, 'UNSUPPORTED_JAVA_PACKAGE', '使用了 Java 包或类访问'],
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
  const capabilities = new Set<string>()
  const sourceType = source.bookSourceType
  if (typeof sourceType !== 'number' || !Number.isInteger(sourceType)) {
    issues.push({
      status: 'unsupported', code: 'INVALID_SOURCE_TYPE', path: 'bookSourceType',
      message: `bookSourceType 必须是数字，当前为 ${JSON.stringify(source.bookSourceType)}`,
    })
  } else if (![0, 2].includes(sourceType)) {
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
    if (/@?xpath:|(?:^|\s)\/\//i.test(entry.value)) capabilities.add('xpath')
    if (/@?json:|\$[.[]/i.test(entry.value)) capabilities.add('jsonpath')
    if (/@?regex:|##/.test(entry.value)) capabilities.add('regex')
    if (/@js:|<js>|\{\{/.test(entry.value)) capabilities.add('javascript')
    if (/\bjava\.get(?:String|StringList)\s*\(/.test(entry.value)) capabilities.add('rule-parser-host')
    if (/\bjava\.getElements?\s*\(/.test(entry.value)) {
      capabilities.add('rule-element-host')
      issues.push({
        status: 'partial',
        code: 'PARTIAL_RULE_ELEMENT_API',
        path: entry.path,
        message: 'java.getElement/getElements 尚未完整模拟 Android 元素对象及其链式方法',
      })
    }
    if (/@put:|@get:\{/.test(entry.value)) capabilities.add('variables')
    if (/<webjs>|@webjs:/i.test(entry.value)) capabilities.add('webview-script')
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
  if (source.mainJs?.trim()) capabilities.add('main-js')
  if (source.loginUrl?.trim()) capabilities.add('manual-login')
  if (source.ruleContent?.imageDecode?.trim()) capabilities.add('image-decode')
  if (source.loginUi?.trim()) {
    issues.push({
      status: 'partial', code: 'UNSUPPORTED_LOGIN_UI', path: 'loginUi',
      message: '支持 loginUrl 手动 WebView 登录，但暂不执行 Android loginUi 表单脚本',
    })
  }
  if (source.ruleContent?.callBackJs?.trim()) {
    issues.push({
      status: 'unsupported', code: 'UNSUPPORTED_CALLBACK_JS', path: 'ruleContent.callBackJs',
      message: 'Tauri 阅读器暂不执行 Android 阅读事件回调脚本',
    })
  }
  if (strings.some(entry => /["']serverID["']\s*:/.test(entry.value))) {
    issues.push({
      status: 'unsupported', code: 'UNSUPPORTED_SERVER_ID', path: 'request.serverID',
      message: 'serverID 依赖 Android 应用内服务器配置',
    })
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
    verificationStatus: 'untested',
    engineVersion: SOURCE_ENGINE_VERSION,
    capabilities: [...capabilities].sort(),
    stages: {},
  }
}
