/**
 * Legado 书源规则解析器
 */

export interface ParsedRule {
  type: 'css' | 'xpath' | 'jsonpath' | 'regex'
  expression: string
  replacement?: string
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
 * 清理 Legado 简易语法为标准 CSS 选择器
 */
export function normalizeSelector(raw: string): string {
  let s = raw.trim()
  if (s.startsWith('@css:') || s.startsWith('@CSS:')) {
    s = s.substring(5).trim()
  } else if (s.startsWith('@@')) {
    s = s.substring(2).trim()
  }

  // 转换 Legado 简写语法: class.xxx -> .xxx, id.xxx -> #xxx, tag.xxx -> xxx
  s = s.replace(/\bclass\.([\w-]+)/g, '.$1')
  s = s.replace(/\bid\.([\w-]+)/g, '#$1')
  s = s.replace(/\btag\.([\w-]+)/g, '$1')
  s = s.replace(/\bchildren\b/g, '> *')

  return s
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
    trimmed.startsWith('@XPath:')
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

  // 1. 优先判断 XPath 规则（以 //, ./, /, @xpath: 开头）
  const isXPath =
    trimmed.startsWith('//') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('@xpath:') ||
    trimmed.startsWith('@XPath:')

  if (isXPath) {
    try {
      let expr = trimmed.replace(/^@xpath:/i, '').trim()

      // 如果是在子 Element 节点中执行，且以 / 或 // 开头，转为当前节点下查找 .// 或 ./
      if (context instanceof Element && context.ownerDocument) {
        if (expr.startsWith('//')) {
          expr = '.' + expr
        } else if (expr.startsWith('/') && !expr.startsWith('/html') && !expr.startsWith('/body')) {
          expr = '.' + expr
        }
      }

      const doc = context.ownerDocument || (context as unknown as Document)

      // 1.1 如果是取属性 @attr 或 string() 或 text()，优先尝试求字符串值
      if (expr.includes('/@') || expr.endsWith('/text()') || expr.startsWith('string(')) {
        try {
          const strResult = doc.evaluate(expr, context, null, XPathResult.STRING_TYPE, null)
          if (strResult.stringValue && strResult.stringValue.trim()) {
            return strResult.stringValue.trim()
          }
        } catch {}
      }

      // 1.2 尝试获取首个匹配节点（使用 FIRST_ORDERED_NODE_TYPE，避免 UNORDERED_NODE_ITERATOR_TYPE 抛异常）
      try {
        const nodeResult = doc.evaluate(expr, context, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
        const node = nodeResult.singleNodeValue
        if (node) {
          if (node.nodeType === Node.ATTRIBUTE_NODE) {
            return (node as Attr).value?.trim() || ''
          }
          return node.textContent?.trim() || ''
        }
      } catch {}

      // 1.3 尝试 ORDERED_NODE_ITERATOR_TYPE
      try {
        const iterResult = doc.evaluate(expr, context, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null)
        const iterNode = iterResult.iterateNext()
        if (iterNode) {
          if (iterNode.nodeType === Node.ATTRIBUTE_NODE) {
            return (iterNode as Attr).value?.trim() || ''
          }
          return iterNode.textContent?.trim() || ''
        }
      } catch {}
    } catch {}
  }

  // 2. 纯属性提取快捷方式（未带选择器）
  const lower = trimmed.toLowerCase()
  if (lower === 'text' || lower === '@text' || lower === 'textnodes' || lower === 'text()') {
    return context.textContent?.trim() || ''
  }
  if (lower === 'html' || lower === '@html' || lower === 'innerhtml') {
    return context.innerHTML?.trim() || ''
  }
  if (lower === 'href' || lower === '@href') {
    return context.getAttribute('href') || ''
  }
  if (lower === 'src' || lower === '@src') {
    return (
      context.getAttribute('src') ||
      context.getAttribute('data-src') ||
      context.getAttribute('data-original') ||
      context.getAttribute('data-cover') ||
      ''
    )
  }

  // 3. CSS 带 @ 属性提取：如 "h5 a@href" 或 "class.name@text"
  if (trimmed.includes('@') && !isXPath) {
    const lastAtIdx = trimmed.lastIndexOf('@')
    const sel = normalizeSelector(trimmed.substring(0, lastAtIdx).trim())
    const attr = trimmed.substring(lastAtIdx + 1).toLowerCase().trim()

    try {
      const targetEl = sel ? context.querySelector(sel) : context
      if (targetEl) {
        if (attr === 'text' || attr === 'textnodes' || attr === 'text()') {
          return targetEl.textContent?.trim() || ''
        }
        if (attr === 'html' || attr === 'innerhtml') {
          return targetEl.innerHTML?.trim() || ''
        }
        if (attr === 'src') {
          return (
            targetEl.getAttribute('src') ||
            targetEl.getAttribute('data-src') ||
            targetEl.getAttribute('data-original') ||
            targetEl.getAttribute('data-cover') ||
            ''
          )
        }
        if (attr === 'href') {
          return targetEl.getAttribute('href') || ''
        }
        return targetEl.getAttribute(attr) || ''
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
