import type { ReplaceRuleRecord } from '@/storage/db'
import type { ChapterPayload } from '@/stores/reading'

export interface ReplaceContext {
  bookName: string
  sourceUrl?: string
}

export class ReplacementTimeoutError extends Error {
  constructor(public readonly rule: ReplaceRuleRecord) {
    super(`替换规则“${rule.name}”执行超时`)
    this.name = 'ReplacementTimeoutError'
  }
}

function scopeMatches(value: string | undefined, context: ReplaceContext): boolean {
  if (!value?.trim()) return true
  const normalized = value.toLowerCase()
  return Boolean(
    (context.bookName && normalized.includes(context.bookName.toLowerCase())) ||
    (context.sourceUrl && normalized.includes(context.sourceUrl.toLowerCase())),
  )
}

function excludedByScope(value: string | undefined, context: ReplaceContext): boolean {
  if (!value?.trim()) return false
  const normalized = value.toLowerCase()
  return Boolean(
    (context.bookName && normalized.includes(context.bookName.toLowerCase())) ||
    (context.sourceUrl && normalized.includes(context.sourceUrl.toLowerCase())),
  )
}

export function applicableReplaceRules(
  rules: ReplaceRuleRecord[],
  context: ReplaceContext,
  target: 'content' | 'title' | 'source',
): ReplaceRuleRecord[] {
  return rules
    .filter(rule => {
      if (!rule.isEnabled || !rule.pattern) return false
      if (target === 'content' && !rule.scopeContent) return false
      if (target === 'title' && !rule.scopeTitle) return false
      if (target === 'source' && !rule.scopeSource) return false
      return scopeMatches(rule.scope, context) && !excludedByScope(rule.excludeScope, context)
    })
    .sort((a, b) => a.order - b.order || a.id - b.id)
}

function replaceLiteral(segments: string[], rule: ReplaceRuleRecord): string[] {
  return segments.map(segment => segment.split(rule.pattern).join(rule.replacement))
}

function replaceRegexSync(segments: string[], rule: ReplaceRuleRecord): string[] {
  const regex = new RegExp(rule.pattern, 'g')
  return segments.map(segment => segment.replace(regex, rule.replacement))
}

async function replaceRegexInWorker(
  segments: string[],
  rule: ReplaceRuleRecord,
): Promise<string[]> {
  if (typeof Worker === 'undefined') return replaceRegexSync(segments, rule)
  const code = `
    self.onmessage = event => {
      try {
        const { segments, pattern, replacement } = event.data;
        const regex = new RegExp(pattern, 'g');
        self.postMessage({ segments: segments.map(item => item.replace(regex, replacement)) });
      } catch (error) {
        self.postMessage({ error: error instanceof Error ? error.message : String(error) });
      }
    };
  `
  const workerUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
  const worker = new Worker(workerUrl)
  return new Promise<string[]>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      worker.terminate()
      URL.revokeObjectURL(workerUrl)
      reject(new ReplacementTimeoutError(rule))
    }, Math.max(100, rule.timeoutMillisecond || 3000))
    const cleanup = () => {
      window.clearTimeout(timeout)
      worker.terminate()
      URL.revokeObjectURL(workerUrl)
    }
    worker.onmessage = event => {
      cleanup()
      if (event.data?.error) reject(new Error(event.data.error))
      else resolve(event.data.segments as string[])
    }
    worker.onerror = event => {
      cleanup()
      reject(new Error(event.message || '正则替换执行失败'))
    }
    worker.postMessage({ segments, pattern: rule.pattern, replacement: rule.replacement })
  })
}

export async function applyReplacementRulesToSegments(
  input: string[],
  rules: ReplaceRuleRecord[],
): Promise<{ segments: string[]; effectiveRuleIds: number[] }> {
  let segments = [...input]
  const effectiveRuleIds: number[] = []
  for (const rule of [...rules].sort((a, b) => a.order - b.order || a.id - b.id)) {
    const before = segments.join('\u0000')
    segments = rule.isRegex
      ? await replaceRegexInWorker(segments, rule)
      : replaceLiteral(segments, rule)
    if (segments.join('\u0000') !== before) effectiveRuleIds.push(rule.id)
  }
  return { segments, effectiveRuleIds }
}

async function replaceHtmlTextNodes(
  html: string,
  rules: ReplaceRuleRecord[],
): Promise<string> {
  if (rules.length === 0) return html
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const tag = node.parentElement?.tagName.toLowerCase()
      return tag === 'script' || tag === 'style'
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT
    },
  })
  const nodes: Text[] = []
  while (walker.nextNode()) nodes.push(walker.currentNode as Text)
  const result = await applyReplacementRulesToSegments(nodes.map(node => node.data), rules)
  nodes.forEach((node, index) => { node.data = result.segments[index] || '' })
  return doc.body.innerHTML
}

export async function applyRulesToChapter(
  payload: ChapterPayload,
  rules: ReplaceRuleRecord[],
  context: ReplaceContext,
): Promise<ChapterPayload> {
  const titleRules = applicableReplaceRules(rules, context, 'title')
  const contentRules = applicableReplaceRules(rules, context, 'content')
  const title = titleRules.length
    ? (await applyReplacementRulesToSegments([payload.title], titleRules)).segments[0] || ''
    : payload.title
  let content: string[] | string = payload.content
  if (contentRules.length) {
    content = Array.isArray(payload.content)
      ? (await applyReplacementRulesToSegments(payload.content, contentRules)).segments
      : await replaceHtmlTextNodes(payload.content, contentRules)
  }
  return { ...payload, title, content }
}

export async function applyRulesToSourceJson(
  source: Record<string, unknown>,
  rules: ReplaceRuleRecord[],
): Promise<Record<string, unknown>> {
  const context = {
    bookName: String(source.bookSourceName || ''),
    sourceUrl: String(source.bookSourceUrl || ''),
  }
  const sourceRules = applicableReplaceRules(rules, context, 'source')
  if (sourceRules.length === 0) return source
  const json = JSON.stringify(source)
  const replaced = (await applyReplacementRulesToSegments([json], sourceRules)).segments[0] || ''
  const parsed = JSON.parse(replaced) as Record<string, unknown>
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('替换结果不是书源对象')
  }
  return parsed
}
