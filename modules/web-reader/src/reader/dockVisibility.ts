export interface ReaderDockPointerContext {
  clientX: number
  clientY: number
  viewportWidth: number
  viewportHeight: number
}

export const READER_DOCK_REVEAL_MAX_WIDTH = 680
export const READER_DOCK_REVEAL_HEIGHT = 140
const READER_DOCK_VIEWPORT_GUTTER = 12

export function isPointerNearReaderDock({
  clientX,
  clientY,
  viewportWidth,
  viewportHeight,
}: ReaderDockPointerContext): boolean {
  if (viewportWidth <= 0 || viewportHeight <= 0) return false

  const revealWidth = Math.min(
    READER_DOCK_REVEAL_MAX_WIDTH,
    Math.max(0, viewportWidth - READER_DOCK_VIEWPORT_GUTTER * 2),
  )
  const revealLeft = (viewportWidth - revealWidth) / 2
  const revealTop = Math.max(0, viewportHeight - READER_DOCK_REVEAL_HEIGHT)

  return clientX >= revealLeft
    && clientX <= revealLeft + revealWidth
    && clientY >= revealTop
    && clientY <= viewportHeight
}
