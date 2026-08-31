// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { sanitizeEpubHtml } from './epub-parser'

describe('sanitizeEpubHtml', () => {
  it('removes executable EPUB markup before it reaches v-html', () => {
    const sanitized = sanitizeEpubHtml(`
      <style>body { display: none }</style>
      <script>globalThis.pwned = true</script>
      <svg onload="globalThis.pwned = true"><circle /></svg>
      <img src="javascript:alert(1)" onerror="globalThis.pwned = true" style="display:none">
      <a href="javascript:alert(1)">bad link</a>
      <iframe src="https://example.com"></iframe>
      <p class="chapter">safe text</p>
    `)

    expect(sanitized).not.toMatch(/script|svg|iframe|onerror|onload|javascript:|style=/i)
    expect(sanitized).toContain('<p class="chapter">safe text</p>')
  })

  it('keeps reader-safe links and images created by the EPUB parser', () => {
    const sanitized = sanitizeEpubHtml(`
      <p><a href="#section-2">jump</a></p>
      <img src="blob:https://reader.example/image-id" alt="cover">
      <img src="data:image/png;base64,AAAA" alt="inline">
    `)

    expect(sanitized).toContain('href="#section-2"')
    expect(sanitized).toContain('src="blob:https://reader.example/image-id"')
    expect(sanitized).toContain('src="data:image/png;base64,AAAA"')
  })
})
