/**
 * Legado 规则解析兼容入口。
 *
 * 词法拆分、IR 编译和类型执行分别位于 RuleCompiler、RuleTypes 与
 * RuleEvaluator。本文件保留旧调用方使用的 facade 和通用字符串工具。
 */
import { compileRule } from './RuleCompiler'
import { evaluateRuleList, evaluateRuleListAsync, evaluateRuleString, evaluateRuleStringAsync } from './RuleEvaluator'
import { RuleExecutionError, type RuleExecutionContext } from './RuleTypes'
import { executeSourceJavaScript, executeSourceWebJavaScript } from '@/platform/sourceScripts'

export interface ParsedRule {
  type: 'css' | 'xpath' | 'jsonpath' | 'regex' | 'js' | 'webjs'
  expression: string
  replacement?: string
}

/** 移植 Android AnalyzeRule.replaceRegex 的纯正则部分，支持以换行或 && 拼接的多条替换规则。 */
export function applyTextReplaceRule(content: string, rule?: string): string {
  if (!rule || !rule.trim()) return content

  const replaceRules = rule.split(/[\r\n]+|&&/).map(r => r.trim()).filter(Boolean)
  let current = content

  for (const replaceRule of replaceRules) {
    const compiled = compileRule(replaceRule)
    const segment = compiled.alternatives[0]
    if (!segment || segment.replacePattern === undefined) continue

    try {
      let expression = segment.replacePattern
      let flags = segment.replaceFirst ? '' : 'g'
      const inlineFlags = expression.match(/^\(\?([ims]+)\)/)
      if (inlineFlags) {
        expression = expression.substring(inlineFlags[0].length)
        flags += inlineFlags[1]
      }
      const pattern = new RegExp(expression, [...new Set(flags)].join(''))
      const replacement = (segment.replacement || '').replace(/\$0/g, '$&')
      if (!segment.replaceFirst) {
        current = current.replace(pattern, replacement)
      } else {
        const match = pattern.exec(current)
        current = match ? match[0].replace(pattern, replacement) : ''
      }
    } catch (cause) {
      throw new RuleExecutionError(`正则表达式替换失败: ${segment.replacePattern}`, {
        code: 'INVALID_REGEX',
        rule: replaceRule,
        mode: 'legado',
        cause,
      })
    }
  }
  return current
}

/**
 * 异步正文文本替换规则解析，同时支持：
 * 1. 传统以换行或 && 拼接的多条正则替换规则（##pattern##replacement）
 * 2. 以 @js: 或 <js>...</js> 声明的 JavaScript 清洗脚本（绑定 result 为正文内容）
 */
export async function applyTextReplaceRuleAsync(
  content: string,
  rule?: string,
  context?: RuleExecutionContext,
): Promise<string> {
  if (!rule || !rule.trim()) return content
  const trimmed = rule.trim()

  // 1. 检查是否为 JavaScript 脚本替换规则
  if (/@js:|<js>|<\/js>/i.test(trimmed)) {
    const jsPattern = /@js:([\s\S]+)$|<js>([\s\S]*?)<\/js>/i
    const match = trimmed.match(jsPattern)
    if (match) {
      const code = match[1] || match[2] || ''
      const jsContext: RuleExecutionContext = context || {
        compatibilityMode: 'legado',
        stage: 'content',
        baseUrl: '',
      }
      try {
        const sourceUrl = String(context?.source?.bookSourceUrl || context?.baseUrl || 'replace-rule')
        const jsResult = (await executeSourceJavaScript(sourceUrl, code, jsContext, content)).result
        return typeof jsResult === 'string' ? jsResult : String(jsResult ?? '')
      } catch (cause) {
        throw new RuleExecutionError('替换规则 JavaScript 脚本执行失败', {
          code: 'UNSUPPORTED_JAVASCRIPT',
          rule: trimmed,
          mode: 'legado',
          stage: 'content',
          cause,
        })
      }
    }
  }

  // 2. 纯正则替换规则快速通道
  return applyTextReplaceRule(content, rule)
}

export function resolveAbsoluteUrl(rawUrl: string, baseUrl?: string): string {
  if (!rawUrl) return ''
  const target = rawUrl.trim()
  if (!target) return ''
  if (/^https?:\/\//i.test(target)) return target
  if (target.startsWith('//')) return `https:${target}`
  if (!baseUrl) return target

  let base = baseUrl.trim()
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`
  try {
    return new URL(target, base).href
  } catch {
    if (base.endsWith('/') && target.startsWith('/')) return base + target.slice(1)
    if (!base.endsWith('/') && !target.startsWith('/')) return `${base}/${target}`
    return base + target
  }
}

export function cleanBookTitle(raw: string): string {
  return (raw || '').trim().replace(/^\[?\d+\]?[\.、\s\-]+/, '').trim()
}

export function generateBookId(name: string, author = '', sourceUrl = ''): string {
  const raw = `${cleanBookTitle(name)}_${author.trim()}_${sourceUrl.trim()}`
  let hash = 0
  for (let index = 0; index < raw.length; index += 1) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(index)
    hash |= 0
  }
  return `online_${Math.abs(hash).toString(36)}`
}

/** 仅供旧代码/调试展示使用，规则执行不再依赖此字符串重写。 */
export function normalizeSelector(raw: string): string {
  return raw.trim()
    .replace(/^@css:/i, '')
    .replace(/^@@/, '')
    .replace(/\bclass\.([\w-]+)/g, '.$1')
    .replace(/\bid\.([\w-]+)/g, '#$1')
    .replace(/\btag\.([\w-]+)/g, '$1')
    .replace(/@/g, ' ')
    .replace(/\bchildren\b/g, '> *')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseRuleType(rule: string): ParsedRule {
  const segment = compileRule(rule).alternatives[0]
  if (!segment) return { type: 'css', expression: '' }
  const type = segment.mode === 'json' ? 'jsonpath'
    : segment.mode === 'default' ? 'css'
      : segment.mode === 'regex' ? 'regex'
        : segment.mode
  return { type, expression: segment.expression, replacement: segment.replacement }
}

export function parseList(
  content: unknown,
  rule: string,
  _isJson = false,
  options?: Partial<RuleExecutionContext>,
): unknown[] {
  return evaluateRuleList(content as string | Document | Element | Record<string, unknown> | unknown[], rule, options)
}

export function parseString(
  context: unknown,
  rule: string,
  options?: Partial<RuleExecutionContext>,
): string {
  if (!rule || context === null || context === undefined) return ''
  return evaluateRuleString(context as string | Document | Element | Record<string, unknown> | unknown[], rule, options)
}

function sourceId(options?: Partial<RuleExecutionContext>): string {
  return String(options?.source?.bookSourceUrl || options?.baseUrl || 'unknown-source')
}

const scriptRunner = {
  async javascript(code: string, context: RuleExecutionContext, input: unknown) {
    return (await executeSourceJavaScript(sourceId(context), code, context, input)).result
  },
  async webJavascript(code: string, context: RuleExecutionContext, input: unknown) {
    return (await executeSourceWebJavaScript(sourceId(context), code, context, input)).result
  },
}

export async function parseListAsync(
  content: unknown,
  rule: string,
  options: Partial<RuleExecutionContext>,
): Promise<unknown[]> {
  return evaluateRuleListAsync(
    content as string | Document | Element | Record<string, unknown> | unknown[],
    rule, options, scriptRunner,
  )
}

/** 对应 Android AnalyzeRule.getElements：规则各段都返回节点而非末段字符串值。 */
export async function parseElementListAsync(
  content: unknown,
  rule: string,
  options: Partial<RuleExecutionContext>,
): Promise<unknown[]> {
  return parseListAsync(content, rule, { ...options, selectElementsOnly: true })
}

export async function parseStringAsync(
  context: unknown,
  rule: string,
  options: Partial<RuleExecutionContext>,
): Promise<string> {
  if (!rule || context === null || context === undefined) return ''
  return evaluateRuleStringAsync(
    context as string | Document | Element | Record<string, unknown> | unknown[],
    rule, options, scriptRunner,
  )
}

export { RuleExecutionError } from './RuleTypes'
export type { CompatibilityMode, RuleExecutionContext } from './RuleTypes'
