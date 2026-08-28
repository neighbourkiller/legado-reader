/**
 * XPath 到 CSS 转换器
 *
 * 针对 Legado 书源规则中的 XPath 表达式，转换为浏览器原生支持的高性能 CSS 选择器及 Legado 指令。
 * 支持识别并保留 ||、&&、%% 复合逻辑操作符及 ## 正则替换规则。
 * 遇到不安全或无法完全等价转换的高级 XPath 语法（如反向轴、文本包含、父级回溯等）时安全跳过。
 */

import { splitRuleCombination, splitTopLevel } from './RuleCompiler'
import type { BookSource } from '@/source/types/BookSource'

export interface ConvertResult {
  success: boolean
  result: string
  reason?: string
}

export interface RuleConvertDetail {
  field: string
  from: string
  to: string
}

export interface RuleSkipDetail {
  field: string
  rule: string
  reason: string
}

export interface BookSourceConvertSummary {
  source: BookSource
  convertedCount: number
  skippedCount: number
  details: RuleConvertDetail[]
  skipped: RuleSkipDetail[]
}

const UNSAFE_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bpreceding-sibling::/i, reason: '包含反向兄弟轴 preceding-sibling' },
  { pattern: /\bpreceding::/i, reason: '包含反向轴 preceding' },
  { pattern: /\bancestor::/i, reason: '包含祖先轴 ancestor' },
  { pattern: /\bancestor-or-self::/i, reason: '包含祖先轴 ancestor-or-self' },
  { pattern: /\bparent::/i, reason: '包含父级轴 parent' },
  { pattern: /\/\.\.(?:\/|$)/, reason: '包含父节点查找 /..' },
  { pattern: /\bfollowing::/i, reason: '包含跟随轴 following' },
  { pattern: /\bfollowing-sibling::/i, reason: '包含复杂兄弟轴 following-sibling' },
  { pattern: /\b(?:count|position|string-length|local-name|name|sum)\s*\(/i, reason: '包含不支持的 XPath 函数运算' },
  { pattern: /\bcontains\s*\(\s*(?:text\s*\(\s*\)|\.)\s*,/i, reason: '包含元素文本内容过滤 contains(text()/.)' },
  { pattern: /\bstarts-with\s*\(\s*(?:text\s*\(\s*\)|\.)\s*,/i, reason: '包含元素文本内容匹配 starts-with(text()/.)' },
  { pattern: /\[\s*\d+\s*(?:[><=]|!=)/, reason: '包含复杂位置比较运算' },
]

/**
 * 判断单个原子规则表达式是否为 XPath
 */
function isAtomicXPathRule(trimmed: string): boolean {
  if (!trimmed) return false

  // 显式 XPath 前缀
  if (/^@?xpath:/i.test(trimmed)) return true

  // 独立提取指令：text() 或 html()
  if (/^(?:text|html)\(\)$/i.test(trimmed)) return true

  // 独立节点属性提取指令，如 @href, @src (排除 Legado 前缀如 @js:, @css: 及 CSS 规则 .title@href)
  if (/^@(?!js:|json:|css:|put:|get:)[\w-]+$/i.test(trimmed)) return true

  // 路径开头标识：//, .//, ./, /
  if (trimmed.startsWith('//') || trimmed.startsWith('.//') || trimmed.startsWith('./') || trimmed.startsWith('/')) {
    return true
  }

  // 路径中间包含 //, /@ 或 /text(), /html()
  if (trimmed.includes('//') || trimmed.includes('/@') || /\/(?:text|html)\(\)/i.test(trimmed)) {
    return true
  }

  return false
}

/**
 * 判断规则字符串是否包含或本身就是 XPath（全面覆盖前缀、相对路径、属性及复合规则）
 */
export function isXPathRule(rule: string): boolean {
  if (!rule || typeof rule !== 'string') return false
  const trimmed = rule.trim()
  if (!trimmed) return false

  // 若存在 ## 正则替换后缀，先提取主规则部分校验
  const mainPart = trimmed.split('##')[0]?.trim() || ''
  if (!mainPart) return false

  // 若包含 ||、&&、%% 复合逻辑操作符，只要有一项为 XPath 即判定为 XPath 复合规则
  if (mainPart.includes('||') || mainPart.includes('&&') || mainPart.includes('%%')) {
    const segments = mainPart.split(/\s*(?:\|\||&&|%%)\s*/)
    return segments.some(seg => seg && isAtomicXPathRule(seg.trim()))
  }

  return isAtomicXPathRule(mainPart)
}

interface XPathStep {
  combinator: 'descendant' | 'child'
  raw: string
}

/**
 * 状态机拆分 XPath 的各个步骤（避免误切括号与引号内的 /）
 */
function splitXPathSteps(xpath: string): XPathStep[] {
  let clean = xpath.trim()
  if (clean.startsWith('.')) clean = clean.slice(1).trim()

  const steps: XPathStep[] = []
  let inQuote: string | null = null
  let bracketDepth = 0
  let currentStart = 0
  let pendingCombinator: 'descendant' | 'child' = 'descendant'

  let i = 0
  while (i < clean.length) {
    const char = clean[i]

    if (inQuote) {
      if (char === '\\') {
        i += 2
        continue
      }
      if (char === inQuote) {
        inQuote = null
      }
      i++
      continue
    }

    if (char === '"' || char === "'") {
      inQuote = char
      i++
      continue
    }

    if (char === '[') {
      bracketDepth++
      i++
      continue
    }

    if (char === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1)
      i++
      continue
    }

    if (bracketDepth === 0) {
      if (clean.startsWith('//', i)) {
        const segment = clean.slice(currentStart, i).trim()
        if (segment) {
          steps.push({ combinator: pendingCombinator, raw: segment })
        }
        pendingCombinator = 'descendant'
        i += 2
        currentStart = i
        continue
      } else if (char === '/') {
        const segment = clean.slice(currentStart, i).trim()
        if (segment) {
          steps.push({ combinator: pendingCombinator, raw: segment })
        }
        pendingCombinator = 'child'
        i++
        currentStart = i
        continue
      }
    }

    i++
  }

  const remaining = clean.slice(currentStart).trim()
  if (remaining) {
    steps.push({ combinator: pendingCombinator, raw: remaining })
  }

  return steps
}

function parsePredicate(pred: string): string | null {
  const content = pred.trim()
  if (!content) return null

  // 数字索引 [1] -> :first-of-type / :nth-of-type(n)
  if (/^\d+$/.test(content)) {
    const index = parseInt(content, 10)
    if (index === 1) return ':first-of-type'
    if (index > 1) return `:nth-of-type(${index})`
    return null
  }

  if (content === 'last()') {
    return ':last-of-type'
  }

  // [@id='val']
  const idMatch = content.match(/^@id\s*=\s*['"]([^'"]+)['"]$/)
  if (idMatch && idMatch[1]) {
    const idVal = idMatch[1]
    if (/^[a-zA-Z_][\w-]*$/.test(idVal)) return `#${idVal}`
    return `[id="${idVal}"]`
  }

  // [@class='val']
  const classMatch = content.match(/^@class\s*=\s*['"]([^'"]+)['"]$/)
  if (classMatch && classMatch[1]) {
    const classVal = classMatch[1].trim()
    const classes = classVal.split(/\s+/).filter(Boolean)
    if (classes.every(c => /^[a-zA-Z_][\w-]*$/.test(c))) {
      return '.' + classes.join('.')
    }
    return `[class="${classVal}"]`
  }

  // [contains(@class, 'val')]
  const containsClassMatch = content.match(/^contains\s*\(\s*@class\s*,\s*['"]([^'"]+)['"]\s*\)$/)
  if (containsClassMatch && containsClassMatch[1]) {
    const c = containsClassMatch[1].trim()
    if (/^[a-zA-Z_][\w-]*$/.test(c)) {
      return `.${c}`
    }
    return `[class*="${c}"]`
  }

  // [contains(@attr, 'val')]
  const containsAttrMatch = content.match(/^contains\s*\(\s*@([\w:-]+)\s*,\s*['"]([^'"]+)['"]\s*\)$/)
  if (containsAttrMatch && containsAttrMatch[1] && containsAttrMatch[2] !== undefined) {
    return `[${containsAttrMatch[1]}*="${containsAttrMatch[2]}"]`
  }

  // [starts-with(@attr, 'val')]
  const startsWithMatch = content.match(/^starts-with\s*\(\s*@([\w:-]+)\s*,\s*['"]([^'"]+)['"]\s*\)$/)
  if (startsWithMatch && startsWithMatch[1] && startsWithMatch[2] !== undefined) {
    return `[${startsWithMatch[1]}^="${startsWithMatch[2]}"]`
  }

  // [ends-with(@attr, 'val')]
  const endsWithMatch = content.match(/^ends-with\s*\(\s*@([\w:-]+)\s*,\s*['"]([^'"]+)['"]\s*\)$/)
  if (endsWithMatch && endsWithMatch[1] && endsWithMatch[2] !== undefined) {
    return `[${endsWithMatch[1]}$="${endsWithMatch[2]}"]`
  }

  // [@attr='val']
  const attrEqMatch = content.match(/^@([\w:-]+)\s*=\s*['"]([^'"]*)['"]$/)
  if (attrEqMatch && attrEqMatch[1] && attrEqMatch[2] !== undefined) {
    return `[${attrEqMatch[1]}="${attrEqMatch[2]}"]`
  }

  // [@attr!='val']
  const attrNeqMatch = content.match(/^@([\w:-]+)\s*!=\s*['"]([^'"]*)['"]$/)
  if (attrNeqMatch && attrNeqMatch[1] && attrNeqMatch[2] !== undefined) {
    return `:not([${attrNeqMatch[1]}="${attrNeqMatch[2]}"])`
  }

  // [@attr]
  const attrExistsMatch = content.match(/^@([\w:-]+)$/)
  if (attrExistsMatch && attrExistsMatch[1]) {
    return `[${attrExistsMatch[1]}]`
  }

  // [not(@attr)]
  const notAttrMatch = content.match(/^not\s*\(\s*@([\w:-]+)\s*\)$/)
  if (notAttrMatch && notAttrMatch[1]) {
    return `:not([${notAttrMatch[1]}])`
  }

  // [not(contains(@attr, 'val'))]
  const notContainsMatch = content.match(/^not\s*\(\s*contains\s*\(\s*@([\w:-]+)\s*,\s*['"]([^'"]+)['"]\s*\)\s*\)$/)
  if (notContainsMatch && notContainsMatch[1] && notContainsMatch[2] !== undefined) {
    return `:not([${notContainsMatch[1]}*="${notContainsMatch[2]}"])`
  }

  // 处理带有 and 的多重谓词，例如 [@class='a' and @data-id='1']
  if (/\s+and\s+/i.test(content)) {
    const parts = content.split(/\s+and\s+/i)
    const convertedParts = parts.map(p => parsePredicate(p))
    if (convertedParts.every(Boolean)) {
      return convertedParts.join('')
    }
  }

  return null
}

function parseSingleStep(rawStep: string): { cssPart: string; directive?: string } | null {
  const step = rawStep.trim()

  // 终结提取指令
  if (step.toLowerCase() === 'text()') {
    return { cssPart: '', directive: 'text' }
  }
  if (step.toLowerCase() === 'html()') {
    return { cssPart: '', directive: 'html' }
  }
  const attrMatch = step.match(/^@([\w:-]+)$/)
  if (attrMatch && attrMatch[1]) {
    return { cssPart: '', directive: attrMatch[1] }
  }

  // 分离 tag 和各个 [...]
  let inQuote: string | null = null
  let bracketDepth = 0
  let tagEnd = -1
  const predicates: string[] = []
  let predStart = -1

  for (let i = 0; i < step.length; i++) {
    const char = step[i]
    if (inQuote) {
      if (char === inQuote) inQuote = null
      continue
    }
    if (char === '"' || char === "'") {
      inQuote = char
      continue
    }
    if (char === '[') {
      if (bracketDepth === 0) {
        if (tagEnd === -1) tagEnd = i
        predStart = i + 1
      }
      bracketDepth++
      continue
    }
    if (char === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1)
      if (bracketDepth === 0 && predStart !== -1) {
        predicates.push(step.slice(predStart, i))
        predStart = -1
      }
      continue
    }
  }

  const rawTag = (tagEnd === -1 ? step : step.slice(0, tagEnd)).trim()
  let tag = rawTag === '*' ? '' : rawTag

  // 检验 tag 是否合法
  if (tag && !/^[a-zA-Z0-9_-]+$/.test(tag)) {
    return null
  }

  const convertedPreds: string[] = []
  let hasId = false
  for (const pred of predicates) {
    const converted = parsePredicate(pred)
    if (!converted) return null
    if (converted.startsWith('#')) hasId = true
    convertedPreds.push(converted)
  }

  // 优化：如果有 ID，由于 ID 全局唯一，直接省略 tag（例如 //div[@id='content'] -> #content）
  // 优化：如果是通用的 div 容器且带有 class 过滤，省略 div（例如 //div[@class='item'] -> .item）
  if (hasId) {
    tag = ''
  } else if (tag.toLowerCase() === 'div' && convertedPreds.some(p => p.startsWith('.'))) {
    tag = ''
  }

  let cssPart = tag + convertedPreds.join('')
  if (!cssPart && rawTag === '*') {
    cssPart = '*'
  }

  return { cssPart }
}

/**
 * 转换单条纯粹的 XPath 表达式为 CSS + 指令
 */
export function convertSingleXPathToCss(rawXpath: string): ConvertResult {
  let xpath = rawXpath.trim()
  xpath = xpath.replace(/^@?xpath:\s*/i, '')

  if (!xpath) {
    return { success: false, result: rawXpath, reason: 'XPath 表达式为空' }
  }

  // 安全检查
  for (const unsafe of UNSAFE_PATTERNS) {
    if (unsafe.pattern.test(xpath)) {
      return { success: false, result: rawXpath, reason: unsafe.reason }
    }
  }

  const steps = splitXPathSteps(xpath)
  if (steps.length === 0) {
    return { success: false, result: rawXpath, reason: '未能识别出有效的 XPath 路径步骤' }
  }

  let cssSelector = ''
  let directive = ''

  for (let idx = 0; idx < steps.length; idx++) {
    const isLast = idx === steps.length - 1
    const step = steps[idx]!
    const parsed = parseSingleStep(step.raw)

    if (!parsed) {
      return { success: false, result: rawXpath, reason: `无法解析的步骤: ${step.raw}` }
    }

    if (parsed.directive) {
      if (!isLast) {
        return { success: false, result: rawXpath, reason: `提取指令 @${parsed.directive} 必须处于路径末尾` }
      }
      directive = parsed.directive
      break
    }

    if (!parsed.cssPart) {
      return { success: false, result: rawXpath, reason: `步骤未能转换为有效 CSS: ${step.raw}` }
    }

    if (idx === 0) {
      cssSelector = parsed.cssPart
    } else {
      const combinator = step.combinator === 'child' ? ' > ' : ' '
      cssSelector += combinator + parsed.cssPart
    }
  }

  let finalResult = cssSelector.trim()
  if (directive) {
    finalResult = finalResult ? `${finalResult}@${directive}` : `@${directive}`
  }

  if (!finalResult) {
    return { success: false, result: rawXpath, reason: '转换结果为空' }
  }

  return { success: true, result: finalResult }
}

/**
 * 转换支持 Legado 复合逻辑（||, &&, %%）和 ## 正则替换的完整规则
 */
export function convertLegadoRuleXPathToCss(ruleStr: string): {
  changed: boolean
  original: string
  result: string
  reason?: string
} {
  if (!ruleStr || typeof ruleStr !== 'string') {
    return { changed: false, original: ruleStr, result: ruleStr }
  }

  const original = ruleStr.trim()
  if (!isXPathRule(original)) {
    return { changed: false, original, result: original }
  }

  // 1. 拆分组合符（||, &&, %%）
  const combination = splitRuleCombination(original)
  const convertedParts: string[] = []
  let anyConverted = false
  let failReason: string | undefined

  for (const part of combination.parts) {
    // 2. 检查是否有 ## 正则替换后缀
    const replaceSegments = splitTopLevel(part, '##')
    const mainRule = (replaceSegments[0] || '').trim()
    const regexSuffix = replaceSegments.length > 1
      ? '##' + replaceSegments.slice(1).join('##')
      : ''

    if (isXPathRule(mainRule)) {
      const singleRes = convertSingleXPathToCss(mainRule)
      if (singleRes.success) {
        convertedParts.push(singleRes.result + regexSuffix)
        anyConverted = true
      } else {
        // 单个子项无法转换时，保留原样并记录原因
        convertedParts.push(part.trim())
        failReason = singleRes.reason
      }
    } else {
      convertedParts.push(part.trim())
    }
  }

  if (!anyConverted) {
    return {
      changed: false,
      original,
      result: original,
      reason: failReason || '未找到可安全转换的 XPath 片段',
    }
  }

  const operator = combination.operator ? ` ${combination.operator} ` : ''
  const finalJoined = convertedParts.join(operator)

  return {
    changed: finalJoined !== original,
    original,
    result: finalJoined,
    reason: failReason,
  }
}

/**
 * 批量转换书源对象的全部规则字段
 */
export function convertBookSourceXPath(source: BookSource): BookSourceConvertSummary {
  const cloned: BookSource = JSON.parse(JSON.stringify(source))
  const details: RuleConvertDetail[] = []
  const skipped: RuleSkipDetail[] = []

  const targetSections: Array<'ruleSearch' | 'ruleExplore' | 'ruleBookInfo' | 'ruleToc' | 'ruleContent'> = [
    'ruleSearch',
    'ruleExplore',
    'ruleBookInfo',
    'ruleToc',
    'ruleContent',
  ]

  for (const section of targetSections) {
    const sectionObj = cloned[section] as Record<string, any> | undefined
    if (!sectionObj || typeof sectionObj !== 'object') continue

    for (const [key, value] of Object.entries(sectionObj)) {
      // 忽略非选择器字段（例如 JS 脚本、样式等）
      if (['webJs', 'formatJs', 'imageDecode', 'imageStyle'].includes(key)) continue
      if (typeof value !== 'string' || !value.trim()) continue

      const fieldPath = `${section}.${key}`
      if (!isXPathRule(value)) continue

      const conversion = convertLegadoRuleXPathToCss(value)
      if (conversion.changed) {
        sectionObj[key] = conversion.result
        details.push({
          field: fieldPath,
          from: conversion.original,
          to: conversion.result,
        })
      } else if (conversion.reason) {
        skipped.push({
          field: fieldPath,
          rule: conversion.original,
          reason: conversion.reason,
        })
      }
    }
  }

  return {
    source: cloned,
    convertedCount: details.length,
    skippedCount: skipped.length,
    details,
    skipped,
  }
}
