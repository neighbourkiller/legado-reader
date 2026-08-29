import { JSONPath } from 'jsonpath-plus'
import {
  compileChainedStep,
  compileRule,
  detectMode,
  extractIndexSpec,
  isValueDirective,
  splitChainSteps,
  splitLegacyChain,
  VALUE_DIRECTIVES,
} from './RuleCompiler'
import {
  type ChainedStep,
  type CompiledRule,
  type CompiledRuleNode,
  DEFAULT_RULE_CONTEXT,
  type IndexSpec,
  type RuleExecutionContext,
  RuleExecutionError,
  type RuleMode,
  type RuleSegment,
} from './RuleTypes'

type RuleNode = Node | Record<string, unknown> | string | number | boolean | null
type RegexGroupNode = { __regexGroups: string[] }

function isRegexGroupNode(value: unknown): value is RegexGroupNode {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as RegexGroupNode).__regexGroups))
}

function mergedContext(context?: Partial<RuleExecutionContext>): RuleExecutionContext {
  return { ...DEFAULT_RULE_CONTEXT, variables: context?.variables || new Map(), ...context }
}

function errorFor(
  message: string,
  code: ConstructorParameters<typeof RuleExecutionError>[1]['code'],
  segment: { source?: string; raw?: string } | ChainedStep,
  context: RuleExecutionContext,
  cause?: unknown,
) {
  return new RuleExecutionError(message, {
    code,
    stage: context.stage,
    field: context.field,
    rule: (segment as RuleSegment).source || (segment as ChainedStep).expression || '',
    mode: context.compatibilityMode,
    cause,
  })
}

function parseDocument(content: string): Document {
  return new DOMParser().parseFromString(content, 'text/html')
}

function interleave<T>(groups: T[][]): T[] {
  const result: T[] = []
  const longest = Math.max(0, ...groups.map(group => group.length))
  for (let index = 0; index < longest; index += 1) {
    for (const group of groups) {
      if (index < group.length) result.push(group[index]!)
    }
  }
  return result
}

function normalizeText(text: string | null | undefined): string {
  return (text || '').replace(/\s+/g, ' ').trim()
}

function ownText(element: Element): string {
  return Array.from(element.childNodes)
    .filter(node => node.nodeType === Node.TEXT_NODE)
    .map(node => node.textContent?.trim() || '')
    .filter(Boolean)
    .join(' ')
}

function normalizeIndex(value: number, length: number): number {
  return value < 0 ? value + length : value
}

function expandIndexes(tokens: string[], length: number, bracketSyntax: boolean): number[] {
  const result: number[] = []
  for (const token of tokens) {
    const parts = token.split(':')
    if (!bracketSyntax || parts.length === 1) {
      const value = Number(token)
      if (Number.isInteger(value)) result.push(normalizeIndex(value, length))
      continue
    }
    const startRaw = parts[0] === '' ? 0 : Number(parts[0])
    const endRaw = parts[1] === '' ? length - 1 : Number(parts[1])
    const stepRaw = parts[2] === undefined || parts[2] === '' ? 1 : Number(parts[2])
    if (![startRaw, endRaw, stepRaw].every(Number.isFinite) || stepRaw === 0) continue
    const start = Math.max(0, Math.min(length - 1, normalizeIndex(startRaw, length)))
    const end = Math.max(0, Math.min(length - 1, normalizeIndex(endRaw, length)))
    const direction = end >= start ? 1 : -1
    const step = Math.abs(stepRaw) * direction
    for (let index = start; direction > 0 ? index <= end : index >= end; index += step) {
      result.push(index)
    }
  }
  return [...new Set(result)].filter(index => index >= 0 && index < length)
}

function applyIndexSpec<T>(items: T[], spec: IndexSpec | undefined, bracketSyntax: boolean): T[] {
  if (!spec) return items
  const indexes = expandIndexes(spec.tokens, items.length, bracketSyntax)
  if (spec.exclude) {
    const excludeSet = new Set(indexes)
    return items.filter((_, index) => !excludeSet.has(index))
  }
  // 保持索引展开的原始顺序（支持反向区间切片如 tag.p[-1:0] 及用户自定义乱序）
  return indexes.map(i => items[i]).filter((item): item is T => item !== undefined)
}

export interface NormalizedCssSelector {
  selector: string
  textFilter?: string
}

/**
 * 标准化和转译非标准 Jsoup/jQuery CSS 选择器（如 :eq(n)、内联 tag.数字、:contains(text)）
 */
export function normalizeCssSelector(rawSelector: string): NormalizedCssSelector {
  let result = rawSelector.trim()
  let textFilter: string | undefined

  // 1. 提取并转译 :contains(text)
  const containsMatch = result.match(/:contains\((['"]?)(.*?)\1\)/i)
  if (containsMatch) {
    textFilter = containsMatch[2]
    result = result.replace(/:contains\((['"]?)(.*?)\1\)/gi, '')
  }

  // 2. 转译 :eq(n)
  // 带 tag 的 :eq(n): 例如 p:eq(1), li:eq(-1)
  result = result.replace(/([a-zA-Z0-9_-]+):eq\((-?\d+)\)/gi, (_, tag: string, numStr: string) => {
    const n = Number.parseInt(numStr, 10)
    if (n === -1) return `${tag}:last-of-type`
    if (n < -1) return `${tag}:nth-last-of-type(${Math.abs(n)})`
    return `${tag}:nth-of-type(${n + 1})`
  })
  // 不带 tag 的 :eq(n): 例如 :eq(0), :eq(-1)
  result = result.replace(/:eq\((-?\d+)\)/gi, (_, numStr: string) => {
    const n = Number.parseInt(numStr, 10)
    if (n === -1) return ':last-child'
    if (n < -1) return `:nth-last-child(${Math.abs(n)})`
    return `:nth-child(${n + 1})`
  })

  // 3. 转译内联点索引：例如 li.1 a, p.0 a, div.item.1 h3, ul li.1
  // 匹配类似 tag.数字 或 class.数字
  result = result.replace(/([a-zA-Z0-9_-]+)\.(-?\d+)(?=[ >+~:.\s]|$)/g, (match, prefix: string, numStr: string) => {
    const n = Number.parseInt(numStr, 10)
    if (/^\d+$/.test(prefix)) return match
    const isTag = /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(prefix)
    if (isTag) {
      if (n === -1) return `${prefix}:last-of-type`
      if (n < -1) return `${prefix}:nth-last-of-type(${Math.abs(n)})`
      return `${prefix}:nth-of-type(${n + 1})`
    }
    if (n === -1) return `${prefix}:last-child`
    if (n < -1) return `${prefix}:nth-last-child(${Math.abs(n)})`
    return `${prefix}:nth-child(${n + 1})`
  })

  return { selector: result.trim() || '*', textFilter }
}

function queryLegacyStep(
  root: Element | Document,
  rawSelector: string,
  spec?: IndexSpec,
  bracketSyntax = false,
): Element[] {
  const isBracket = bracketSyntax || /\[[!\d\s,-]/.test(rawSelector)
  const extracted = spec ? { selector: rawSelector, spec } : extractIndexSpec(rawSelector)
  const selector = extracted.selector.trim()
  let elements: Element[]

  if (!selector || selector.toLowerCase() === 'children') {
    elements = root instanceof Document
      ? Array.from(root.documentElement?.children || [])
      : Array.from(root.children)
  } else if (/^class\./i.test(selector)) {
    elements = Array.from(root.getElementsByClassName(selector.slice(6)))
  } else if (/^tag\./i.test(selector)) {
    elements = Array.from(root.getElementsByTagName(selector.slice(4)))
  } else if (/^id\./i.test(selector)) {
    const id = selector.slice(3)
    const escapedId = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(id)
      : id.replace(/([^\w-])/g, '\\$1')
    elements = Array.from(root.querySelectorAll(`#${escapedId}`))
  } else if (/^text\./i.test(selector)) {
    const expected = selector.slice(5)
    elements = Array.from(root.querySelectorAll('*')).filter(item => ownText(item).includes(expected))
  } else {
    const normalized = normalizeCssSelector(selector)
    elements = Array.from(root.querySelectorAll(normalized.selector))
    if (normalized.textFilter) {
      elements = elements.filter(item => (item.textContent || '').includes(normalized.textFilter!))
    }
  }

  return applyIndexSpec(elements, extracted.spec, isBracket)
}

function extractElements(elements: Element[], directive: string): string[] {
  const lower = directive.toLowerCase().trim()
  if (lower === 'text') return elements.map(element => normalizeText(element.textContent)).filter(Boolean)
  if (lower === 'textnodes') {
    return elements.map(element => Array.from(element.childNodes)
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent?.trim() || '')
      .filter(Boolean)
      .join('\n'))
      .filter(Boolean)
  }
  if (lower === 'owntext') {
    return elements.map(element => ownText(element)).filter(Boolean)
  }
  if (lower === 'html') {
    const html = elements.map(element => {
      const clone = element.cloneNode(true) as Element
      clone.querySelectorAll('script,style').forEach(node => node.remove())
      return clone.outerHTML
    }).filter(Boolean).join('\n')
    return html ? [html] : []
  }
  if (lower === 'all') {
    const html = elements.map(element => element.outerHTML).filter(Boolean).join('\n')
    return html ? [html] : []
  }
  const seen = new Set<string>()
  return elements.map(element => element.getAttribute(directive) || '')
    .filter(value => value && !seen.has(value) && seen.add(value))
}

function evaluateLegacyNodes(
  root: Element | Document,
  expression: string,
  steps?: ChainedStep[],
): RuleNode[] {
  if (steps && steps.length > 0) {
    let current: Array<Element | Document> = [root]
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!
      if (step.directive) {
        return extractElements(current.filter((item): item is Element => item instanceof Element), step.directive)
      }
      current = current.flatMap(item => {
        return queryLegacyStep(item, step.expression, step.spec, step.bracketSyntax)
      })
    }
    return current.filter((item): item is Element => item instanceof Element)
  }

  const chain = splitLegacyChain(expression)
  if (chain.length === 0) return []
  let current: Array<Element | Document> = [root]
  for (let i = 0; i < chain.length; i++) {
    const step = chain[i]!
    const isLast = i === chain.length - 1
    if (VALUE_DIRECTIVES.has(step.toLowerCase().trim()) || (isLast && isValueDirective(step))) {
      return extractElements(current.filter((item): item is Element => item instanceof Element), step)
    }
    current = current.flatMap(item => queryLegacyStep(item, step))
  }
  return current.filter((item): item is Element => item instanceof Element)
}

function evaluateCssNodes(root: Element | Document, expression: string): RuleNode[] {
  const lastAt = expression.lastIndexOf('@')
  const hasDirective = lastAt > 0 && isValueDirective(expression.slice(lastAt + 1))
  const rawSelector = hasDirective ? expression.slice(0, lastAt) : expression
  const normalized = normalizeCssSelector(rawSelector)
  let elements = Array.from(root.querySelectorAll(normalized.selector))
  if (normalized.textFilter) {
    elements = elements.filter(item => (item.textContent || '').includes(normalized.textFilter!))
  }
  return hasDirective ? extractElements(elements, expression.slice(lastAt + 1)) : elements
}

export function legadoCompatibleXPath(expression: string): string {
  const REVERSE_AXES = '(?:preceding-sibling|preceding|ancestor|ancestor-or-self)'
  const pattern = new RegExp(
    `(${REVERSE_AXES}::[a-zA-Z0-9_*:-]+(?:\\[[^\\]]+\\])*?)\\[(\\d+)\\]`,
    'g'
  )
  return expression.replace(pattern, '($1)[$2]')
}

function evaluateXPathNodes(root: Element | Document, expression: string, context: RuleExecutionContext): RuleNode[] {
  const doc = root instanceof Document ? root : root.ownerDocument
  let xpath = context.compatibilityMode === 'legado' ? legadoCompatibleXPath(expression) : expression
  if (root instanceof Element && xpath.startsWith('//')) xpath = `.${xpath}`
  const result = doc.evaluate(xpath, root, null, XPathResult.ANY_TYPE, null)
  if (result.resultType === XPathResult.STRING_TYPE) return [result.stringValue]
  if (result.resultType === XPathResult.NUMBER_TYPE) return [result.numberValue]
  if (result.resultType === XPathResult.BOOLEAN_TYPE) return [result.booleanValue]
  const nodes: RuleNode[] = []
  let node = result.iterateNext()
  while (node) {
    nodes.push(node.nodeType === Node.ATTRIBUTE_NODE ? (node as Attr).value : node)
    node = result.iterateNext()
  }
  return nodes
}

function evaluateJsonNodes(value: unknown, expression: string): RuleNode[] {
  const result = JSONPath({ path: expression, json: value as object, wrap: true, eval: 'safe' })
  return (result as unknown[]).flatMap(item => Array.isArray(item) ? item : [item]) as RuleNode[]
}

function evaluateRegexNodes(value: unknown, expression: string): RuleNode[] {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  const regex = new RegExp(expression, 'g')
  const result: RegexGroupNode[] = []
  for (const match of text.matchAll(regex)) result.push({ __regexGroups: Array.from(match, item => item ?? '') })
  return result
}

function applyReplacement(values: RuleNode[], segment: RuleSegment, context: RuleExecutionContext): RuleNode[] {
  if (segment.replacePattern === undefined) return values
  let regex: RegExp
  try {
    let expression = segment.replacePattern
    let flags = segment.replaceFirst ? '' : 'g'
    const inline = expression.match(/^\(\?([ims]+)\)/)
    if (inline) {
      expression = expression.slice(inline[0].length)
      flags += inline[1]
    }
    regex = new RegExp(expression, [...new Set(flags)].join(''))
  } catch (cause) {
    throw errorFor(`无效的替换正则: ${segment.replacePattern}`, 'INVALID_REGEX', segment, context, cause)
  }
  const replacement = (segment.replacement || '').replace(/\$0/g, '$&')
  return values.map(value => {
    if (value === null || value === undefined) return ''
    const text = typeof value === 'string' ? value : nodeToString(value)
    if (!segment.replaceFirst) return text.replace(regex, replacement)
    const match = regex.exec(text)
    return match ? match[0].replace(regex, replacement) : ''
  })
}

function evaluateSingleStep(
  input: unknown,
  step: ChainedStep,
  context: RuleExecutionContext,
): RuleNode[] {
  try {
    if (step.mode === 'js') throw errorFor('JavaScript 规则需要异步脚本运行时', 'UNSUPPORTED_JAVASCRIPT', step, context)
    if (step.mode === 'webjs') throw errorFor('WebJS 规则需要页面脚本运行时', 'UNSUPPORTED_WEBJS', step, context)

    context.result = input

    if (step.putRules) {
      for (const [key, putRule] of Object.entries(step.putRules)) {
        const putValue = evaluateRuleString(input as any, putRule, context)
        context.variables?.set(key, putValue)
      }
    }

    const expression = step.expression
      .replace(/\$(\d{1,2})/g, (token, index: string) => isRegexGroupNode(input)
        ? input.__regexGroups[Number(index)] ?? '' : token)
      .replace(/@get:\{([^}]+)\}/gi, (_, key: string) => context.variables?.get(key) || '')
      .replace(/\{\{\s*(key|page|baseUrl|redirectUrl|result)\s*\}\}/g, (_, key: string) =>
        key === 'result' ? nodeToString(context.result as RuleNode) : String(context[key as keyof RuleExecutionContext] ?? ''))

    let values: RuleNode[] = []

    if (isRegexGroupNode(input) && /^\$\d{1,2}$/.test(step.expression.trim())) {
      values = [expression]
    } else if (step.directive && context.selectElementsOnly) {
      // Android AnalyzeRule.getElements 会把 id.myList@li@a 的每一段都当作
      // 选择器；只有 getString 才会把最后一段 a/href/text 当作属性或值指令。
      // 使用 getElements 语义的列表必须保留前者，否则末段 a 会被误读为 a 属性。
      if (input instanceof Element || input instanceof Document) {
        values = queryLegacyStep(input, expression, step.spec, step.bracketSyntax)
      } else if (typeof input === 'string') {
        values = queryLegacyStep(parseDocument(input), expression, step.spec, step.bracketSyntax)
      }
    } else if (step.directive) {
      if (input instanceof Element) {
        values = extractElements([input], step.directive)
      } else if (input instanceof Document) {
        values = extractElements(Array.from(input.documentElement?.children || []), step.directive)
      } else if (typeof input === 'string') {
        const doc = parseDocument(input)
        values = extractElements(Array.from(doc.body?.children || []), step.directive)
      } else if (input && typeof input === 'object') {
        const val = (input as Record<string, unknown>)[step.directive]
        values = val !== undefined ? [val as RuleNode] : []
      }
    } else if (step.mode === 'css') {
      const root = input instanceof Element || input instanceof Document ? input : parseDocument(String(input ?? ''))
      const normalized = normalizeCssSelector(expression)
      let nodes: Element[] = Array.from(root.querySelectorAll(normalized.selector))
      if (normalized.textFilter) {
        nodes = nodes.filter(item => (item.textContent || '').includes(normalized.textFilter!))
      }
      if (step.spec) nodes = applyIndexSpec(nodes, step.spec, step.bracketSyntax || false)
      values = nodes
    } else if (step.mode === 'xpath') {
      const root = input instanceof Element || input instanceof Document ? input : parseDocument(String(input ?? ''))
      let nodes = evaluateXPathNodes(root, expression, context)
      if (step.spec) nodes = applyIndexSpec(nodes, step.spec, step.bracketSyntax || false)
      values = nodes
    } else if (step.mode === 'json' || (!(input instanceof Node) && typeof input === 'object' && input !== null && expression.startsWith('$'))) {
      const jsonInput = typeof input === 'string' && /^[\s\uFEFF]*[\[{]/.test(input)
        ? JSON.parse(input)
        : input
      let nodes = evaluateJsonNodes(jsonInput, expression)
      if (step.spec) nodes = applyIndexSpec(nodes, step.spec, step.bracketSyntax || false)
      values = nodes
    } else if (step.mode === 'regex') {
      let nodes = evaluateRegexNodes(input, expression)
      if (step.spec) nodes = applyIndexSpec(nodes, step.spec, step.bracketSyntax || false)
      values = nodes
    } else {
      if (input instanceof Element || input instanceof Document) {
        values = queryLegacyStep(input, expression, step.spec, step.bracketSyntax)
      } else if (typeof input === 'string') {
        const doc = parseDocument(input)
        values = queryLegacyStep(doc, expression, step.spec, step.bracketSyntax)
      } else if (input && typeof input === 'object') {
        const val = (input as Record<string, unknown>)[expression]
        values = val !== undefined ? [val as RuleNode] : []
      }
    }

    if (step.replaceRules && step.replaceRules.length > 0) {
      for (const rep of step.replaceRules) {
        values = applyReplacement(values, {
          source: step.raw,
          mode: step.mode,
          expression: step.expression,
          replacePattern: rep.pattern,
          replacement: rep.replacement,
          replaceFirst: rep.replaceFirst,
        }, context)
      }
    }

    return values
  } catch (cause) {
    if (cause instanceof RuleExecutionError) throw cause
    const code = step.mode === 'xpath' ? 'INVALID_XPATH'
      : step.mode === 'json' ? 'INVALID_JSONPATH'
        : step.mode === 'regex' ? 'INVALID_REGEX'
        : 'INVALID_SELECTOR'
    throw errorFor(`规则执行失败: ${step.raw}`, code, step, context, cause)
  }
}

async function evaluateSingleStepAsync(
  input: unknown,
  step: ChainedStep,
  context: RuleExecutionContext,
  runner?: RuleScriptRunner,
): Promise<RuleNode[]> {
  if (step.mode === 'js' || step.mode === 'webjs') {
    if (!runner) {
      throw errorFor(`执行 ${step.mode} 规则需要脚本运行器`, step.mode === 'webjs' ? 'UNSUPPORTED_WEBJS' : 'UNSUPPORTED_JAVASCRIPT', step, context)
    }
    try {
      context.result = input
      let scriptInput: unknown = input instanceof Element ? input.outerHTML
        : input instanceof Document ? input.documentElement.outerHTML : input
      const expression = step.expression
        .replace(/@get:\{([^}]+)\}/gi, (_, key: string) => context.variables?.get(key) || '')
        .replace(/\{\{\s*(key|page|baseUrl|redirectUrl|result)\s*\}\}/g, (_, key: string) =>
          key === 'result' ? nodeToString(context.result as RuleNode) : String(context[key as keyof RuleExecutionContext] ?? ''))

      const val = step.mode === 'js'
        ? await runner.javascript(expression, context, scriptInput)
        : await runner.webJavascript(expression, context, scriptInput)

      let values = normalizeScriptValues(val)
      if (step.replaceRules && step.replaceRules.length > 0) {
        for (const rep of step.replaceRules) {
          values = applyReplacement(values, {
            source: step.raw,
            mode: step.mode,
            expression: step.expression,
            replacePattern: rep.pattern,
            replacement: rep.replacement,
            replaceFirst: rep.replaceFirst,
          }, context)
        }
      }
      return values
    } catch (cause) {
      const causeCode = typeof cause === 'object' && cause !== null && 'code' in cause
        ? String(cause.code) : ''
      const supportedCode = [
        'UNSUPPORTED_ANDROID_API', 'JS_TIMEOUT', 'JS_MEMORY_LIMIT', 'JS_EXECUTION_FAILED',
        'WEBJS_TIMEOUT', 'WEBJS_EXECUTION_FAILED',
      ].includes(causeCode) ? causeCode as ConstructorParameters<typeof RuleExecutionError>[1]['code'] : undefined
      throw cause instanceof RuleExecutionError ? cause : errorFor(
        `脚本规则执行失败: ${step.raw}`,
        supportedCode || (step.mode === 'webjs' ? 'UNSUPPORTED_WEBJS' : 'UNSUPPORTED_JAVASCRIPT'),
        step, context, cause,
      )
    }
  }

  return evaluateSingleStep(input, step, context)
}

function evaluateChain(
  input: unknown,
  segment: RuleSegment,
  context: RuleExecutionContext,
): RuleNode[] {
  context.result = input

  if (segment.putRules) {
    for (const [key, putRule] of Object.entries(segment.putRules)) {
      const putValue = evaluateRuleString(input as any, putRule, context)
      context.variables?.set(key, putValue)
    }
  }

  const expression = segment.expression
    .replace(/@get:\{([^}]+)\}/gi, (_, key: string) => context.variables?.get(key) || '')
    .replace(/\{\{\s*(key|page|baseUrl|redirectUrl|result)\s*\}\}/g, (_, key: string) =>
      key === 'result' ? nodeToString(context.result as RuleNode) : String(context[key as keyof RuleExecutionContext] ?? ''))

  const isDynamic = expression !== segment.expression
  const steps = isDynamic || !segment.steps || segment.steps.length === 0
    ? splitChainSteps(expression).map((s, idx, arr) => compileChainedStep(s, idx === arr.length - 1))
    : segment.steps

  let current: RuleNode[] = Array.isArray(input) ? input as RuleNode[] : [input as RuleNode]

  for (const step of steps) {
    if (current.length === 0) break
    const nextLevel: RuleNode[] = []
    for (const item of current) {
      if (item === null || item === undefined) continue
      const results = evaluateSingleStep(item, step, context)
      nextLevel.push(...results)
    }
    current = nextLevel
  }

  if (segment.replacePattern !== undefined) {
    current = applyReplacement(current, segment, context)
  }
  return current
}

async function evaluateChainAsync(
  input: unknown,
  segment: RuleSegment,
  context: RuleExecutionContext,
  runner?: RuleScriptRunner,
  stringifyBeforeScript = false,
): Promise<RuleNode[]> {
  context.result = input

  if (segment.putRules) {
    for (const [key, putRule] of Object.entries(segment.putRules)) {
      const putValue = await evaluateRuleStringAsync(input as any, putRule, context, runner)
      context.variables?.set(key, putValue)
    }
  }

  const expression = segment.expression
    .replace(/@get:\{([^}]+)\}/gi, (_, key: string) => context.variables?.get(key) || '')
    .replace(/\{\{\s*(key|page|baseUrl|redirectUrl|result)\s*\}\}/g, (_, key: string) =>
      key === 'result' ? nodeToString(context.result as RuleNode) : String(context[key as keyof RuleExecutionContext] ?? ''))

  const isDynamic = expression !== segment.expression
  const steps = isDynamic || !segment.steps || segment.steps.length === 0
    ? splitChainSteps(expression).map((s, idx, arr) => compileChainedStep(s, idx === arr.length - 1))
    : segment.steps

  let current: RuleNode[] = Array.isArray(input) ? input as RuleNode[] : [input as RuleNode]

  for (const [stepIndex, step] of steps.entries()) {
    if (current.length === 0) break
    if (step.mode === 'js' || step.mode === 'webjs') {
      const previousStep = steps[stepIndex - 1]
      const followsDeclarativeStep = previousStep
        && previousStep.mode !== 'js' && previousStep.mode !== 'webjs'
      const jsInput = stringifyBeforeScript && followsDeclarativeStep
        ? current.map(nodeToString).join('\n')
        : current.length === 1 ? current[0] : current.map(nodeToString)
      current = await evaluateSingleStepAsync(jsInput, step, context, runner)
    } else {
      const nextLevel: RuleNode[] = []
      for (const item of current) {
        if (item === null || item === undefined) continue
        const results = await evaluateSingleStepAsync(item, step, context, runner)
        nextLevel.push(...results)
      }
      current = nextLevel
    }
  }

  if (segment.replacePattern !== undefined) {
    current = applyReplacement(current, segment, context)
  }
  return current
}

function evaluateSegment(
  input: string | Document | Element | Record<string, unknown> | unknown[],
  segment: RuleSegment,
  context: RuleExecutionContext,
): RuleNode[] {
  return evaluateChain(input, segment, context)
}

function evaluateAstNode(
  input: unknown,
  node: CompiledRuleNode,
  context: RuleExecutionContext,
): RuleNode[] {
  if (node.type === 'combination') {
    if (node.operator === '||') {
      const errors: RuleExecutionError[] = []
      for (const child of node.children || []) {
        try {
          const values = evaluateAstNode(input, child, context)
          if (values.length > 0 && values.some(v => nodeToString(v).trim())) {
            return values
          }
        } catch (error) {
          if (error instanceof RuleExecutionError) errors.push(error)
          else throw error
        }
      }
      if (errors.length > 0 && errors.length === (node.children?.length || 0)) {
        throw errors[0]
      }
      return []
    }

    if (node.operator === '%%') {
      const groups: RuleNode[][] = []
      for (const child of node.children || []) {
        const values = evaluateAstNode(input, child, context)
        if (values.length > 0) groups.push(values)
      }
      return interleave(groups)
    }

    // 默认 ('&&' 或无 operator 单节点组合)
    const results: RuleNode[] = []
    for (const child of node.children || []) {
      const values = evaluateAstNode(input, child, context)
      results.push(...values)
    }
    return results
  }

  if (node.type === 'chain' && node.segment) {
    return evaluateChain(input, node.segment, context)
  }

  if (node.type === 'step' && node.step) {
    return evaluateSingleStep(input, node.step, context)
  }

  return []
}

async function evaluateAstNodeAsync(
  input: unknown,
  node: CompiledRuleNode,
  context: RuleExecutionContext,
  runner?: RuleScriptRunner,
  stringifyBeforeScript = false,
): Promise<RuleNode[]> {
  if (node.type === 'combination') {
    if (node.operator === '||') {
      const errors: RuleExecutionError[] = []
      for (const child of node.children || []) {
        try {
          const values = await evaluateAstNodeAsync(input, child, context, runner, stringifyBeforeScript)
          if (values.length > 0 && values.some(v => nodeToString(v).trim())) {
            return values
          }
        } catch (error) {
          if (error instanceof RuleExecutionError) errors.push(error)
          else throw error
        }
      }
      if (errors.length > 0 && errors.length === (node.children?.length || 0)) {
        throw errors[0]
      }
      return []
    }

    if (node.operator === '%%') {
      const groups: RuleNode[][] = []
      for (const child of node.children || []) {
        const values = await evaluateAstNodeAsync(input, child, context, runner, stringifyBeforeScript)
        if (values.length > 0) groups.push(values)
      }
      return interleave(groups)
    }

    // 默认 ('&&' 或无 operator 单节点组合)
    const results: RuleNode[] = []
    for (const child of node.children || []) {
      const values = await evaluateAstNodeAsync(input, child, context, runner, stringifyBeforeScript)
      results.push(...values)
    }
    return results
  }

  if (node.type === 'chain' && node.segment) {
    return evaluateChainAsync(input, node.segment, context, runner, stringifyBeforeScript)
  }

  if (node.type === 'step' && node.step) {
    return evaluateSingleStepAsync(input, node.step, context, runner)
  }

  return []
}

function evaluateCompiled(
  input: string | Document | Element | Record<string, unknown> | unknown[],
  compiled: CompiledRule,
  context: RuleExecutionContext,
): RuleNode[] {
  if (compiled.tree) {
    return evaluateAstNode(input, compiled.tree, context)
  }
  const groups: RuleNode[][] = []
  const errors: RuleExecutionError[] = []
  for (const segment of compiled.alternatives) {
    try {
      const values = evaluateSegment(input, segment, context)
      if (values.length > 0) groups.push(values)
      if (compiled.operator === '||' && values.some(value => nodeToString(value).trim())) return values
    } catch (error) {
      if (error instanceof RuleExecutionError) errors.push(error)
      else throw error
      if (compiled.operator !== '||') throw error
    }
  }
  if (groups.length === 0 && errors.length === compiled.alternatives.length && errors[0]) throw errors[0]
  if (compiled.operator === '%%') return interleave(groups)
  return groups.flat()
}

export function nodeToString(value: RuleNode): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Attr) return value.value.trim()
  if (value instanceof Node) return normalizeText(value.textContent)
  if (isRegexGroupNode(value)) return (value.__regexGroups[1] ?? value.__regexGroups[0] ?? '').trim()
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function evaluateRuleList(
  input: string | Document | Element | Record<string, unknown> | unknown[],
  rule: string,
  options?: Partial<RuleExecutionContext>,
): RuleNode[] {
  if (!rule.trim()) return []
  return evaluateCompiled(input, compileRule(rule), mergedContext(options))
}

function interpolateTemplateString(
  input: string | Document | Element | Record<string, unknown> | unknown[],
  rule: string,
  context: RuleExecutionContext,
): string {
  return rule.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, expr: string) => {
    const sub = expr.trim()
    if (sub === 'result') return nodeToString(context.result as RuleNode)
    if (['key', 'page', 'baseUrl', 'redirectUrl'].includes(sub)) {
      return String(context[sub as keyof RuleExecutionContext] ?? '')
    }
    if (context.variables?.has(sub)) {
      return context.variables.get(sub) || ''
    }
    if (input !== null && input !== undefined) {
      try {
        return evaluateRuleString(input, sub, context)
      } catch {
        return ''
      }
    }
    return ''
  })
}

async function interpolateTemplateStringAsync(
  input: string | Document | Element | Record<string, unknown> | unknown[],
  rule: string,
  context: RuleExecutionContext,
  runner?: RuleScriptRunner,
): Promise<string> {
  const matches = Array.from(rule.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g))
  if (matches.length === 0) return rule
  let result = rule
  for (const m of matches) {
    const sub = m[1].trim()
    let replacement = ''
    if (sub === 'result') {
      replacement = nodeToString(context.result as RuleNode)
    } else if (['key', 'page', 'baseUrl', 'redirectUrl'].includes(sub)) {
      replacement = String(context[sub as keyof RuleExecutionContext] ?? '')
    } else if (context.variables?.has(sub)) {
      replacement = context.variables.get(sub) || ''
    } else if (input !== null && input !== undefined) {
      try {
        replacement = await evaluateRuleStringAsync(input, sub, context, runner)
      } catch {
        if (runner) {
          try {
            const evalRes = await runner.javascript(sub, context, input)
            replacement = evalRes === null || evalRes === undefined ? '' : String(evalRes)
          } catch {
            replacement = ''
          }
        }
      }
    } else if (runner) {
      try {
        const evalRes = await runner.javascript(sub, context, input)
        replacement = evalRes === null || evalRes === undefined ? '' : String(evalRes)
      } catch {
        replacement = ''
      }
    }
    result = result.replace(m[0], replacement)
  }
  return result
}

export function evaluateRuleString(
  input: string | Document | Element | Record<string, unknown> | unknown[],
  rule: string,
  options?: Partial<RuleExecutionContext>,
): string {
  if (!rule.trim()) return ''
  let targetRule = rule.trim()
  const context = mergedContext(options)

  if (targetRule.includes('{{') && targetRule.includes('}}') && !targetRule.startsWith('@js:') && !targetRule.startsWith('<js>')) {
    const interpolated = interpolateTemplateString(input, targetRule, context)
    const isRule = interpolated.includes('@')
      || interpolated.startsWith('//')
      || interpolated.startsWith('$.')
      || interpolated.startsWith('$[')
      || /^(?:tag|class|id)\./i.test(interpolated)
    if (!isRule) {
      return interpolated
    }
    targetRule = interpolated
  }

  const compiled = compileRule(targetRule)
  const values = evaluateCompiled(input, compiled, context)
  const stringify = (value: RuleNode) => context.compatibilityMode === 'legado'
    && compiled.alternatives.some(segment => segment.mode === 'xpath' || segment.steps?.some(st => st.mode === 'xpath'))
    && value instanceof Element ? value.outerHTML : nodeToString(value)
  return values.map(stringify).filter(Boolean).join('\n')
}

export interface RuleScriptRunner {
  javascript(code: string, context: RuleExecutionContext, input: unknown): Promise<unknown>
  webJavascript(code: string, context: RuleExecutionContext, input: unknown): Promise<unknown>
}

function normalizeScriptValues(value: unknown): RuleNode[] {
  if (value === null || value === undefined) return []
  if (Array.isArray(value)) return value.flatMap(normalizeScriptValues)
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return [value]
  return [value as Record<string, unknown>]
}

async function evaluateCompiledAsync(
  input: string | Document | Element | Record<string, unknown> | unknown[],
  compiled: CompiledRule,
  context: RuleExecutionContext,
  runner?: RuleScriptRunner,
  stringifyBeforeScript = false,
): Promise<RuleNode[]> {
  if (compiled.tree) {
    return evaluateAstNodeAsync(input, compiled.tree, context, runner, stringifyBeforeScript)
  }
  const groups: RuleNode[][] = []
  const errors: RuleExecutionError[] = []
  for (const segment of compiled.alternatives) {
    try {
      const values = await evaluateChainAsync(input, segment, context, runner, stringifyBeforeScript)
      if (values.length > 0) groups.push(values)
      if (compiled.operator === '||' && values.some(value => nodeToString(value).trim())) return values
    } catch (cause) {
      const error = cause instanceof RuleExecutionError ? cause : errorFor(
        `规则执行失败: ${segment.source}`,
        segment.mode === 'webjs' ? 'UNSUPPORTED_WEBJS' : 'UNSUPPORTED_JAVASCRIPT',
        segment, context, cause,
      )
      errors.push(error)
      if (compiled.operator !== '||') throw error
    }
  }
  if (groups.length === 0 && errors.length === compiled.alternatives.length && errors[0]) throw errors[0]
  return compiled.operator === '%%' ? interleave(groups) : groups.flat()
}

export async function evaluateRuleListAsync(
  input: string | Document | Element | Record<string, unknown> | unknown[],
  rule: string,
  options: Partial<RuleExecutionContext>,
  runner?: RuleScriptRunner,
): Promise<RuleNode[]> {
  if (!rule.trim()) return []
  return evaluateCompiledAsync(input, compileRule(rule), mergedContext(options), runner)
}

export async function evaluateRuleStringAsync(
  input: string | Document | Element | Record<string, unknown> | unknown[],
  rule: string,
  options: Partial<RuleExecutionContext>,
  runner?: RuleScriptRunner,
): Promise<string> {
  if (!rule.trim()) return ''
  let targetRule = rule.trim()
  const context = mergedContext(options)

  if (targetRule.includes('{{') && targetRule.includes('}}') && !targetRule.startsWith('@js:') && !targetRule.startsWith('<js>')) {
    const interpolated = await interpolateTemplateStringAsync(input, targetRule, context, runner)
    const isRule = interpolated.includes('@')
      || interpolated.startsWith('//')
      || interpolated.startsWith('$.')
      || interpolated.startsWith('$[')
      || /^(?:tag|class|id)\./i.test(interpolated)
    if (!isRule) {
      return interpolated
    }
    targetRule = interpolated
  }

  const compiled = compileRule(targetRule)
  const values = await evaluateCompiledAsync(
    input, compiled, context, runner, context.compatibilityMode === 'legado',
  )
  const stringify = (value: RuleNode) => context.compatibilityMode === 'legado'
    && compiled.alternatives.some(segment => segment.mode === 'xpath' || segment.steps?.some(st => st.mode === 'xpath'))
    && value instanceof Element ? value.outerHTML : nodeToString(value)
  return values.map(stringify).filter(Boolean).join('\n')
}
