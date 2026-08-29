import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { BookSource, SourceCompatibilityReport } from '@/source/types/BookSource'
import {
  getAllBookSources,
  saveBookSource,
  deleteBookSource as deleteBookSourceFromDB,
  importBookSources as importBookSourcesToDB,
  getAllReplaceRules,
  saveReplaceRule,
} from '@/storage/db'
import { getTransport } from '@/source/transport'
import { getDefaultUserAgent } from '@/source/engine/SourceEngine'
import { applyRulesToSourceJson, ReplacementTimeoutError } from '@/utils/replaceRules'
import { inspectSourceCompatibility } from '@/source/engine/Compatibility'

export interface SourceImportPreview {
  original: Record<string, unknown>[]
  replaced: Record<string, unknown>[]
  changed: number
  errors: Array<{ name: string; message: string }>
  originalCompatibility: SourceCompatibilityReport[]
  replacedCompatibility: SourceCompatibilityReport[]
}

export interface SourceImportResult {
  total: number
  unique: number
  duplicates: number
  changed: number
  replacementErrors: number
}

export const useBookSourceStore = defineStore('bookSource', () => {
  const sources = ref<BookSource[]>([])
  const isLoading = ref(false)

  function sortSources(list: BookSource[]): BookSource[] {
    return [...list].sort((a, b) => {
      const topA = a.isTop ? 1 : 0
      const topB = b.isTop ? 1 : 0
      if (topA !== topB) {
        return topB - topA
      }
      const orderA = a.customOrder ?? 0
      const orderB = b.customOrder ?? 0
      if (orderA !== orderB) {
        return orderB - orderA
      }
      return 0
    })
  }

  async function loadSources() {
    isLoading.value = true
    try {
      const raw = await getAllBookSources()
      sources.value = sortSources(raw as unknown as BookSource[])
    } finally {
      isLoading.value = false
    }
  }

  async function addSource(source: BookSource) {
    await saveBookSource(normalizeSourceGroup(source) as unknown as Record<string, unknown>)
    await loadSources()
  }

  function normalizeSourceGroup(source: BookSource): BookSource {
    const group = source.bookSourceGroup?.trim()
    if (group) return { ...source, bookSourceGroup: group }

    const { bookSourceGroup: _bookSourceGroup, ...sourceWithoutGroup } = source
    return sourceWithoutGroup
  }

  async function deleteSource(bookSourceUrl: string) {
    await deleteBookSourceFromDB(bookSourceUrl)
    sources.value = sources.value.filter(s => s.bookSourceUrl !== bookSourceUrl)
  }

  async function deleteAllSources() {
    for (const source of sources.value) {
      await deleteBookSourceFromDB(source.bookSourceUrl)
    }
    sources.value = []
  }

  function parseSources(jsonText: string): Record<string, unknown>[] {
    let parsed: unknown
    const trimmed = jsonText.trim()
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      // 尝试提取 JSON 数组或对象（去除首尾多余非 JSON 字符）
      const firstBracket = trimmed.indexOf('[')
      const firstBrace = trimmed.indexOf('{')
      let start = -1
      if (firstBracket !== -1 && firstBrace !== -1) {
        start = Math.min(firstBracket, firstBrace)
      } else {
        start = Math.max(firstBracket, firstBrace)
      }
      if (start !== -1) {
        const lastBracket = trimmed.lastIndexOf(']')
        const lastBrace = trimmed.lastIndexOf('}')
        const end = Math.max(lastBracket, lastBrace)
        if (end > start) {
          parsed = JSON.parse(trimmed.slice(start, end + 1))
        } else {
          parsed = JSON.parse(trimmed.slice(start))
        }
      } else {
        throw new Error('无效的 JSON 格式')
      }
    }

    const rawList = Array.isArray(parsed) ? parsed : [parsed]
    const validList = rawList
      .filter((s): s is Record<string, unknown> => Boolean(
        s && typeof s === 'object' && 'bookSourceName' in s && s.bookSourceName,
      ))
      .map(s => {
        const source = { ...s } as Record<string, unknown>
        if (!source.bookSourceUrl || typeof source.bookSourceUrl !== 'string' || !source.bookSourceUrl.trim()) {
          source.bookSourceUrl = `source_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        }
        if (source.enabled === undefined) {
          source.enabled = true
        }
        return source
      })

    if (validList.length === 0) {
      throw new Error('数据中未包含有效的书源规则对象')
    }

    return validList
  }

  async function previewSourceImport(jsonText: string): Promise<SourceImportPreview> {
    const original = parseSources(jsonText)
    const rules = await getAllReplaceRules()
    const replaced: Record<string, unknown>[] = []
    const errors: SourceImportPreview['errors'] = []
    let changed = 0
    for (const source of original) {
      try {
        const result = await applyRulesToSourceJson(source, rules)
        replaced.push(result)
        if (JSON.stringify(result) !== JSON.stringify(source)) changed += 1
      } catch (error) {
        if (error instanceof ReplacementTimeoutError) {
          await saveReplaceRule({ ...error.rule, isEnabled: false }).catch(console.error)
        }
        replaced.push(source)
        errors.push({
          name: String(source.bookSourceName || source.bookSourceUrl || '未命名书源'),
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }
    return {
      original, replaced, changed, errors,
      originalCompatibility: original.map(source => inspectSourceCompatibility(source as unknown as BookSource)),
      replacedCompatibility: replaced.map(source => inspectSourceCompatibility(source as unknown as BookSource)),
    }
  }

  async function importPreparedSources(
    preview: SourceImportPreview,
    useReplacement: boolean,
    sourceGroup?: string,
  ): Promise<SourceImportResult> {
    if (useReplacement && preview.errors.length > 0) {
      throw new Error(`有 ${preview.errors.length} 条书源替换失败，请改为导入原始书源或修正规则`)
    }
    const validList = useReplacement ? preview.replaced : preview.original
    const group = sourceGroup?.trim()
    const sourcesToImport = group
      ? validList.map(source => ({ ...source, bookSourceGroup: group }))
      : validList
    const uniqueCount = await importBookSourcesToDB(sourcesToImport)
    await loadSources()
    return {
      total: sourcesToImport.length,
      unique: uniqueCount,
      duplicates: sourcesToImport.length - uniqueCount,
      changed: useReplacement ? preview.changed : 0,
      replacementErrors: preview.errors.length,
    }
  }

  async function importSources(jsonText: string, useReplacement = true): Promise<SourceImportResult> {
    return importPreparedSources(await previewSourceImport(jsonText), useReplacement)
  }

  async function fetchSourceText(url: string): Promise<string> {
    const targetUrl = url.trim()
    if (!targetUrl || (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://'))) {
      throw new Error('请输入以 http:// 或 https:// 开头的有效链接')
    }

    const transport = await getTransport()
    const res = await transport.request({
      sourceId: 'book_source_import_url',
      url: targetUrl,
      method: 'GET',
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': getDefaultUserAgent(),
      },
      timeout: 30000,
    })

    if (res.status < 200 || res.status >= 300) {
      throw new Error(`网络请求失败 (HTTP ${res.status})`)
    }
    return new TextDecoder(res.charset || 'utf-8').decode(res.body)
  }

  async function previewSourceImportFromUrl(url: string): Promise<SourceImportPreview> {
    return previewSourceImport(await fetchSourceText(url))
  }

  async function importSourcesFromUrl(url: string, useReplacement = true): Promise<SourceImportResult> {
    return importSources(await fetchSourceText(url), useReplacement)
  }

  async function toggleSource(bookSourceUrl: string) {
    const source = sources.value.find(s => s.bookSourceUrl === bookSourceUrl)
    if (!source) return
    source.enabled = !source.enabled
    await saveBookSource(source as unknown as Record<string, unknown>)
  }

  async function setAllSourcesEnabled(enabled: boolean) {
    for (const source of sources.value) {
      source.enabled = enabled
      await saveBookSource(source as unknown as Record<string, unknown>)
    }
  }

  async function setSourcesEnabled(bookSourceUrls: string[], enabled: boolean) {
    const targets = new Set(bookSourceUrls)
    for (const source of sources.value) {
      if (!targets.has(source.bookSourceUrl)) continue
      source.enabled = enabled
      await saveBookSource(source as unknown as Record<string, unknown>)
    }
  }

  async function deleteSources(bookSourceUrls: string[]) {
    const targets = new Set(bookSourceUrls)
    for (const bookSourceUrl of targets) {
      await deleteBookSourceFromDB(bookSourceUrl)
      sources.value = sources.value.filter(source => source.bookSourceUrl !== bookSourceUrl)
    }
  }

  function getEnabledSources(): BookSource[] {
    return sources.value.filter(s => s.enabled)
  }

  async function updateSource(source: BookSource, originalUrl?: string) {
    if (originalUrl && originalUrl !== source.bookSourceUrl) {
      await deleteBookSourceFromDB(originalUrl)
    }
    await saveBookSource(normalizeSourceGroup(source) as unknown as Record<string, unknown>)
    await loadSources()
  }

  async function toggleTopSource(bookSourceUrl: string) {
    const source = sources.value.find(s => s.bookSourceUrl === bookSourceUrl)
    if (!source) return
    source.isTop = !source.isTop
    source.customOrder = source.isTop ? Date.now() : 0
    await saveBookSource(source as unknown as Record<string, unknown>)
    sources.value = sortSources([...sources.value])
  }

  async function setCompatibilityMode(bookSourceUrl: string, mode: 'legado' | 'standard') {
    const source = sources.value.find(item => item.bookSourceUrl === bookSourceUrl)
    if (!source) return
    source.webReaderCompatibilityMode = mode
    await saveBookSource(source as unknown as Record<string, unknown>)
  }

  return {
    sources,
    isLoading,
    loadSources,
    addSource,
    updateSource,
    toggleTopSource,
    setCompatibilityMode,
    deleteSource,
    deleteAllSources,
    importSources,
    importSourcesFromUrl,
    previewSourceImport,
    previewSourceImportFromUrl,
    importPreparedSources,
    toggleSource,
    setAllSourcesEnabled,
    setSourcesEnabled,
    deleteSources,
    getEnabledSources,
  }
})
