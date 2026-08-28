export type DebugInputType = 'search' | 'explore' | 'bookInfo' | 'toc' | 'content'

export interface ParsedDebugInput {
  type: DebugInputType
  raw: string
  payload: {
    keyword?: string
    exploreName?: string
    exploreUrl?: string
    bookUrl?: string
    tocUrl?: string
    chapterUrl?: string
  }
}

export interface ExploreOption {
  title: string
  url: string
  fullKey: string
}

/**
 * 解析调试页输入框内容，对齐 Legado 原项目的调试路由规则：
 * - http(s)://... -> 详情页调试 (bookInfo)
 * - 标题::发现URL -> 发现页调试 (explore)
 * - ++目录URL -> 目录页调试 (toc)
 * - --正文URL -> 正文页调试 (content)
 * - 其他普通文本 -> 关键词搜索调试 (search)
 */
export function parseDebugInput(rawInput: string): ParsedDebugInput {
  const input = (rawInput || '').trim()

  if (input.startsWith('http://') || input.startsWith('https://')) {
    return {
      type: 'bookInfo',
      raw: input,
      payload: {
        bookUrl: input,
      },
    }
  }

  if (input.includes('::')) {
    const idx = input.indexOf('::')
    const exploreName = input.substring(0, idx).trim()
    const exploreUrl = input.substring(idx + 2).trim()
    return {
      type: 'explore',
      raw: input,
      payload: {
        exploreName,
        exploreUrl,
      },
    }
  }

  if (input.startsWith('++')) {
    const tocUrl = input.substring(2).trim()
    return {
      type: 'toc',
      raw: input,
      payload: {
        tocUrl,
      },
    }
  }

  if (input.startsWith('--')) {
    const chapterUrl = input.substring(2).trim()
    return {
      type: 'content',
      raw: input,
      payload: {
        chapterUrl,
      },
    }
  }

  return {
    type: 'search',
    raw: input,
    payload: {
      keyword: input,
    },
  }
}

/**
 * 解析书源配置的 exploreUrl，提取可供用户快捷点击选择的分类列表
 * 支持 JSON 数组和多行/&& 分隔的 `名称::链接` 格式
 */
export function parseExploreUrlOptions(exploreUrl?: string): ExploreOption[] {
  if (!exploreUrl?.trim()) return []

  const text = exploreUrl.trim()

  // 1. 尝试作为 JSON 数组解析
  if (text.startsWith('[') && text.endsWith(']')) {
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) {
        const list: ExploreOption[] = []
        for (const item of parsed) {
          if (item && typeof item === 'object') {
            const title = String(item.title || item.name || '').trim()
            const url = String(item.url || item.path || '').trim()
            if (title && url) {
              list.push({
                title,
                url,
                fullKey: `${title}::${url}`,
              })
            }
          }
        }
        if (list.length > 0) return list
      }
    } catch {
      // JSON 解析失败则回退到文本解析
    }
  }

  // 2. 文本按行或 && 分割解析
  const lines = text.split(/\r?\n|&&/).map(l => l.trim()).filter(Boolean)
  const list: ExploreOption[] = []

  for (const line of lines) {
    if (line.includes('::')) {
      const idx = line.indexOf('::')
      const title = line.substring(0, idx).trim()
      const url = line.substring(idx + 2).trim()
      if (title && url) {
        list.push({
          title,
          url,
          fullKey: `${title}::${url}`,
        })
      }
    }
  }

  return list
}
