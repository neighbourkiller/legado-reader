import type { BookSource } from '@/source/types/BookSource'
import { platform } from './capabilities'

export interface CoverRequest { url: string; sourceUrl?: string; referer?: string }
export class CoverLoadError extends Error {
  constructor(message: string, public readonly needsVerification = false) { super(message) }
}

const cache = new Map<string, { blob?: Blob; error?: CoverLoadError; expires: number }>()
const pending = new Map<string, Promise<Blob>>()
const waiting: Array<() => void> = []
let active = 0
let bytes = 0

async function limited<T>(job: () => Promise<T>): Promise<T> {
  if (active >= 3) await new Promise<void>(resolve => waiting.push(resolve))
  else active++
  try { return await job() } finally {
    const next = waiting.shift()
    if (next) next()
    else active--
  }
}

async function findSource(sourceUrl?: string): Promise<BookSource | undefined> {
  if (!platform.isDesktop || !sourceUrl) return undefined
  const { getAllBookSources } = await import('@/storage/db')
  return (await getAllBookSources()).find(source => source.bookSourceUrl === sourceUrl) as BookSource | undefined
}

/** 既验证 MIME，也实际解码；仅通过 HTTP 200 不能证明返回的是图片。 */
export async function validateCover(blob: Blob): Promise<void> {
  if (!blob.size || blob.size > 10 * 1024 * 1024) throw new CoverLoadError('封面为空或超过 10 MiB')
  if (!blob.type.startsWith('image/') && blob.type !== 'application/octet-stream') throw new CoverLoadError('封面响应不是图片')
  const url = URL.createObjectURL(blob)
  try {
    await new Promise<void>((resolve, reject) => {
      const img = new Image()
      const finish = (error?: Error) => {
        clearTimeout(timer)
        img.onload = img.onerror = null
        img.src = ''
        error ? reject(error) : resolve()
      }
      const timer = setTimeout(() => finish(new CoverLoadError('封面解码超时')), 5000)
      img.onload = () => finish(img.naturalWidth && img.naturalHeight ? undefined : new CoverLoadError('封面尺寸无效'))
      img.onerror = () => finish(new CoverLoadError('封面图片无法解码'))
      img.src = url
    })
  } finally { URL.revokeObjectURL(url) }
}

/** 内存只缓存 Blob，不缓存对象 URL；组件负责自己持有的 URL 生命周期。 */
export async function loadSourceCover(request: CoverRequest, refresh = false): Promise<Blob> {
  const source = await findSource(request.sourceUrl)
  if (!source) throw new CoverLoadError('找不到封面所属书源')
  const key = JSON.stringify([request, source.header, source.useWebView, source.enabledCookieJar])
  const cached = cache.get(key)
  if (!refresh && cached && cached.expires > Date.now()) {
    if (cached.blob) return cached.blob
    throw cached.error
  }
  if (pending.has(key)) return pending.get(key)!
  const task = limited(async () => {
    const { SourceEngine, SecurityChallengeError } = await import('@/source/engine/SourceEngine')
    const engine = new SourceEngine()
    if (refresh && source.enabledCookieJar !== false) {
      // 手动完成验证后，将浏览器会话同步给普通 HTTP 通道；WebView 本身仍使用浏览器 Cookie。
      const { getTransport } = await import('@/source/transport')
      try { await (await getTransport()).syncWebviewCookies?.(source.bookSourceUrl, request.referer || source.bookSourceUrl) } catch { /* 同步失败仍允许 WebView 请求 */ }
    }
    let last: CoverLoadError = new CoverLoadError('封面加载失败')
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        // 禁用引擎内部重试，确保一次封面加载最多产生两次图片请求。
        const result = await engine.fetchSourceAsset(source, request.url, request.referer || source.bookSourceUrl,
          { cover: true, retry: 0, timeout: 10000 })
        const blob = new Blob([result.body.buffer.slice(result.body.byteOffset, result.body.byteOffset + result.body.byteLength) as ArrayBuffer], { type: result.mime.toLowerCase() })
        await validateCover(blob)
        remember(key, { blob, expires: Date.now() + 5 * 60 * 1000 })
        return blob
      } catch (error) {
        // UI 使用固定文案，避免异常中的 URL/Cookie 等敏感信息被展示。
        last = new CoverLoadError('封面加载失败', error instanceof SecurityChallengeError || last.needsVerification)
        if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 400))
      }
    }
    remember(key, { error: last, expires: Date.now() + 60000 })
    throw last
  })
  pending.set(key, task)
  try { return await task } finally { pending.delete(key) }
}

function remember(key: string, entry: { blob?: Blob; error?: CoverLoadError; expires: number }) {
  bytes -= cache.get(key)?.blob?.size || 0
  cache.delete(key)
  cache.set(key, entry)
  bytes += entry.blob?.size || 0
  while (cache.size > 64 || bytes > 32 * 1024 * 1024) {
    const oldest = cache.keys().next().value!
    bytes -= cache.get(oldest)?.blob?.size || 0
    cache.delete(oldest)
  }
}

export async function openCoverVerification(sourceUrl: string, referer?: string): Promise<void> {
  const source = await findSource(sourceUrl)
  if (!source) throw new CoverLoadError('找不到书源，请在书源管理中完成网页验证')
  const { getTransport } = await import('@/source/transport')
  const transport = await getTransport()
  if (!transport.openAuthWindow) throw new CoverLoadError('当前环境不支持内置验证窗口')
  await transport.openAuthWindow(sourceUrl, referer || sourceUrl, '封面加载：请完成网页验证后返回重试')
}
