import type { SourceEngineRequestTrace } from './SourceEngine'
import type { SourceStageDiagnostic } from './SourceDiagnostics'
import type { OnlineChapterPayload } from '@/source/types/BookSource'

export interface DebugLine { tag: string; message: string; type: 'info' | 'warn' | 'error' | 'success' }
export type DebugWriter = (tag: string, message: string, type?: DebugLine['type']) => void

// 在日志进入展示/缓存之前脱敏；保留普通查询参数和地址格式，便于诊断。
export function redactDebugText(text: string): string {
  return text
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[已脱敏]@')
    .replace(/([?&#](?:access_token|refresh_token|id_token|token|api[_-]?key|authorization|auth|password|passwd|secret|signature|sign|credential|session(?:id)?|cookie)=)[^\s&#"'<>]*/gi, '$1[已脱敏]')
    .replace(/,\s*\{[\s\S]*/g, ',[请求选项已省略]')
}

export function excerpt(value: string, limit: number, tail = false): string {
  return value.length <= limit ? value : `${tail ? value.slice(-limit) : value.slice(0, limit)}…（原始 ${value.length} 字符）`
}

export function checkDebugUrl(value: string): string | undefined {
  // Legado URL 可以携带 ,{...} 请求选项；只检查地址部分。
  const address = value.replace(/,\s*\{[\s\S]*$/, '')
  if (/\s/.test(address)) return '地址含未编码空白，可能拼接了多个链接'
  if ((address.split(/[?#]/)[0]?.match(/https?:\/\//gi)?.length || 0) > 1) return '地址疑似拼接多个链接'
  try {
    const url = new URL(address)
    if (!['http:', 'https:'].includes(url.protocol)) return '非 HTTP(S) 地址'
  } catch { return '地址格式无效' }
  return undefined
}

const fields = [
  ['name', '书名'], ['author', '作者'], ['bookUrl', '详情地址'], ['coverUrl', '封面地址'],
  ['intro', '简介'], ['kind', '分类/状态'], ['lastChapter', '最新章节'],
  ['updateTime', '更新时间'], ['wordCount', '字数'], ['tocUrl', '目录地址'],
] as const

export function logBookFields(write: DebugWriter, tag: string, book: object, rules: object | undefined, script = false, detail = false): void {
  const values = book as Record<string, unknown>
  const configured = (rules || {}) as Record<string, unknown>
  for (const [key, label] of fields) {
    if ((key === 'tocUrl' && !detail) || (key === 'bookUrl' && detail)) continue
    const value = String(values[key] ?? '')
    const hasRule = Boolean(String(configured[key] ?? '').trim())
    const empty = !value.trim()
    const status = empty ? (script ? '脚本返回为空' : hasRule ? '规则已配置但结果为空' : '规则未配置') : (key === 'intro' ? excerpt(value, 200) : value)
    write(tag, `${label} (${key})${script ? ' [脚本返回]' : ''}: ${status}`, empty && (script || hasRule) ? 'warn' : 'info')
    if (!empty && key.endsWith('Url')) {
      const warning = checkDebugUrl(value)
      if (warning) write('DIAGNOSE', `${key}: ${warning}；值=${value}`, 'warn')
    }
  }
}

export function logRequestTrace(write: DebugWriter, trace: SourceEngineRequestTrace): void {
  const response = trace.response
  const warning = checkDebugUrl(trace.request.url)
  if (warning) write('DIAGNOSE', `[${trace.stage || 'unknown'}] 请求地址: ${warning}；值=${trace.request.url}`, 'warn')
  const challenge = trace.error instanceof Error && /^(?:Security|Cloudflare)ChallengeError$/.test(trace.error.name)
  const category = challenge ? '安全质询' : trace.error ? (response ? '响应处理异常' : '传输异常') : response && response.status >= 400 ? 'HTTP 错误响应' : '响应'
  write('HTTP', `[${trace.stage || 'unknown'}] ${trace.request.method} ${trace.request.url}；${category}；通道=${response?.channel || trace.channel || '未知'}；状态=${response?.status ?? '未收到响应'}；最终地址=${response?.finalUrl || '无'}；大小=${response?.body.byteLength ?? 0} 字节；耗时=${trace.durationMs ?? 0}ms（含限流等待/重试）；尝试=${trace.attempts ?? 1}`, trace.error || (response && response.status >= 400) ? 'error' : 'info')
}

export function logStageDiagnostic(write: DebugWriter, event: SourceStageDiagnostic): void {
  const reasons = { 'no-rule': '未配置下一页规则', 'no-next': '未提取到下一页', repeat: '重复请求', limit: '达到分页上限', error: '请求或解析失败', script: '脚本返回，内部请求不可观测' }
  const counts = event.stage === 'toc'
    ? `；解析条目=${event.parsed ?? 0}；过滤=${event.filtered ?? 0}；去重=${event.deduplicated ?? 0}；最终条目=${event.finalCount ?? 0}`
    : event.beforeReplace !== undefined ? `；最终 replaceRegex 前=${event.beforeReplace} 字符；后=${event.afterReplace} 字符` : ''
  write(event.stage.toUpperCase(), `阶段统计：页数=${event.reason === 'script' ? '不可观测' : event.pages}；结束原因=${reasons[event.reason]}${counts}`, ['repeat', 'limit', 'error'].includes(event.reason) ? 'warn' : 'info')
}

export function logContentPayload(write: DebugWriter, payload: OnlineChapterPayload): void {
  write('CONTENT', `类型=${payload.type}；标题=${payload.title || '未返回'}；字符数=${payload.type === 'text' ? payload.text.length : 0}；图片数=${payload.type === 'images' ? payload.images.length : payload.embeddedImages?.length || 0}`)
  if (payload.type === 'text') {
    write('CONTENT', `正文开头:\n${excerpt(payload.text, 120)}`)
    write('CONTENT', `正文结尾:\n${excerpt(payload.text, 120, true)}`)
  }
}

export function formatDebugSummary(statuses: Record<string, string>, mode: string, warnings: number, elapsed: number, reason: string): string {
  const names: Record<string, string> = { search: mode === 'explore' ? '发现' : '搜索', bookInfo: '详情', toc: '目录', content: '正文' }
  const labels: Record<string, string> = { idle: '未执行', running: '已中止', stopped: '已中止', success: '成功', failed: '失败', skipped: '跳过' }
  const stages = Object.entries(statuses).map(([key, value]) => `${names[key]}=${labels[value]}`).join('；')
  const scope = mode === 'search' || mode === 'explore' ? '列表前3本展示、仅第1本继续详情/目录/首章调试' : mode === 'bookInfo' ? '指定详情/目录/首章' : mode === 'toc' ? '指定目录/首章' : '指定章节'
  return `${reason}；${stages}；警告=${warnings}；总耗时=${elapsed}ms；范围=${scope}（以阶段状态为准）；封面未加载验证，其余书籍/章节未验证。`
}
