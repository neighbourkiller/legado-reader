import { computed, ref, nextTick, onMounted, watch } from 'vue';
import { resolveTextAnchor } from '@/utils/textSelection';
import jump from '@/plugins/jump';
const props = defineProps();
const emit = defineEmits();
const epubHtml = computed(() => {
    return typeof props.contents === 'string' ? props.contents : props.contents.join('');
});
const paragraphRef = ref();
const bodyRef = ref();
const clearHighlightMarks = () => {
    if (!bodyRef.value)
        return;
    bodyRef.value.querySelectorAll('mark[data-reader-highlight]').forEach(mark => {
        mark.replaceWith(document.createTextNode(mark.textContent || ''));
    });
    bodyRef.value.normalize();
};
const annotateEpubParagraphs = () => {
    if (!bodyRef.value || props.format !== 'epub')
        return;
    const blocks = bodyRef.value.querySelectorAll('.epub-html-content p, .epub-html-content li, .epub-html-content blockquote, .epub-html-content h1, .epub-html-content h2, .epub-html-content h3, .epub-html-content h4, .epub-html-content h5, .epub-html-content h6');
    blocks.forEach((block, index) => { block.dataset.chapterpos = String(index); });
};
const applyHighlights = () => {
    const root = bodyRef.value;
    if (!root)
        return;
    clearHighlightMarks();
    annotateEpubParagraphs();
    const fullText = root.textContent || '';
    const highlights = (props.highlights || []).flatMap(item => {
        const resolved = resolveTextAnchor(fullText, item.text, item.startOffset);
        return resolved ? [{ ...item, ...resolved }] : [];
    }).filter(item => item.endOffset > item.startOffset);
    if (highlights.length === 0)
        return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let offset = 0;
    while (walker.nextNode()) {
        const node = walker.currentNode;
        const start = offset;
        offset += node.data.length;
        nodes.push({ node, start, end: offset });
    }
    for (const { node, start, end } of nodes) {
        const boundaries = new Set([0, node.data.length]);
        const overlapping = highlights.filter(item => item.startOffset < end && item.endOffset > start);
        if (overlapping.length === 0)
            continue;
        for (const item of overlapping) {
            boundaries.add(Math.max(0, item.startOffset - start));
            boundaries.add(Math.min(node.data.length, item.endOffset - start));
        }
        const sorted = [...boundaries].sort((a, b) => a - b);
        const fragment = document.createDocumentFragment();
        for (let index = 0; index < sorted.length - 1; index += 1) {
            const localStart = sorted[index];
            const localEnd = sorted[index + 1];
            const text = node.data.slice(localStart, localEnd);
            const absoluteMiddle = start + localStart + (localEnd - localStart) / 2;
            const highlight = [...overlapping]
                .reverse()
                .find(item => absoluteMiddle >= item.startOffset && absoluteMiddle < item.endOffset);
            if (!highlight) {
                fragment.append(text);
                continue;
            }
            const mark = document.createElement('mark');
            mark.dataset.readerHighlight = highlight.id;
            mark.className = `reader-highlight reader-highlight--${highlight.style.kind}`;
            if (highlight.style.kind === 'background') {
                mark.style.backgroundColor = highlight.style.color;
            }
            else {
                mark.style.textDecoration = `underline ${highlight.style.lineStyle || 'solid'} ${highlight.style.color} 2px`;
            }
            mark.textContent = text;
            fragment.append(mark);
        }
        node.replaceWith(fragment);
    }
};
const handleBodyClick = (event) => {
    const mark = event.target?.closest('mark[data-reader-highlight]');
    const highlight = props.highlights?.find(item => item.id === mark?.dataset.readerHighlight);
    if (highlight) {
        event.preventDefault();
        event.stopPropagation();
        emit('highlightClick', highlight);
    }
};
onMounted(() => nextTick(applyHighlights));
watch(() => [props.contents, props.highlights], () => nextTick(applyHighlights), { deep: true });
const scrollToParagraph = (index) => {
    if (!paragraphRef.value || !paragraphRef.value[index])
        return;
    nextTick(() => {
        jump(paragraphRef.value[index], {
            duration: 0,
        });
    });
};
const __VLS_exposed = {
    scrollToParagraph,
};
defineExpose(__VLS_exposed);
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
(__VLS_ctx.props.spacing.letter);
(__VLS_ctx.props.spacing.line);
(__VLS_ctx.props.spacing.paragraph);
(__VLS_ctx.props.spacing.letter);
(__VLS_ctx.props.spacing.line);
(__VLS_ctx.props.spacing.paragraph);
// @ts-ignore
[props, props, props, props, props, props,];
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "chapter-content-container" },
});
/** @type {__VLS_StyleScopedClasses['chapter-content-container']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "title" },
    'data-chapterpos': "0",
});
/** @type {__VLS_StyleScopedClasses['title']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "title-text" },
});
/** @type {__VLS_StyleScopedClasses['title-text']} */ ;
(__VLS_ctx.title);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onClick: (__VLS_ctx.handleBodyClick) },
    ref: "bodyRef",
    'data-reader-body': true,
});
if (__VLS_ctx.format === 'txt' && Array.isArray(__VLS_ctx.contents)) {
    for (const [para, index] of __VLS_vFor((__VLS_ctx.contents))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (index),
            ...{ class: "paragraph" },
            ref: "paragraphRef",
            'data-chapterpos': (index),
        });
        /** @type {__VLS_StyleScopedClasses['paragraph']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ style: ({ fontFamily: __VLS_ctx.fontFamily, fontSize: __VLS_ctx.fontSize }) },
        });
        (para);
        // @ts-ignore
        [title, handleBodyClick, format, contents, contents, fontFamily, fontSize,];
    }
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "epub-html-content" },
        ...{ style: ({ fontFamily: __VLS_ctx.fontFamily, fontSize: __VLS_ctx.fontSize }) },
    });
    __VLS_asFunctionalDirective(__VLS_directives.vHtml, {})(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.epubHtml), }, null, null);
    /** @type {__VLS_StyleScopedClasses['epub-html-content']} */ ;
}
// @ts-ignore
[fontFamily, fontSize, epubHtml,];
const __VLS_export = (await import('vue')).defineComponent({
    setup: () => __VLS_exposed,
    __typeEmits: {},
    __typeProps: {},
});
export default {};
