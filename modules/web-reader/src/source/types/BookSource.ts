export interface SearchRule {
  bookList?: string
  name?: string
  author?: string
  bookUrl?: string
  coverUrl?: string
  intro?: string
  kind?: string
  lastChapter?: string
}

export interface BookInfoRule {
  name?: string
  author?: string
  coverUrl?: string
  intro?: string
  tocUrl?: string
}

export interface TocRule {
  chapterList?: string
  chapterName?: string
  chapterUrl?: string
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
  header?: string
  searchUrl?: string
  ruleSearch?: SearchRule
  ruleBookInfo?: BookInfoRule
  ruleToc?: TocRule
  ruleContent?: ContentRule
  /** 是否通过 WebView 通道请求（用于 Cloudflare 保护的书源） */
  useWebView?: boolean
  [key: string]: any
}

export interface SearchResult {
  name: string
  author: string
  bookUrl: string
  coverUrl?: string
  intro?: string
  kind?: string
  lastChapter?: string
  sourceName?: string
  sourceUrl?: string
}
