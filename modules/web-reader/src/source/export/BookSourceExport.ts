import type { BookSource } from '@/source/types/BookSource'

const BOOK_SOURCE_FIELDS = [
  'bookSourceUrl',
  'bookSourceName',
  'bookSourceGroup',
  'bookSourceType',
  'bookUrlPattern',
  'customOrder',
  'enabled',
  'enabledExplore',
  'jsLib',
  'enabledCookieJar',
  'concurrentRate',
  'header',
  'loginUrl',
  'loginUi',
  'loginCheckJs',
  'coverDecodeJs',
  'bookSourceComment',
  'variableComment',
  'lastUpdateTime',
  'respondTime',
  'weight',
  'exploreUrl',
  'exploreScreen',
  'ruleExplore',
  'searchUrl',
  'ruleSearch',
  'ruleBookInfo',
  'ruleToc',
  'ruleContent',
  'ruleReview',
  'mainJs',
  'eventListener',
  'customButton',
] as const

const BOOK_LIST_RULE_FIELDS = [
  'bookList',
  'name',
  'author',
  'intro',
  'kind',
  'lastChapter',
  'updateTime',
  'bookUrl',
  'coverUrl',
  'wordCount',
] as const

const RULE_FIELDS: Partial<Record<(typeof BOOK_SOURCE_FIELDS)[number], readonly string[]>> = {
  ruleExplore: BOOK_LIST_RULE_FIELDS,
  ruleSearch: ['checkKeyWord', ...BOOK_LIST_RULE_FIELDS],
  ruleBookInfo: [
    'init', 'name', 'author', 'intro', 'kind', 'lastChapter', 'updateTime',
    'coverUrl', 'tocUrl', 'wordCount', 'canReName', 'downloadUrls',
  ],
  ruleToc: [
    'preUpdateJs', 'chapterList', 'chapterName', 'chapterUrl', 'formatJs',
    'isVolume', 'isVip', 'isPay', 'updateTime', 'nextTocUrl',
  ],
  ruleContent: [
    'content', 'subContent', 'title', 'nextContentUrl', 'webJs', 'sourceRegex',
    'replaceRegex', 'imageStyle', 'imageDecode', 'payAction', 'callBackJs',
  ],
  ruleReview: [
    'reviewUrl', 'avatarRule', 'contentRule', 'postTimeRule', 'reviewQuoteUrl',
    'voteUpUrl', 'voteDownUrl', 'postReviewUrl', 'postQuoteUrl', 'deleteUrl',
    'enabled', 'reviewSummaryUrl', 'summaryListRule', 'summaryParagraphIndexRule',
    'summaryParagraphDataRule', 'summaryCountRule', 'reviewDetailUrl',
    'reviewDetailNextPageUrl', 'detailListRule', 'detailIdRule', 'detailAvatarRule',
    'detailNameRule', 'detailBadgeRule', 'detailContentRule', 'replyListRule',
    'replyIdRule', 'replyAvatarRule', 'replyNameRule', 'replyBadgeRule',
    'replyContentRule',
  ],
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function pickPresentFields(source: Record<string, unknown>, fields: readonly string[]) {
  const result: Record<string, unknown> = {}
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(source, field)) continue
    result[field] = source[field]
  }
  return result
}

/**
 * 生成可由原版 Legado 导入的书源对象。
 *
 * 只保留 Android BookSource 及其规则模型中声明的字段；同时只选择输入对象
 * 实际存在的键，因此不会补写 useWebView、webReaderCompatibilityMode 或缺失的默认值。
 */
export function toLegadoBookSourceJson(source: BookSource): Record<string, unknown> {
  const input = source as Record<string, unknown>
  const result = pickPresentFields(input, BOOK_SOURCE_FIELDS)

  for (const [field, fields] of Object.entries(RULE_FIELDS)) {
    const value = result[field]
    if (isRecord(value)) result[field] = pickPresentFields(value, fields)
  }

  return result
}

/** 与原版 Legado 的书源导出格式一致，即使只有一个书源也使用 JSON 数组。 */
export function serializeLegadoBookSources(sources: BookSource[]): string {
  return `${JSON.stringify(sources.map(toLegadoBookSourceJson), null, 2)}\n`
}

export function createBookSourceJsonFileName(source: BookSource): string {
  let name = source.bookSourceName
    .trim()
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .slice(0, 80)

  if (!name) name = 'book-source'
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = `_${name}`
  return `${name}.json`
}
