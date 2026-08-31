import type { BookSource } from '@/source/types/BookSource'

export interface SourceAuthDraft {
  cookie: string
  userAgent: string
  useWebView: boolean
}

export function createSourceAuthDraft(
  source: BookSource | null | undefined,
  defaultUserAgent: string,
): SourceAuthDraft {
  const draft: SourceAuthDraft = {
    cookie: '',
    userAgent: defaultUserAgent,
    useWebView: source?.useWebView ?? false,
  }
  if (!source?.header) return draft

  try {
    const headers = JSON.parse(source.header) as Record<string, unknown>
    const cookie = headers.Cookie ?? headers.cookie
    const userAgent = headers['User-Agent'] ?? headers['user-agent']
    if (typeof cookie === 'string') draft.cookie = cookie
    if (typeof userAgent === 'string') draft.userAgent = userAgent
  } catch {
    // Invalid legacy headers must not retain credentials from the previous source.
  }
  return draft
}
