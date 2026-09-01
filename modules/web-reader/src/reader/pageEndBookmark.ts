import { textOffsetWithin } from '@/utils/textSelection'

export interface ReaderViewportBounds {
  top: number
  right: number
  bottom: number
  left: number
}

export interface ReaderPageEndPosition {
  chapterIndex: number
  chapterPos: number
  content: string
  startOffset: number
  endOffset: number
}

interface LineSource {
  positionElement: HTMLElement
  bodyElement: HTMLElement
  chapterElement: HTMLElement
  textNode: Text
  rect: DOMRect
}

const RECT_EPSILON = 0.75

function rectIntersectsBounds(rect: DOMRect, bounds: ReaderViewportBounds): boolean {
  return rect.width > 0
    && rect.height > 0
    && rect.right > bounds.left + RECT_EPSILON
    && rect.left < bounds.right - RECT_EPSILON
    && rect.bottom > bounds.top + RECT_EPSILON
    && rect.top < bounds.bottom - RECT_EPSILON
}

function rectFullyInsideBounds(rect: DOMRect, bounds: ReaderViewportBounds): boolean {
  return rectIntersectsBounds(rect, bounds)
    && rect.top >= bounds.top - RECT_EPSILON
    && rect.bottom <= bounds.bottom + RECT_EPSILON
    && rect.left >= bounds.left - RECT_EPSILON
    && rect.right <= bounds.right + RECT_EPSILON
}

function isSameRenderedLine(left: DOMRect, right: DOMRect): boolean {
  const overlap = Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top)
  return overlap > Math.min(left.height, right.height) * 0.5
}

function textNodesWithin(element: HTMLElement): Text[] {
  const nodes: Text[] = []
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    if (node.data.length > 0) nodes.push(node)
  }
  return nodes
}

function rangeRects(range: Range): DOMRect[] {
  return Array.from(range.getClientRects()) as DOMRect[]
}

function collectVisibleLineSources(
  root: HTMLElement,
  bounds: ReaderViewportBounds,
): LineSource[] {
  const sources: LineSource[] = []
  const bodyElements = root.querySelectorAll<HTMLElement>(
    '[data-chapter-index] [data-reader-body]',
  )

  for (const bodyElement of bodyElements) {
    const chapterElement = bodyElement.closest<HTMLElement>('[data-chapter-index]')
    if (!chapterElement) continue
    const paragraphElements = Array.from(
      bodyElement.querySelectorAll<HTMLElement>('[data-chapterpos]'),
    )
    // EPUB 正文没有段落序号节点；此时以整个正文作为第 0 段，精确位置仍由字符偏移保存。
    const positionElements = paragraphElements.length > 0 ? paragraphElements : [bodyElement]

    for (const positionElement of positionElements) {
      if (!Array.from(positionElement.getClientRects()).some(rect =>
        rectIntersectsBounds(rect as DOMRect, bounds),
      )) {
        continue
      }

      for (const textNode of textNodesWithin(positionElement)) {
        const range = document.createRange()
        range.selectNodeContents(textNode)
        for (const rect of rangeRects(range)) {
          if (rectIntersectsBounds(rect, bounds)) {
            sources.push({ positionElement, bodyElement, chapterElement, textNode, rect })
          }
        }
      }
    }
  }

  const fullyVisible = sources.filter(source => rectFullyInsideBounds(source.rect, bounds))
  return (fullyVisible.length > 0 ? fullyVisible : sources).sort((left, right) =>
    right.rect.bottom - left.rect.bottom || right.rect.right - left.rect.right,
  )
}

function resolveLinePosition(
  source: LineSource,
  allSources: LineSource[],
  bounds: ReaderViewportBounds,
): ReaderPageEndPosition | null {
  const lineSources = allSources.filter(candidate =>
    candidate.positionElement === source.positionElement
    && isSameRenderedLine(candidate.rect, source.rect),
  )
  let startOffset = Number.POSITIVE_INFINITY
  let endOffset = -1

  for (const lineSource of lineSources) {
    const node = lineSource.textNode
    for (let index = 0; index < node.data.length; index += 1) {
      const range = document.createRange()
      range.setStart(node, index)
      range.setEnd(node, index + 1)
      const belongsToLine = rangeRects(range).some(rect =>
        rectIntersectsBounds(rect, bounds) && isSameRenderedLine(rect, source.rect),
      )
      if (!belongsToLine) continue

      const globalStart = textOffsetWithin(lineSource.bodyElement, node, index)
      startOffset = Math.min(startOffset, globalStart)
      endOffset = Math.max(endOffset, globalStart + 1)
    }
  }

  if (!Number.isFinite(startOffset) || endOffset <= startOffset) return null
  const bodyText = source.bodyElement.textContent || ''
  while (startOffset < endOffset && /\s/u.test(bodyText[startOffset] || '')) startOffset += 1
  while (endOffset > startOffset && /\s/u.test(bodyText[endOffset - 1] || '')) endOffset -= 1
  if (endOffset <= startOffset) return null

  const chapterIndex = Number(source.chapterElement.dataset.chapterIndex)
  const rawChapterPos = source.positionElement.dataset.chapterpos
  const chapterPos = rawChapterPos === undefined ? 0 : Number(rawChapterPos)
  if (!Number.isInteger(chapterIndex) || !Number.isInteger(chapterPos)) return null

  return {
    chapterIndex,
    chapterPos,
    content: bodyText.slice(startOffset, endOffset),
    startOffset,
    endOffset,
  }
}

/**
 * 解析当前可见页最下方完整文字行。分页列和滚动视口都以实际渲染矩形为准，
 * 不依赖固定屏幕探测点，因此正文上边距变化不会让书签位置失效。
 */
export function findLastVisibleReaderLine(
  root: HTMLElement,
  bounds: ReaderViewportBounds,
): ReaderPageEndPosition | null {
  if (bounds.right <= bounds.left || bounds.bottom <= bounds.top) return null
  const sources = collectVisibleLineSources(root, bounds)
  for (const source of sources) {
    const position = resolveLinePosition(source, sources, bounds)
    if (position) return position
  }
  return null
}
