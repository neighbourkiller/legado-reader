import JSZip from 'jszip'
import DOMPurify from 'dompurify'
import type { BookChapter, BookMeta, ChapterContentResult, ParsedBook } from './types'

const EPUB_ALLOWED_URI = /^(?:(?:https?|mailto|tel|blob):|data:image\/(?:png|gif|jpe?g|webp);base64,|#|\/|(?:\.\.?\/)*[^:/?#]+(?:[?#].*)?$)/i

interface EpubSpineItem {
  idref: string
  href: string
  title?: string
}

interface EpubManifestItem {
  id: string
  href: string
  mediaType: string
  properties?: string
}

/**
 * Parse an EPUB file into chapters.
 */
export async function parseEpub(file: File): Promise<ParsedBook> {
  const buffer = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(buffer)

  // 1. Read container.xml to find the OPF path
  const containerXml = await readZipText(zip, 'META-INF/container.xml')
  const opfPath = parseContainerXml(containerXml)
  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : ''

  // 2. Read and parse the OPF file
  const opfXml = await readZipText(zip, opfPath)
  const { metadata, manifest, spine } = parseOpf(opfXml)

  // 3. Try to read NCX/Nav for proper chapter titles
  const tocTitles = await parseToc(zip, manifest, opfDir)

  // 4. Build chapter list from spine
  const chapters: BookChapter[] = []
  for (let i = 0; i < spine.length; i++) {
    const spineItem = spine[i]
    const manifestItem = manifest.get(spineItem.idref)
    if (!manifestItem) continue

    const href = resolveHref(opfDir, manifestItem.href)
    const title = tocTitles.get(manifestItem.href)
      ?? tocTitles.get(href)
      ?? spineItem.title
      ?? `第${i + 1}章`

    chapters.push({
      index: chapters.length,
      title,
      href,
    })
  }

  // 5. Extract metadata
  const id = generateId()
  const coverUrl = await extractCover(zip, manifest, opfDir, metadata.coverId)

  const meta: BookMeta = {
    id,
    name: metadata.title || file.name.replace(/\.epub$/i, ''),
    author: metadata.creator || '',
    format: 'epub',
    totalChapters: chapters.length,
    currentChapter: 0,
    currentProgress: 0,
    lastReadTime: Date.now(),
    coverUrl,
    durChapterTitle: chapters[0]?.title || '',
    latestChapterTitle: chapters[chapters.length - 1]?.title || '',
  }

  return { meta, chapters }
}

/**
 * Get chapter content from stored EPUB data.
 * Returns sanitized HTML string and created blob URLs.
 */
export async function getEpubChapterContent(
  fileData: ArrayBuffer,
  chapter: BookChapter,
): Promise<ChapterContentResult> {
  const zip = await JSZip.loadAsync(fileData)
  const href = chapter.href
  if (!href) return { html: '', blobUrls: [] }

  const html = await readZipText(zip, href)
  return extractBodyContent(html, zip, href)
}

// --- Internal helpers ---

async function readZipText(zip: JSZip, path: string): Promise<string> {
  // Try exact path first, then try case-insensitive
  let file = zip.file(path)
  if (!file) {
    // Try without leading slash
    const cleanPath = path.replace(/^\//, '')
    file = zip.file(cleanPath)
  }
  if (!file) {
    // Case-insensitive search
    const lowerPath = path.toLowerCase()
    zip.forEach((relativePath, zipEntry) => {
      if (relativePath.toLowerCase() === lowerPath) {
        file = zipEntry
      }
    })
  }
  if (!file) {
    throw new Error(`File not found in EPUB: ${path}`)
  }
  return file.async('text')
}

function parseContainerXml(xml: string): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'application/xml')
  const rootfile = doc.querySelector('rootfile')
  const fullPath = rootfile?.getAttribute('full-path')
  if (!fullPath) {
    throw new Error('Invalid EPUB: no rootfile found in container.xml')
  }
  return fullPath
}

interface OpfResult {
  metadata: { title: string; creator: string; coverId?: string }
  manifest: Map<string, EpubManifestItem>
  spine: EpubSpineItem[]
}

function parseOpf(xml: string): OpfResult {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'application/xml')

  // Metadata
  const titleEl = doc.querySelector('metadata title, metadata dc\\:title')
  const creatorEl = doc.querySelector('metadata creator, metadata dc\\:creator')
  const title = titleEl?.textContent?.trim() ?? ''
  const creator = creatorEl?.textContent?.trim() ?? ''

  // Cover ID from metadata meta
  let coverId: string | undefined
  const metaEls = doc.querySelectorAll('metadata meta')
  metaEls.forEach(meta => {
    if (meta.getAttribute('name') === 'cover') {
      coverId = meta.getAttribute('content') ?? undefined
    }
  })

  // Manifest
  const manifest = new Map<string, EpubManifestItem>()
  const manifestItems = doc.querySelectorAll('manifest item')
  manifestItems.forEach(item => {
    const id = item.getAttribute('id') ?? ''
    const href = item.getAttribute('href') ?? ''
    const mediaType = item.getAttribute('media-type') ?? ''
    const properties = item.getAttribute('properties') ?? undefined
    manifest.set(id, { id, href, mediaType, properties })
  })

  // Spine
  const spine: EpubSpineItem[] = []
  const spineItems = doc.querySelectorAll('spine itemref')
  spineItems.forEach(item => {
    const idref = item.getAttribute('idref') ?? ''
    const manifestItem = manifest.get(idref)
    spine.push({
      idref,
      href: manifestItem?.href ?? '',
    })
  })

  return { metadata: { title, creator, coverId }, manifest, spine }
}

async function parseToc(
  zip: JSZip,
  manifest: Map<string, EpubManifestItem>,
  opfDir: string,
): Promise<Map<string, string>> {
  const titles = new Map<string, string>()

  // Try NCX first (EPUB 2)
  let ncxItem: EpubManifestItem | undefined
  manifest.forEach(item => {
    if (item.mediaType === 'application/x-dtbncx+xml') {
      ncxItem = item
    }
  })

  if (ncxItem) {
    try {
      const ncxPath = resolveHref(opfDir, ncxItem.href)
      const ncxXml = await readZipText(zip, ncxPath)
      parseNcx(ncxXml, titles)
    } catch { /* ignore */ }
  }

  // Try Nav (EPUB 3)
  let navItem: EpubManifestItem | undefined
  manifest.forEach(item => {
    const isNav = item.properties?.split(/\s+/).includes('nav')
    if (isNav || item.href.toLowerCase().includes('nav')) {
      navItem = item
    }
  })

  if (navItem && titles.size === 0) {
    try {
      const navPath = resolveHref(opfDir, navItem.href)
      const navHtml = await readZipText(zip, navPath)
      parseNav(navHtml, titles)
    } catch { /* ignore */ }
  }

  return titles
}

function parseNcx(xml: string, titles: Map<string, string>) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'application/xml')
  const navPoints = doc.querySelectorAll('navPoint')
  navPoints.forEach(np => {
    const text = np.querySelector('navLabel text')?.textContent?.trim()
    const src = np.querySelector('content')?.getAttribute('src')
    if (text && src) {
      // Remove fragment identifier for matching
      const baseSrc = src.split('#')[0]
      titles.set(baseSrc, text)
      titles.set(src, text)
    }
  })
}

function parseNav(html: string, titles: Map<string, string>) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'application/xhtml+xml')
  const links = doc.querySelectorAll('nav a, nav[epub\\:type="toc"] a')
  links.forEach(a => {
    const text = a.textContent?.trim()
    const href = a.getAttribute('href')
    if (text && href) {
      const baseSrc = href.split('#')[0]
      titles.set(baseSrc, text)
      titles.set(href, text)
    }
  })
}

async function extractCover(
  zip: JSZip,
  manifest: Map<string, EpubManifestItem>,
  opfDir: string,
  coverId?: string,
): Promise<string | undefined> {
  // Find cover image
  let coverItem: EpubManifestItem | undefined

  if (coverId && manifest.has(coverId)) {
    coverItem = manifest.get(coverId)
  }

  if (!coverItem) {
    manifest.forEach(item => {
      if (
        item.properties?.split(/\s+/).includes('cover-image') ||
        (item.id.toLowerCase().includes('cover') && item.mediaType.startsWith('image/'))
      ) {
        coverItem = item
      }
    })
  }

  if (!coverItem) return undefined

  try {
    const coverPath = resolveHref(opfDir, coverItem.href)
    const file = zip.file(coverPath)
    if (!file) return undefined
    const base64 = await file.async('base64')
    const mimeType = coverItem.mediaType || 'image/jpeg'
    return `data:${mimeType};base64,${base64}`
  } catch {
    return undefined
  }
}

/**
 * Extract the <body> content from an XHTML chapter file.
 * Converts internal image references to blob URLs.
 */
async function extractBodyContent(
  html: string,
  zip: JSZip,
  chapterHref: string,
): Promise<ChapterContentResult> {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'application/xhtml+xml')
  const body = doc.querySelector('body')
  const blobUrls: string[] = []
  if (!body) return { html, blobUrls }

  // Resolve image sources to blob URLs
  const images = body.querySelectorAll('img, image')
  const chapterDir = chapterHref.includes('/')
    ? chapterHref.substring(0, chapterHref.lastIndexOf('/') + 1)
    : ''

  for (const img of images) {
    const src = img.getAttribute('src') || img.getAttribute('xlink:href') || img.getAttribute('href')
    if (src && !src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('blob:')) {
      try {
        const imgPath = resolveHref(chapterDir, src)
        const file = zip.file(imgPath)
        if (file) {
          const blob = await file.async('blob')
          const url = URL.createObjectURL(blob)
          blobUrls.push(url)
          if (img.hasAttribute('xlink:href')) {
            img.setAttribute('xlink:href', url)
          } else {
            img.setAttribute('src', url)
          }
        }
      } catch { /* ignore broken images */ }
    }
  }

  return { html: sanitizeEpubHtml(body.innerHTML), blobUrls }
}

/**
 * EPUB chapters are untrusted documents. Keep reader-safe structural HTML while
 * removing executable markup, inline CSS and unsafe resource protocols before v-html.
 */
export function sanitizeEpubHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['base', 'button', 'embed', 'form', 'iframe', 'input', 'link', 'meta', 'object', 'option', 'select', 'style', 'textarea'],
    FORBID_ATTR: ['formaction', 'srcset', 'style'],
    ALLOWED_URI_REGEXP: EPUB_ALLOWED_URI,
  })
}

function resolveHref(base: string, href: string): string {
  if (href.startsWith('/')) return href.slice(1)
  if (!base) return href

  // Simple relative path resolution
  const parts = (base + href).split('/')
  const resolved: string[] = []
  for (const part of parts) {
    if (part === '..') {
      resolved.pop()
    } else if (part !== '.' && part !== '') {
      resolved.push(part)
    }
  }
  return resolved.join('/')
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
