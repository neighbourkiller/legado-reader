/**
 * Legado 书源规则解析器
 */

export interface ParsedRule {
  type: 'css' | 'xpath' | 'jsonpath' | 'regex'
  expression: string
  replacement?: string
}

/**
 * 移植 Android AnalyzeRule.replaceRegex 的纯正则部分。
 *
 * 支持：
 * - ##match##replacement：全局替换
 * - ##match##replacement###：只取首个匹配结果并替换
 *
 * replaceRegex 还可以包含 Rhino JavaScript 等 Android 专属规则。Web 端没有
 * 等价运行时，对这些规则保持原文，避免静默清空正文。
 */
export function applyTextReplaceRule(content: string, rule?: string): string {
  if (!rule || !rule.includes('##')) return content

  const ruleParts = rule.split('##')
  const leadingRule = ruleParts[0]?.trim() || ''
  if (leadingRule && leadingRule !== 'text' && leadingRule !== '@text') {
    return content
  }

  const patternText = ruleParts[1] || ''
  const replacement = (ruleParts[2] || '').replace(/\$0/g, () => '$&')
  const replaceFirst = ruleParts.length > 3

  let pattern: RegExp
  try {
    let expression = patternText
    let flags = replaceFirst ? '' : 'g'
    const inlineFlags = expression.match(/^\(\?([ims]+)\)/)
    if (inlineFlags) {
      expression = expression.substring(inlineFlags[0].length)
      flags += inlineFlags[1]
    }
    pattern = new RegExp(expression, [...new Set(flags)].join(''))
  } catch {
    if (replaceFirst) return replacement
    return patternText ? content.split(patternText).join(replacement) : content
  }

  if (!replaceFirst) {
    return content.replace(pattern, replacement)
  }

  const match = pattern.exec(content)
  if (!match) return ''
  return match[0].replace(pattern, replacement)
}

/**
 * 将相对 URL 或不完整的 URL 转换为完整的 HTTP/HTTPS 绝对 URL
 */
export function resolveAbsoluteUrl(rawUrl: string, baseUrl?: string): string {
  if (!rawUrl) return ''
  const target = rawUrl.trim()
  if (!target) return ''

  // 1. 已是绝对 URL
  if (/^https?:\/\//i.test(target)) {
    return target
  }

  // 2. 协议相对 URL: //example.com/path
  if (target.startsWith('//')) {
    return 'https:' + target
  }

  // 3. 基于 baseUrl 解析合成
  if (baseUrl) {
    let base = baseUrl.trim()
    if (!base.startsWith('http://') && !base.startsWith('https://')) {
      base = 'https://' + base
    }
    try {
      return new URL(target, base).href
    } catch {
      // 容错拼接
      if (base.endsWith('/') && target.startsWith('/')) {
        return base + target.substring(1)
      } else if (!base.endsWith('/') && !target.startsWith('/')) {
        return base + '/' + target
      } else {
        return base + target
      }
    }
  }

  return target
}

/**
 * 清理书名（去除开头的序号等干扰字符）
 */
export function cleanBookTitle(raw: string): string {
  if (!raw) return ''
  let title = raw.trim()
  // 去除开头的序号，如 "1. "、"1、"、"01 - "、"1 "、"[1] "
  title = title.replace(/^\[?\d+\]?[\.、\s\-]+/, '').trim()
  return title
}

/**
 * 生成稳定的网络书籍唯一 ID
 */
export function generateBookId(name: string, author = '', sourceUrl = ''): string {
  const cleanName = cleanBookTitle(name)
  const raw = `${cleanName}_${author.trim()}_${sourceUrl.trim()}`
  let hash = 0
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i)
    hash |= 0
  }
  return `online_${Math.abs(hash).toString(36)}`
}

/**
 * 清理 Legado 简易语法为标准 CSS 选择器
 */
export function normalizeSelector(raw: string): string {
  let s = raw.trim()
  if (s.startsWith('@css:') || s.startsWith('@CSS:')) {
    s = s.substring(5).trim()
  } else if (s.startsWith('@@')) {
    s = s.substring(2).trim()
  }

  // Legado 使用 @ 连接逐级 DOM 选择器，例如 class.hot_4@tag.li。
  // 属性提取规则会在调用本函数前移除末尾的 @text/@href/@src，
  // 因此这里剩余的 @ 都表示后代层级。
  s = s.replace(/@/g, ' ')

  // 转换 Legado 简写语法: class.xxx -> .xxx, id.xxx -> #xxx, tag.xxx -> xxx
  s = s.replace(/\bclass\.([\w-]+)/g, '.$1')
  s = s.replace(/\bid\.([\w-]+)/g, '#$1')
  s = s.replace(/\btag\.([\w-]+)/g, '$1')
  s = s.replace(/\bchildren\b/g, '> *')

  return s.replace(/\s+/g, ' ').trim()
}

export function parseRuleType(rule: string): ParsedRule {
  const trimmed = rule.trim()

  if (
    trimmed.startsWith('$.') ||
    trimmed.startsWith('$[') ||
    trimmed.startsWith('@json:') ||
    trimmed.startsWith('@Json:')
  ) {
    const expr = trimmed.replace(/^@json:/i, '').trim()
    return { type: 'jsonpath', expression: expr }
  } else if (
    trimmed.startsWith('//') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('@xpath:') ||
    trimmed.startsWith('@XPath:') ||
    trimmed.includes('/@')
  ) {
    const expr = trimmed.replace(/^@xpath:/i, '').trim()
    return { type: 'xpath', expression: expr }
  } else if (trimmed.includes('##')) {
    const parts = trimmed.split('##')
    return { type: 'regex', expression: parts[0], replacement: parts[1] || '' }
  }

  return { type: 'css', expression: normalizeSelector(trimmed) }
}

/**
 * 解析列表规则 (bookList, chapterList 等)
 */
export function parseList(content: string, rule: string, isJson = false): any[] {
  if (!rule) return []

  const subRules = rule.split('||').map(r => r.trim()).filter(Boolean)

  for (const singleRule of subRules) {
    const { type, expression } = parseRuleType(singleRule)

    if (type === 'jsonpath' || isJson) {
      try {
        const obj = typeof content === 'string' ? JSON.parse(content) : content
        const path = expression.replace(/^\$\.?/, '').replace(/^\[/, '').replace(/\]$/, '')
        const list = path.split('.').reduce((acc, curr) => (acc ? acc[curr] : undefined), obj)
        if (Array.isArray(list) && list.length > 0) {
          return list
        }
      } catch {
        // 继续尝试
      }
    }

    if (type === 'xpath') {
      try {
        const parser = new DOMParser()
        const doc = parser.parseFromString(content, 'text/html')
        const expr = expression.replace(/^@xpath:/i, '').trim()
        const iterator = doc.evaluate(expr, doc, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null)
        let node = iterator.iterateNext()
        const result: any[] = []
        while (node) {
          result.push(node)
          node = iterator.iterateNext()
        }
        if (result.length > 0) {
          return result
        }
      } catch {
        // 继续尝试
      }
    }

    if (type === 'css') {
      try {
        const parser = new DOMParser()
        const doc = parser.parseFromString(content, 'text/html')

        let selector = expression
        let excludeIndex: number | null = null
        const excludeMatch = selector.match(/!(\d+)$/)
        if (excludeMatch) {
          excludeIndex = parseInt(excludeMatch[1])
          selector = selector.replace(/!\d+$/, '').trim()
        }

        const elements = Array.from(doc.querySelectorAll(selector))
        if (elements.length > 0) {
          if (excludeIndex !== null && elements.length > excludeIndex) {
            elements.splice(excludeIndex, 1)
          }
          return elements
        }
      } catch {
        // CSS 选择器可能非法，继续下一个备选
      }
    }
  }

  return []
}

/**
 * 解析单条属性/文本规则 (name, author, bookUrl, coverUrl, intro, etc.)
 */
export function parseString(context: any, rule: string): string {
  if (!rule || !context) return ''

  const subRules = rule.split('||').map(r => r.trim()).filter(Boolean)

  for (const singleRule of subRules) {
    const val = parseSingleRuleString(context, singleRule)
    if (val && val.trim()) {
      return val.trim()
    }
  }

  return ''
}

function parseSingleRuleString(context: any, rule: string): string {
  let mainRule = rule.trim()
  let regexReplace: { pattern: RegExp; replacement: string } | null = null

  if (mainRule.includes('##')) {
    const parts = mainRule.split('##')
    mainRule = parts[0].trim()
    if (parts[1] !== undefined) {
      try {
        regexReplace = {
          pattern: new RegExp(parts[1], 'g'),
          replacement: parts[2] || '',
        }
      } catch {}
    }
  }

  let extracted = ''

  // 1. JSONPath / JSON 对象提取
  if (
    mainRule.startsWith('$.') ||
    mainRule.startsWith('$[') ||
    (typeof context === 'object' && !(context instanceof Node) && !context.nodeType)
  ) {
    const path = mainRule.replace(/^\$\.?/, '').replace(/^\[/, '').replace(/\]$/, '')
    try {
      const obj = typeof context === 'string' ? JSON.parse(context) : context
      const res = path.split('.').reduce((acc, curr) => (acc ? acc[curr] : undefined), obj)
      extracted = res !== undefined && res !== null ? String(res) : ''
    } catch {
      extracted = ''
    }
  }
  // 2. DOM Node / Element 提取
  else if (
    context instanceof Element ||
    context instanceof Document ||
    (context && typeof context === 'object' && context.nodeType)
  ) {
    extracted = extractDomString(context as Element, mainRule)
  }
  // 3. 纯文本上下文
  else if (typeof context === 'string') {
    extracted = context
  }

  // 应用正则替换
  if (regexReplace && extracted) {
    extracted = extracted.replace(regexReplace.pattern, regexReplace.replacement)
  }

  return extracted
}

function extractDomString(context: Element, rule: string): string {
  if (!rule) {
    return context.textContent?.trim() || ''
  }

  const trimmed = rule.trim()

  // 1. 快捷属性指令（未带选择器）
  const lower = trimmed.toLowerCase()
  if (lower === 'text' || lower === '@text' || lower === 'textnodes' || lower === 'text()') {
    return context.textContent?.trim() || ''
  }
  if (lower === 'html' || lower === '@html' || lower === 'innerhtml') {
    return context.innerHTML?.trim() || ''
  }
  if (lower === 'href' || lower === '@href') {
    return context.getAttribute('href') || context.querySelector('a')?.getAttribute('href') || ''
  }
  if (lower === 'src' || lower === '@src') {
    return (
      context.getAttribute('src') ||
      context.getAttribute('data-src') ||
      context.getAttribute('data-original') ||
      context.getAttribute('data-cover') ||
      context.querySelector('img')?.getAttribute('src') ||
      ''
    )
  }

  // 2. 伪 XPath / CSS 混合属性提取: 如 "a/@href", "h5 a@href", ".title@text"
  if (
    trimmed.includes('@') &&
    !trimmed.startsWith('//') &&
    !trimmed.startsWith('./') &&
    !trimmed.startsWith('@xpath:')
  ) {
    let sel = ''
    let attr = ''

    if (trimmed.includes('/@')) {
      const idx = trimmed.lastIndexOf('/@')
      sel = normalizeSelector(trimmed.substring(0, idx).trim())
      attr = trimmed.substring(idx + 2).toLowerCase().trim()
    } else {
      const idx = trimmed.lastIndexOf('@')
      sel = normalizeSelector(trimmed.substring(0, idx).trim())
      attr = trimmed.substring(idx + 1).toLowerCase().trim()
    }

    try {
      const targetEl = sel ? context.querySelector(sel) : context
      if (targetEl) {
        if (attr === 'text' || attr === 'textnodes' || attr === 'text()') {
          return targetEl.textContent?.trim() || ''
        }
        if (attr === 'html' || attr === 'innerhtml') {
          return targetEl.innerHTML?.trim() || ''
        }
        if (attr === 'href') {
          return targetEl.getAttribute('href') || targetEl.querySelector('a')?.getAttribute('href') || ''
        }
        if (attr === 'src') {
          return (
            targetEl.getAttribute('src') ||
            targetEl.getAttribute('data-src') ||
            targetEl.getAttribute('data-original') ||
            targetEl.getAttribute('data-cover') ||
            targetEl.querySelector('img')?.getAttribute('src') ||
            ''
          )
        }
        return targetEl.getAttribute(attr) || ''
      }
    } catch {}
  }

  // 3. XPath 规则（以 //, ./, /, @xpath: 开头，或包含 /@）
  const isXPath =
    trimmed.startsWith('//') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('@xpath:') ||
    trimmed.startsWith('@XPath:') ||
    trimmed.includes('/@')

  if (isXPath) {
    try {
      let expr = trimmed.replace(/^@xpath:/i, '').trim()

      if (context instanceof Element && context.ownerDocument) {
        if (expr.startsWith('//')) {
          expr = '.' + expr
        } else if (expr.startsWith('/') && !expr.startsWith('/html') && !expr.startsWith('/body')) {
          expr = '.' + expr
        }
      }

      const doc = context.ownerDocument || (context as unknown as Document)

      // 3.1 如果是提取纯属性 (如 .//a/@href 或 .//@href)
      if (expr.includes('/@') || expr.startsWith('@')) {
        const nodeResult = doc.evaluate(expr, context, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
        const node = nodeResult.singleNodeValue
        if (node) {
          if (node.nodeType === Node.ATTRIBUTE_NODE) {
            return (node as Attr).value?.trim() || ''
          }
          return node.textContent?.trim() || ''
        }
      }

      // 3.2 如果规则以 /text() 结尾，先尝试获取目标父元素的 textContent（避免 em, span 等子节点导致文本截断！）
      if (expr.endsWith('/text()')) {
        const parentExpr = expr.replace(/\/text\(\)$/, '')
        try {
          const parentResult = doc.evaluate(parentExpr, context, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
          const parentNode = parentResult.singleNodeValue
          if (parentNode && parentNode.textContent && parentNode.textContent.trim()) {
            return parentNode.textContent.trim()
          }
        } catch {}

        // 如果没有父节点，迭代所有匹配的 text() 节点并拼接
        try {
          const iterResult = doc.evaluate(expr, context, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null)
          let tNode = iterResult.iterateNext()
          const texts: string[] = []
          while (tNode) {
            if (tNode.textContent) texts.push(tNode.textContent)
            tNode = iterResult.iterateNext()
          }
          if (texts.length > 0) {
            return texts.join('').trim()
          }
        } catch {}
      }

      // 3.3 尝试获取首个匹配节点（返回 textContent）
      const nodeResult = doc.evaluate(expr, context, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
      const node = nodeResult.singleNodeValue
      if (node) {
        if (node.nodeType === Node.ATTRIBUTE_NODE) {
          return (node as Attr).value?.trim() || ''
        }
        return node.textContent?.trim() || ''
      }

      // 3.4 迭代所有节点并拼接（针对多段落/多文本节点）
      const iterResult = doc.evaluate(expr, context, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null)
      let iterNode = iterResult.iterateNext()
      const collected: string[] = []
      while (iterNode) {
        if (iterNode.nodeType === Node.ATTRIBUTE_NODE) {
          collected.push((iterNode as Attr).value || '')
        } else if (iterNode.textContent) {
          collected.push(iterNode.textContent.trim())
        }
        iterNode = iterResult.iterateNext()
      }
      if (collected.length > 0) {
        return collected.filter(Boolean).join('\n')
      }
    } catch {}
  }

  // 4. 普通 CSS 选择器（提取文本）
  try {
    const sel = normalizeSelector(trimmed)
    const el = context.querySelector(sel)
    return el ? el.textContent?.trim() || '' : ''
  } catch {
    return ''
  }
}
