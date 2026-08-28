export interface SearchRule {
  checkKeyWord?: string
  bookList?: string
  name?: string
  author?: string
  bookUrl?: string
  coverUrl?: string
  intro?: string
  kind?: string
  lastChapter?: string
  updateTime?: string
  wordCount?: string
}

export interface BookInfoRule {
  init?: string
  name?: string
  author?: string
  coverUrl?: string
  intro?: string
  tocUrl?: string
  kind?: string
  lastChapter?: string
  updateTime?: string
  wordCount?: string
  canReName?: string
  downloadUrls?: string
}

export interface TocRule {
  preUpdateJs?: string
  chapterList?: string
  chapterName?: string
  chapterUrl?: string
  formatJs?: string
  isVolume?: string
  isVip?: string
  isPay?: string
  updateTime?: string
  nextTocUrl?: string
}

export interface ContentRule {
  content?: string
  subContent?: string
  title?: string
  nextContentUrl?: string
  webJs?: string
  sourceRegex?: string
  replaceRegex?: string
  imageStyle?: string
  imageDecode?: string
  payAction?: string
  callBackJs?: string
}

export interface BookSource {
  bookSourceUrl: string
  bookSourceName: string
  bookSourceGroup?: string
  bookSourceType: number
  enabled: boolean
  isTop?: boolean
  customOrder?: number
  enabledExplore?: boolean
  enabledCookieJar?: boolean
  concurrentRate?: string
  jsLib?: string
  mainJs?: string
  bookUrlPattern?: string
  loginUrl?: string
  loginUi?: string
  loginCheckJs?: string
  coverDecodeJs?: string
  bookSourceComment?: string
  variableComment?: string
  /** 与 Android BaseSource.put/get 对齐的持久化变量。 */
  variableMap?: Record<string, string>
  exploreUrl?: string
  ruleExplore?: Record<string, string | undefined>
  header?: string
  searchUrl?: string
  ruleSearch?: SearchRule
  ruleBookInfo?: BookInfoRule
  ruleToc?: TocRule
  ruleContent?: ContentRule
  /** 是否通过 WebView 通道请求（用于 Cloudflare 保护的书源） */
  useWebView?: boolean
  /** 默认 legado；standard 直接遵循浏览器 XPath 1.0。Android 会忽略此扩展字段。 */
  webReaderCompatibilityMode?: 'legado' | 'standard'
  [key: string]: unknown
}

export interface TextChapterPayload {
  type: 'text'
  text: string
  title?: string
  embeddedImages?: ImageReference[]
}

export interface ImageReference {
  url: string
  index: number
  alt?: string
  mime?: string
  cacheKey?: string
}

export interface ImageChapterPayload {
  type: 'images'
  images: ImageReference[]
  title?: string
  style?: string
  sourceUrl: string
  decodeRule?: string
}

export type OnlineChapterPayload = TextChapterPayload | ImageChapterPayload

export type CompatibilityStatus = 'supported' | 'partial' | 'unsupported'

export interface CompatibilityIssue {
  status: Exclude<CompatibilityStatus, 'supported'>
  code: string
  path: string
  message: string
}

export interface SourceCompatibilityReport {
  status: CompatibilityStatus
  issues: CompatibilityIssue[]
  checkedAt: number
  mode: 'legado' | 'standard'
  verificationStatus?: 'untested' | 'fixture-passed' | 'live-passed'
  engineVersion?: number
  capabilities?: string[]
  stages?: Partial<Record<'search' | 'explore' | 'bookInfo' | 'toc' | 'content' | 'login', {
    status: 'untested' | 'passed' | 'failed' | 'unsupported'
    code?: string
  }>>
}

export interface SearchResult {
  name: string
  author: string
  bookUrl: string
  coverUrl?: string
  intro?: string
  kind?: string
  lastChapter?: string
  updateTime?: string
  wordCount?: string
  variableMap?: Record<string, string>
  sourceName?: string
  sourceUrl?: string
}
