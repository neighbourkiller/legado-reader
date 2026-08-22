import { computed, ref, nextTick } from 'vue';
import jump from '@/plugins/jump';
const props = defineProps();
const epubHtml = computed(() => {
    return typeof props.contents === 'string' ? props.contents : props.contents.join('');
});
const paragraphRef = ref();
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
        [title, format, contents, contents, fontFamily, fontSize,];
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
    __typeProps: {},
});
export default {};
