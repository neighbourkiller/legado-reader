import {
  type ChainedStep,
  type CompiledRule,
  type CompiledRuleNode,
  type IndexSpec,
  type RuleCombineOperator,
  type RuleMode,
  RuleExecutionError,
  type RuleSegment,
  type TextReplaceRule,
} from './RuleTypes'

export const VALUE_DIRECTIVES = new Set(['text', 'textnodes', 'owntext', 'html', 'all'])

export function isValueDirective(step: string): boolean {
  const lower = step.trim().replace(/^@/, '').toLowerCase()
  if (VALUE_DIRECTIVES.has(lower)) return true
  // 选择器前缀不是属性指令
  if (/^(?:tag|class|id|text|children)\./i.test(lower) || lower === 'children') return false
  // 包含选择器语法符号的不是属性指令
  if (/[!:[\]#.*>+~]/.test(lower)) return false
  // 允许任意合法 HTML 属性名（包含 data-*、alt、title、aria-* 等）
  return /^[a-z_][\w:-]*$/i.test(lower)
}

export function extractIndexSpec(step: string): { selector: string; spec?: IndexSpec } {
  const bracket = step.match(/^(.*?)\[(!)?(-?\d+(?::-?\d+)*(?:\s*,\s*-?\d+(?::-?\d+)*)*)\]\s*$/)
  if (bracket) {
    return {
      selector: (bracket[1] || '').trim(),
      spec: {
        exclude: bracket[2] === '!',
        tokens: (bracket[3] || '').split(',').map(item => item.trim()).filter(Boolean),
      },
    }
  }

  const legacy = step.match(/^(.*?)([!.])(-?\d+(?::-?\d+)*)\s*$/)
  if (legacy && legacy[1]) {
    return {
      selector: legacy[1].trim(),
      spec: {
        exclude: legacy[2] === '!',
        tokens: (legacy[3] || '').split(':').filter(Boolean),
      },
    }
  }
  return { selector: step.trim() }
}

interface ScanState {
  quote: string
  escaped: boolean
  round: number
  square: number
  curly: number
  tag: 'js' | 'webjs' | 'inline' | null
}

function createScanState(): ScanState {
  return { quote: '', escaped: false, round: 0, square: 0, curly: 0, tag: null }
}

function advanceScanState(text: string, index: number, state: ScanState): number {
  if (state.tag) {
    if (state.tag === 'inline') return 0
    const close = state.tag === 'js' ? '</js>' : '</webjs>'
    if (text.startsWith(close, index)) {
      state.tag = null
      return close.length - 1
    }
    return 0
  }

  if (!state.quote && text.startsWith('<webjs>', index)) {
    state.tag = 'webjs'
    return '<webjs>'.length - 1
  }
  if (!state.quote && text.startsWith('<js>', index)) {
    state.tag = 'js'
    return '<js>'.length - 1
  }
  if (!state.quote && /^@(?:web)?js:/i.test(text.slice(index))) {
    state.tag = 'inline'
    return 0
  }

  const char = text[index] || ''
  if (state.quote) {
    if (state.escaped) {
      state.escaped = false
    } else if (char === '\\') {
      state.escaped = true
    } else if (char === state.quote) {
      state.quote = ''
    }
    return 0
  }

  if (char === '"' || char === "'" || char === '`') {
    state.quote = char
  } else if (char === '(') state.round += 1
  else if (char === ')') state.round = Math.max(0, state.round - 1)
  else if (char === '[') state.square += 1
  else if (char === ']') state.square = Math.max(0, state.square - 1)
  else if (char === '{') state.curly += 1
  else if (char === '}') state.curly = Math.max(0, state.curly - 1)
  return 0
}

function isTopLevel(state: ScanState): boolean {
  return !state.quote && !state.tag && state.round === 0 && state.square === 0 && state.curly === 0
}

export function splitTopLevel(text: string, separator: string): string[] {
  const result: string[] = []
  const state = createScanState()
  let start = 0
  for (let index = 0; index < text.length; index += 1) {
    if (isTopLevel(state) && text.startsWith(separator, index)) {
      result.push(text.slice(start, index))
      index += separator.length - 1
      start = index + 1
      continue
    }
    index += advanceScanState(text, index, state)
  }
  result.push(text.slice(start))
  return result
}

export function splitChainSteps(text: string): string[] {
  const result: string[] = []
  const state = createScanState()
  let start = 0

  for (let index = 0; index < text.length; index += 1) {
    if (isTopLevel(state) && text[index] === '@') {
      if (index === start) {
        index += advanceScanState(text, index, state)
        continue
      }
      // 避免误切 XPath /@attribute 或 /@* 轴
      if (index > 0 && text[index - 1] === '/') {
        index += advanceScanState(text, index, state)
        continue
      }

      // 避免误切 @get: 或 @put: 内嵌变量指令
      if (/^@(?:get|put):/i.test(text.slice(index))) {
        index += advanceScanState(text, index, state)
        continue
      }

      // 如果是 @@ 连续且后跟模式关键词，例如 .item@@xpath:
      let sepEnd = index + 1
      if (text.startsWith('@@', index) && /^(?:@?(?:css|xpath|json|regex|js|webjs|put|get):)/i.test(text.slice(index + 1))) {
        sepEnd = index + 1
      }

      const part = text.slice(start, index).trim()
      if (part) {
        result.push(part)
      }
      start = sepEnd
      index = sepEnd - 1
      continue
    }
    index += advanceScanState(text, index, state)
  }

  const remaining = text.slice(start).trim()
  if (remaining) {
    result.push(remaining)
  }
  return result
}

export function splitRuleCombination(rule: string): {
  operator?: RuleCombineOperator
  parts: string[]
} {
  if (/^\s*@(?:web)?js:/i.test(rule)) return { parts: [rule] }
  const state = createScanState()
  let first: { index: number; operator: RuleCombineOperator } | undefined
  for (let index = 0; index < rule.length; index += 1) {
    if (isTopLevel(state)) {
      const operator = (['&&', '||', '%%'] as RuleCombineOperator[])
        .find(candidate => rule.startsWith(candidate, index))
      if (operator) {
        first = { index, operator }
        break
      }
    }
    index += advanceScanState(rule, index, state)
  }
  if (!first) return { parts: [rule] }
  return {
    operator: first.operator,
    parts: splitTopLevel(rule, first.operator),
  }
}

function splitReplacement(rule: string): {
  expression: string
  replacePattern?: string
  replacement?: string
  replaceFirst?: boolean
} {
  const parts = splitTopLevel(rule, '##')
  if (parts.length === 1) return { expression: rule.trim() }
  return {
    expression: (parts[0] || '').trim(),
    replacePattern: parts[1] || '',
    replacement: parts[2] || '',
    replaceFirst: parts.length > 3,
  }
}

export function detectMode(expression: string): { mode: RuleMode; expression: string } {
  const trimmed = expression.trim()
  if (/^@?css:/i.test(trimmed)) return { mode: 'css', expression: trimmed.replace(/^@?css:/i, '').trim() }
  if (trimmed.startsWith('@@')) return { mode: 'default', expression: trimmed.slice(2).trim() }
  if (/^@?xpath:/i.test(trimmed)) return { mode: 'xpath', expression: trimmed.replace(/^@?xpath:/i, '').trim() }
  if (/^@?json:/i.test(trimmed)) return { mode: 'json', expression: trimmed.replace(/^@?json:/i, '').trim() }
  if (/^@?regex:/i.test(trimmed)) return { mode: 'regex', expression: trimmed.replace(/^@?regex:/i, '').trim() }
  if (/^@?webjs:/i.test(trimmed)) return { mode: 'webjs', expression: trimmed.replace(/^@?webjs:/i, '').trim() }
  if (/^@?js:/i.test(trimmed)) return { mode: 'js', expression: trimmed.replace(/^@?js:/i, '').trim() }
  if (trimmed.startsWith('<webjs>') && trimmed.endsWith('</webjs>')) {
    return { mode: 'webjs', expression: trimmed.slice(7, -8).trim() }
  }
  if (trimmed.startsWith('<js>') && trimmed.endsWith('</js>')) {
    return { mode: 'js', expression: trimmed.slice(4, -5).trim() }
  }
  if (trimmed.startsWith('$.') || trimmed.startsWith('$[') || trimmed.startsWith('$')) {
    return { mode: 'json', expression: trimmed }
  }
  if (trimmed.startsWith('/') || trimmed.startsWith('./')) {
    return { mode: 'xpath', expression: trimmed }
  }
  if (trimmed.startsWith(':')) {
    return { mode: 'regex', expression: trimmed.slice(1).trim() }
  }
  return { mode: 'default', expression: trimmed }
}

export function compileChainedStep(stepStr: string, isLastStep: boolean): ChainedStep {
  let step = stepStr.trim()
  const putRules: Record<string, string> = {}
  step = step.replace(/@put:(\{[^}]+\})/gi, (match, json: string) => {
    try {
      const parsed = JSON.parse(json) as Record<string, unknown>
      for (const [k, v] of Object.entries(parsed)) putRules[k] = String(v)
      return ''
    } catch (err) {
      throw new RuleExecutionError(`@put JSON 规则解析失败: ${json}`, {
        code: 'INVALID_RULE',
        rule: stepStr,
        mode: 'legado',
        cause: err,
      })
    }
  })

  const replacement = splitReplacement(step)
  let replaceRules: TextReplaceRule[] | undefined
  if (replacement.replacePattern !== undefined) {
    replaceRules = [{
      pattern: replacement.replacePattern,
      replacement: replacement.replacement || '',
      replaceFirst: replacement.replaceFirst,
    }]
  }

  const detected = detectMode(replacement.expression)
  let directive: string | undefined
  let spec: IndexSpec | undefined
  let expression = detected.expression

  let bracketSyntax: boolean | undefined
  if (detected.mode === 'default') {
    const rawExpr = expression.startsWith('@') && !expression.startsWith('@@') ? expression.slice(1) : expression
    const lower = rawExpr.toLowerCase()
    if (VALUE_DIRECTIVES.has(lower) || (isLastStep && isValueDirective(rawExpr))) {
      directive = rawExpr
      expression = rawExpr
    } else {
      const isBracket = /\[[!\d\s,-]/.test(expression)
      const extracted = extractIndexSpec(expression)
      expression = extracted.selector
      spec = extracted.spec
      bracketSyntax = isBracket
    }
  } else if (detected.mode === 'css') {
    const isBracket = /\[[!\d\s,-]/.test(expression)
    const extracted = extractIndexSpec(expression)
    if (extracted.spec) {
      expression = extracted.selector
      spec = extracted.spec
      bracketSyntax = isBracket
    }
  }

  return {
    raw: stepStr,
    mode: detected.mode,
    expression,
    spec,
    bracketSyntax,
    directive,
    replaceRules,
    putRules: Object.keys(putRules).length > 0 ? putRules : undefined,
  }
}

export function compileRuleSegment(source: string): RuleSegment {
  const putRules: Record<string, string> = {}
  const withoutPut = source.replace(/@put:(\{[^}]+\})/gi, (match, json: string) => {
    try {
      const parsed = JSON.parse(json) as Record<string, unknown>
      for (const [key, value] of Object.entries(parsed)) putRules[key] = String(value)
      return ''
    } catch (err) {
      throw new RuleExecutionError(`@put JSON 规则解析失败: ${json}`, {
        code: 'INVALID_RULE',
        rule: source,
        mode: 'legado',
        cause: err,
      })
    }
  })

  const replacement = splitReplacement(withoutPut)
  const detected = detectMode(replacement.expression)
  const rawSteps = splitChainSteps(replacement.expression)
  const steps: ChainedStep[] = rawSteps.map((s, idx) => compileChainedStep(s, idx === rawSteps.length - 1))

  const primaryMode = steps[0]?.mode || detected.mode

  return {
    source,
    mode: primaryMode,
    expression: detected.expression,
    steps,
    replacePattern: replacement.replacePattern,
    replacement: replacement.replacement,
    replaceFirst: replacement.replaceFirst,
    putRules: Object.keys(putRules).length > 0 ? putRules : undefined,
  }
}

function splitTopLevelBinary(
  text: string,
  operators: RuleCombineOperator[],
): { operator: RuleCombineOperator; parts: string[] } | null {
  if (/^\s*@?(?:web)?js:/i.test(text)) {
    return null
  }
  const state = createScanState()
  for (let i = 0; i < text.length; i++) {
    if (isTopLevel(state)) {
      const matched = operators.find(op => text.startsWith(op, i))
      if (matched) {
        return {
          operator: matched,
          parts: splitTopLevel(text, matched),
        }
      }
    }
    i += advanceScanState(text, i, state)
  }
  return null
}

function hasMatchingOuterParens(text: string): boolean {
  if (!text.startsWith('(') || !text.endsWith(')')) return false
  const state = createScanState()
  for (let i = 0; i < text.length; i++) {
    advanceScanState(text, i, state)
    if (state.round === 0 && i < text.length - 1) {
      return false
    }
  }
  return state.round === 0
}

export function parseRuleAst(rule: string): CompiledRuleNode {
  const trimmed = rule.trim()
  if (!trimmed) {
    const emptySeg: RuleSegment = { source: '', mode: 'default', expression: '', steps: [] }
    return { type: 'chain', segment: emptySeg, children: [] }
  }

  // 1. 顶层低优先级复合操作符: '||' (OR)
  const orSplit = splitTopLevelBinary(trimmed, ['||'])
  if (orSplit && orSplit.parts.length > 1) {
    return {
      type: 'combination',
      operator: '||',
      children: orSplit.parts.map(part => parseRuleAst(part.trim())),
    }
  }

  // 2. 顶层高优先级复合操作符: '&&' (AND) 与 '%%' (Interleave)
  const andOrInterleaveSplit = splitTopLevelBinary(trimmed, ['&&', '%%'])
  if (andOrInterleaveSplit && andOrInterleaveSplit.parts.length > 1) {
    return {
      type: 'combination',
      operator: andOrInterleaveSplit.operator,
      children: andOrInterleaveSplit.parts.map(part => parseRuleAst(part.trim())),
    }
  }

  // 3. 顶层完整括号消除: ( <expr> )
  if (hasMatchingOuterParens(trimmed)) {
    return parseRuleAst(trimmed.slice(1, -1).trim())
  }

  // 4. 单一链式规则 (Chain of steps)
  const segment = compileRuleSegment(trimmed)
  return {
    type: 'chain',
    segment,
    children: (segment.steps || []).map(st => ({
      type: 'step',
      step: st,
    })),
  }
}

function collectAllSegments(node: CompiledRuleNode): RuleSegment[] {
  if (node.type === 'chain' && node.segment) {
    return [node.segment]
  }
  if (node.children && node.children.length > 0) {
    return node.children.flatMap(collectAllSegments)
  }
  return []
}

export function compileRule(rule: string): CompiledRule {
  const ast = parseRuleAst(rule)

  // 根节点保持为 combination 以兼容旧有接口和测试
  let rootTree: CompiledRuleNode
  if (ast.type === 'combination') {
    rootTree = ast
  } else {
    rootTree = {
      type: 'combination',
      operator: undefined,
      children: [ast],
    }
  }

  const alternatives = collectAllSegments(rootTree).filter(item => item.source)

  return {
    source: rule,
    operator: rootTree.operator,
    alternatives,
    tree: rootTree,
  }
}

export function splitLegacyChain(rule: string): string[] {
  return splitChainSteps(rule)
}
