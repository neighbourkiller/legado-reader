function chapterElement(node) {
    const element = node instanceof Element ? node : node?.parentElement;
    return element?.closest('[data-chapter-index]') || null;
}
function bodyElement(node) {
    const element = node instanceof Element ? node : node?.parentElement;
    return element?.closest('[data-reader-body]') || null;
}
function paragraphIndex(node) {
    const element = node instanceof Element ? node : node?.parentElement;
    const raw = Number(element?.closest('[data-chapterpos]')?.dataset.chapterpos);
    return Number.isInteger(raw) ? raw : 0;
}
export function textOffsetWithin(root, node, offset) {
    const range = document.createRange();
    range.selectNodeContents(root);
    try {
        range.setEnd(node, offset);
    }
    catch {
        return 0;
    }
    return range.toString().length;
}
export function captureReaderSelection(selection) {
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed)
        return null;
    const text = selection.toString();
    if (!text.trim())
        return null;
    const range = selection.getRangeAt(0);
    const startChapter = chapterElement(range.startContainer);
    const endChapter = chapterElement(range.endContainer);
    if (!startChapter || !endChapter)
        return null;
    const rect = range.getBoundingClientRect();
    const startIndex = Number(startChapter.dataset.chapterIndex);
    const endIndex = Number(endChapter.dataset.chapterIndex);
    const startBody = bodyElement(range.startContainer);
    const endBody = bodyElement(range.endContainer);
    const crossesChapters = startIndex !== endIndex || startBody !== endBody;
    let anchor = null;
    if (!crossesChapters && startBody && Number.isInteger(startIndex)) {
        const startOffset = textOffsetWithin(startBody, range.startContainer, range.startOffset);
        const endOffset = textOffsetWithin(startBody, range.endContainer, range.endOffset);
        if (endOffset > startOffset) {
            anchor = {
                chapterIndex: startIndex,
                startOffset,
                endOffset,
                startParagraph: paragraphIndex(range.startContainer),
                endParagraph: paragraphIndex(range.endContainer),
                text,
            };
        }
    }
    return { text, anchor, rect, crossesChapters };
}
export function findTextRange(root, startOffset, endOffset) {
    if (endOffset <= startOffset)
        return null;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let cursor = 0;
    let startNode = null;
    let endNode = null;
    let localStart = 0;
    let localEnd = 0;
    while (walker.nextNode()) {
        const node = walker.currentNode;
        const next = cursor + node.data.length;
        if (!startNode && startOffset >= cursor && startOffset <= next) {
            startNode = node;
            localStart = Math.min(node.data.length, Math.max(0, startOffset - cursor));
        }
        if (endOffset >= cursor && endOffset <= next) {
            endNode = node;
            localEnd = Math.min(node.data.length, Math.max(0, endOffset - cursor));
            break;
        }
        cursor = next;
    }
    if (!startNode || !endNode)
        return null;
    const range = document.createRange();
    range.setStart(startNode, localStart);
    range.setEnd(endNode, localEnd);
    return range;
}
export function resolveTextAnchor(fullText, text, preferredStart) {
    const expected = fullText.slice(preferredStart, preferredStart + text.length);
    if (expected === text) {
        return { startOffset: preferredStart, endOffset: preferredStart + text.length };
    }
    if (!text)
        return null;
    const positions = [];
    let from = 0;
    while (from <= fullText.length) {
        const index = fullText.indexOf(text, from);
        if (index < 0)
            break;
        positions.push(index);
        from = index + Math.max(1, text.length);
    }
    if (positions.length === 0)
        return null;
    const startOffset = positions.reduce((best, current) => Math.abs(current - preferredStart) < Math.abs(best - preferredStart) ? current : best);
    return { startOffset, endOffset: startOffset + text.length };
}
