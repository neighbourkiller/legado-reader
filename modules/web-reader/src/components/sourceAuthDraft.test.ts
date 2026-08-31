import { describe, expect, it } from 'vitest'
import type { BookSource } from '@/source/types/BookSource'
import { createSourceAuthDraft } from './sourceAuthDraft'

function source(overrides: Partial<BookSource>): BookSource {
  return {
    bookSourceName: 'test',
    bookSourceType: 0,
    bookSourceUrl: 'https://example.com',
    enabled: true,
    ...overrides,
  }
}

describe('createSourceAuthDraft', () => {
  it('does not carry a previous source cookie into a source without headers', () => {
    const first = createSourceAuthDraft(
      source({ header: JSON.stringify({ Cookie: 'session=source-a' }) }),
      'default-UA',
    )
    const second = createSourceAuthDraft(source({ bookSourceUrl: 'https://other.example' }), 'default-UA')

    expect(first.cookie).toBe('session=source-a')
    expect(second).toEqual({ cookie: '', userAgent: 'default-UA', useWebView: false })
  })

  it('resets credentials when a legacy header is invalid', () => {
    expect(createSourceAuthDraft(source({ header: '{invalid' }), 'default-UA').cookie).toBe('')
  })
})
