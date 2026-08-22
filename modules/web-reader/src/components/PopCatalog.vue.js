import { ref, computed, watch, nextTick } from 'vue';
import { storeToRefs } from 'pinia';
import settings from '@/config/themeConfig';
import '@/assets/fonts/popfont.css';
import CatalogItem from './CatalogItem.vue';
import { useReadingStore } from '@/stores/reading';
const store = useReadingStore();
const { chapters, popCataVisible, miniInterface, settings: readSettings, currentBook } = storeToRefs(store);
const emit = defineEmits();
const isNight = computed(() => readSettings.value.theme === 6);
const popupTheme = computed(() => {
    const themeIdx = readSettings.value.theme ?? 1;
    return {
        background: settings.themes[themeIdx]?.popup || '#ede7da',
    };
});
// 数据源：PC端双列，移动端单列
const listData = computed(() => {
    const list = chapters.value;
    if (miniInterface.value)
        return list;
    const length = Math.ceil(list.length / 2);
    const result = new Array(length);
    for (let i = 0; i < length; i++) {
        result[i] = {
            index: i,
            catas: list.slice(2 * i, 2 * i + 2),
        };
    }
    return result;
});
const currentChapterIndex = computed(() => currentBook.value?.currentChapter ?? 0);
const scrollContainerRef = ref();
// 打开目录时自动滚动到当前章节位置
watch(() => popCataVisible.value, visible => {
    if (visible) {
        nextTick(() => {
            if (!scrollContainerRef.value)
                return;
            const activeElem = scrollContainerRef.value.querySelector('.selected');
            if (activeElem) {
                activeElem.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }
        });
    }
});
const gotoChapter = (chapter) => {
    store.popCataVisible = false;
    emit('getContent', chapter.index);
};
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
/** @type {__VLS_StyleScopedClasses['cata']} */ ;
/** @type {__VLS_StyleScopedClasses['cata']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: ({ 'cata-wrapper': true, visible: __VLS_ctx.popCataVisible }) },
    ...{ style: (__VLS_ctx.popupTheme) },
});
/** @type {__VLS_StyleScopedClasses['visible']} */ ;
/** @type {__VLS_StyleScopedClasses['cata-wrapper']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "title" },
});
/** @type {__VLS_StyleScopedClasses['title']} */ ;
(__VLS_ctx.chapters.length);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "catalog-scroll-container" },
    ...{ class: ({ night: __VLS_ctx.isNight, day: !__VLS_ctx.isNight }) },
    ref: "scrollContainerRef",
});
/** @type {__VLS_StyleScopedClasses['catalog-scroll-container']} */ ;
/** @type {__VLS_StyleScopedClasses['night']} */ ;
/** @type {__VLS_StyleScopedClasses['day']} */ ;
for (const [item, idx] of __VLS_vFor((__VLS_ctx.listData))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        key: (idx),
        ...{ class: "cata" },
    });
    /** @type {__VLS_StyleScopedClasses['cata']} */ ;
    const __VLS_0 = CatalogItem;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        index: (idx),
        source: (item),
        gotoChapter: (__VLS_ctx.gotoChapter),
        currentChapterIndex: (__VLS_ctx.currentChapterIndex),
    }));
    const __VLS_2 = __VLS_1({
        index: (idx),
        source: (item),
        gotoChapter: (__VLS_ctx.gotoChapter),
        currentChapterIndex: (__VLS_ctx.currentChapterIndex),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    // @ts-ignore
    [popCataVisible, popupTheme, chapters, isNight, isNight, listData, gotoChapter, currentChapterIndex,];
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
});
export default {};
