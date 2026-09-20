import type { ReaderViewportBounds } from './pageEndBookmark'

/** 屏幕/滚动宿主的交集，扣除正文上下安全区。 */
export function resolveReaderViewport(
  viewport: ReaderViewportBounds,
  host: ReaderViewportBounds,
  paddingTop: number,
  paddingBottom: number,
  paginated: boolean,
): ReaderViewportBounds {
  const frame = paginated ? viewport : host
  const top = Math.max(viewport.top, host.top, frame.top + paddingTop)
  return {
    top,
    bottom: Math.max(top, Math.min(viewport.bottom, host.bottom, frame.bottom - paddingBottom)),
    left: Math.max(viewport.left, host.left),
    right: Math.min(viewport.right, host.right),
  }
}

export function readerPageScrollDistance(bounds: ReaderViewportBounds, lineHeight: number): number {
  const height = Math.max(0, bounds.bottom - bounds.top)
  // 至少保留一行重叠；极短视口最多移动半屏，避免跳过未读文字。
  return Math.max(0, height - Math.min(height / 2, Math.max(1, lineHeight)))
}
