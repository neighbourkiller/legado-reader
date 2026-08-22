import { computed } from 'vue';
const props = defineProps();
const isSelected = (idx) => {
    return idx === props.currentChapterIndex;
};
// PC端 一个列表项中展示两个章节
const catas = computed(() => {
    const source = props.source;
    if ('catas' in source)
        return source.catas;
    return [props.source];
});
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "wrapper" },
});
/** @type {__VLS_StyleScopedClasses['wrapper']} */ ;
for (const [cata] of __VLS_vFor((__VLS_ctx.catas))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (...[$event]) => {
                return (__VLS_ctx.gotoChapter(cata));
                // @ts-ignore
                [catas, gotoChapter,];
            } },
        ...{ class: "cata-text" },
        key: (cata.index),
        ...{ class: ({ selected: __VLS_ctx.isSelected(cata.index) }) },
    });
    /** @type {__VLS_StyleScopedClasses['cata-text']} */ ;
    /** @type {__VLS_StyleScopedClasses['selected']} */ ;
    (cata.title);
    // @ts-ignore
    [isSelected,];
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
