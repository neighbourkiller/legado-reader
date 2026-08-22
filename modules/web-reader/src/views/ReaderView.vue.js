import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { ArrowLeft, Menu, Setting } from '@element-plus/icons-vue';
import { useReadingStore } from '@/stores/reading';
import { ElMessage } from 'element-plus';
const route = useRoute();
const router = useRouter();
const readingStore = useReadingStore();
const showControls = ref(false);
const showChapterList = ref(false);
const showSettings = ref(false);
const { currentBook, chapters, settings } = storeToRefs(readingStore);
const isFirstChapter = computed(() => (currentBook.value?.currentChapter || 0) <= 0);
const isLastChapter = computed(() => (currentBook.value?.currentChapter || 0) >= (currentBook.value?.totalChapters || 1) - 1);
onMounted(async () => {
    const bookId = route.params.id;
    if (bookId) {
        try {
            await readingStore.loadBook(bookId);
        }
        catch (e) {
            ElMessage.error('加载书籍失败');
            router.push('/bookshelf');
        }
    }
    window.addEventListener('keydown', handleKeydown);
});
onUnmounted(() => {
    readingStore.saveProgress();
    readingStore.cleanup();
    window.removeEventListener('keydown', handleKeydown);
});
const handleKeydown = (e) => {
    if (e.key === 'ArrowLeft') {
        handlePrev();
    }
    else if (e.key === 'ArrowRight') {
        handleNext();
    }
};
const toggleControls = () => {
    showControls.value = !showControls.value;
    if (!showControls.value) {
        showSettings.value = false;
    }
};
const handlePrev = async () => {
    if (isFirstChapter.value)
        return;
    await readingStore.saveProgress();
    await readingStore.prevChapter();
    scrollToTop();
};
const handleNext = async () => {
    if (isLastChapter.value)
        return;
    await readingStore.saveProgress();
    await readingStore.nextChapter();
    scrollToTop();
};
const goToChapter = async (index) => {
    await readingStore.saveProgress();
    await readingStore.loadChapter(index);
    showChapterList.value = false;
    showControls.value = false;
    scrollToTop();
};
const scrollToTop = () => {
    const scrollContainer = document.querySelector('.reader-content-scroll');
    if (scrollContainer) {
        scrollContainer.scrollTop = 0;
    }
};
const setTheme = (bg, text) => {
    readingStore.updateSettings({ backgroundColor: bg, textColor: text });
};
// Also persist font/line-height changes with a debounce
let settingsTimer = null;
const watchSettings = () => {
    if (settingsTimer)
        clearTimeout(settingsTimer);
    settingsTimer = setTimeout(() => {
        readingStore.updateSettings({ ...settings.value });
    }, 500);
};
const formattedContent = computed(() => {
    const raw = readingStore.currentContent;
    if (!raw)
        return '';
    if (currentBook.value?.format === 'epub') {
        return raw;
    }
    const paragraphs = raw.split(/\n+/).map(p => p.trim()).filter(p => p);
    return paragraphs.map(p => `<p>${p}</p>`).join('');
});
const readerStyle = computed(() => ({
    backgroundColor: settings.value?.backgroundColor || '#ffffff',
    color: settings.value?.textColor || '#333333',
    fontFamily: settings.value?.fontFamily || 'system-ui'
}));
const contentStyle = computed(() => ({
    fontSize: `${settings.value?.fontSize || 18}px`,
    lineHeight: settings.value?.lineHeight || 1.8
}));
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['reader-content']} */ ;
/** @type {__VLS_StyleScopedClasses['top-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['bottom-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['top-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['top-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['chapter-item']} */ ;
/** @type {__VLS_StyleScopedClasses['chapter-item']} */ ;
/** @type {__VLS_StyleScopedClasses['setting-item']} */ ;
/** @type {__VLS_StyleScopedClasses['setting-item']} */ ;
/** @type {__VLS_StyleScopedClasses['setting-item']} */ ;
/** @type {__VLS_StyleScopedClasses['theme-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['theme-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['theme-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onClick: (__VLS_ctx.toggleControls) },
    ...{ class: "reader-container" },
    ...{ style: (__VLS_ctx.readerStyle) },
});
/** @type {__VLS_StyleScopedClasses['reader-container']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "reader-content-scroll" },
});
/** @type {__VLS_StyleScopedClasses['reader-content-scroll']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "reader-content" },
    ...{ style: (__VLS_ctx.contentStyle) },
});
__VLS_asFunctionalDirective(__VLS_directives.vHtml, {})(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.formattedContent), }, null, null);
/** @type {__VLS_StyleScopedClasses['reader-content']} */ ;
let __VLS_0;
/** @ts-ignore @type { | typeof __VLS_components.transition | typeof __VLS_components.Transition | typeof __VLS_components.transition | typeof __VLS_components.Transition} */
transition;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    name: "slide-down",
}));
const __VLS_2 = __VLS_1({
    name: "slide-down",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
const { default: __VLS_5 } = __VLS_3.slots;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onClick: () => { } },
    ...{ class: "top-bar" },
});
__VLS_asFunctionalDirective(__VLS_directives.vShow, {})(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.showControls), }, null, null);
/** @type {__VLS_StyleScopedClasses['top-bar']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "left" },
});
/** @type {__VLS_StyleScopedClasses['left']} */ ;
let __VLS_6;
/** @ts-ignore @type { | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button']} */
elButton;
// @ts-ignore
const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.ArrowLeft),
    circle: true,
}));
const __VLS_8 = __VLS_7({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.ArrowLeft),
    circle: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_7));
let __VLS_11;
const __VLS_12 = {
    /** @type {typeof __VLS_11.click} */
    onClick: (...[$event]) => {
        return (__VLS_ctx.router.back());
        // @ts-ignore
        [toggleControls, readerStyle, contentStyle, formattedContent, showControls, ArrowLeft, router,];
    },
};
var __VLS_9;
var __VLS_10;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "book-title" },
});
/** @type {__VLS_StyleScopedClasses['book-title']} */ ;
(__VLS_ctx.currentBook?.name);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "right" },
});
/** @type {__VLS_StyleScopedClasses['right']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "progress" },
});
/** @type {__VLS_StyleScopedClasses['progress']} */ ;
((__VLS_ctx.currentBook?.currentChapter || 0) + 1);
(__VLS_ctx.currentBook?.totalChapters || 1);
let __VLS_13;
/** @ts-ignore @type { | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button']} */
elButton;
// @ts-ignore
const __VLS_14 = __VLS_asFunctionalComponent1(__VLS_13, new __VLS_13({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Menu),
    circle: true,
}));
const __VLS_15 = __VLS_14({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Menu),
    circle: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_14));
let __VLS_18;
const __VLS_19 = {
    /** @type {typeof __VLS_18.click} */
    onClick: (...[$event]) => {
        return (__VLS_ctx.showChapterList = true);
        // @ts-ignore
        [currentBook, currentBook, currentBook, Menu, showChapterList,];
    },
};
var __VLS_16;
var __VLS_17;
// @ts-ignore
[];
var __VLS_3;
let __VLS_20;
/** @ts-ignore @type { | typeof __VLS_components.transition | typeof __VLS_components.Transition | typeof __VLS_components.transition | typeof __VLS_components.Transition} */
transition;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent1(__VLS_20, new __VLS_20({
    name: "slide-up",
}));
const __VLS_22 = __VLS_21({
    name: "slide-up",
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
const { default: __VLS_25 } = __VLS_23.slots;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onClick: () => { } },
    ...{ class: "bottom-bar" },
});
__VLS_asFunctionalDirective(__VLS_directives.vShow, {})(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.showControls), }, null, null);
/** @type {__VLS_StyleScopedClasses['bottom-bar']} */ ;
let __VLS_26;
/** @ts-ignore @type { | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button'] | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button']} */
elButton;
// @ts-ignore
const __VLS_27 = __VLS_asFunctionalComponent1(__VLS_26, new __VLS_26({
    ...{ 'onClick': {} },
    disabled: (__VLS_ctx.isFirstChapter),
}));
const __VLS_28 = __VLS_27({
    ...{ 'onClick': {} },
    disabled: (__VLS_ctx.isFirstChapter),
}, ...__VLS_functionalComponentArgsRest(__VLS_27));
let __VLS_31;
const __VLS_32 = {
    /** @type {typeof __VLS_31.click} */
    onClick: (__VLS_ctx.handlePrev),
};
const { default: __VLS_33 } = __VLS_29.slots;
// @ts-ignore
[showControls, isFirstChapter, handlePrev,];
var __VLS_29;
var __VLS_30;
let __VLS_34;
/** @ts-ignore @type { | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button']} */
elButton;
// @ts-ignore
const __VLS_35 = __VLS_asFunctionalComponent1(__VLS_34, new __VLS_34({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Setting),
    circle: true,
}));
const __VLS_36 = __VLS_35({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Setting),
    circle: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_35));
let __VLS_39;
const __VLS_40 = {
    /** @type {typeof __VLS_39.click} */
    onClick: (...[$event]) => {
        return (__VLS_ctx.showSettings = true);
        // @ts-ignore
        [Setting, showSettings,];
    },
};
var __VLS_37;
var __VLS_38;
let __VLS_41;
/** @ts-ignore @type { | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button'] | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button']} */
elButton;
// @ts-ignore
const __VLS_42 = __VLS_asFunctionalComponent1(__VLS_41, new __VLS_41({
    ...{ 'onClick': {} },
    disabled: (__VLS_ctx.isLastChapter),
}));
const __VLS_43 = __VLS_42({
    ...{ 'onClick': {} },
    disabled: (__VLS_ctx.isLastChapter),
}, ...__VLS_functionalComponentArgsRest(__VLS_42));
let __VLS_46;
const __VLS_47 = {
    /** @type {typeof __VLS_46.click} */
    onClick: (__VLS_ctx.handleNext),
};
const { default: __VLS_48 } = __VLS_44.slots;
// @ts-ignore
[isLastChapter, handleNext,];
var __VLS_44;
var __VLS_45;
// @ts-ignore
[];
var __VLS_23;
let __VLS_49;
/** @ts-ignore @type { | typeof __VLS_components.elDrawer | typeof __VLS_components.ElDrawer | typeof __VLS_components['el-drawer'] | typeof __VLS_components.elDrawer | typeof __VLS_components.ElDrawer | typeof __VLS_components['el-drawer']} */
elDrawer;
// @ts-ignore
const __VLS_50 = __VLS_asFunctionalComponent1(__VLS_49, new __VLS_49({
    modelValue: (__VLS_ctx.showChapterList),
    title: "目录",
    direction: "ltr",
    size: "300px",
    withHeader: (true),
}));
const __VLS_51 = __VLS_50({
    modelValue: (__VLS_ctx.showChapterList),
    title: "目录",
    direction: "ltr",
    size: "300px",
    withHeader: (true),
}, ...__VLS_functionalComponentArgsRest(__VLS_50));
const { default: __VLS_54 } = __VLS_52.slots;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "chapter-list" },
});
/** @type {__VLS_StyleScopedClasses['chapter-list']} */ ;
for (const [chapter, index] of __VLS_vFor((__VLS_ctx.chapters))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (...[$event]) => {
                return (__VLS_ctx.goToChapter(index));
                // @ts-ignore
                [showChapterList, chapters, goToChapter,];
            } },
        key: (index),
        ...{ class: "chapter-item" },
        ...{ class: ({ active: __VLS_ctx.currentBook?.currentChapter === index }) },
    });
    /** @type {__VLS_StyleScopedClasses['chapter-item']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    (chapter.title);
    // @ts-ignore
    [currentBook,];
}
// @ts-ignore
[];
var __VLS_52;
let __VLS_55;
/** @ts-ignore @type { | typeof __VLS_components.elDrawer | typeof __VLS_components.ElDrawer | typeof __VLS_components['el-drawer'] | typeof __VLS_components.elDrawer | typeof __VLS_components.ElDrawer | typeof __VLS_components['el-drawer']} */
elDrawer;
// @ts-ignore
const __VLS_56 = __VLS_asFunctionalComponent1(__VLS_55, new __VLS_55({
    modelValue: (__VLS_ctx.showSettings),
    title: "阅读设置",
    direction: "btt",
    size: "300px",
}));
const __VLS_57 = __VLS_56({
    modelValue: (__VLS_ctx.showSettings),
    title: "阅读设置",
    direction: "btt",
    size: "300px",
}, ...__VLS_functionalComponentArgsRest(__VLS_56));
const { default: __VLS_60 } = __VLS_58.slots;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "settings-content" },
});
/** @type {__VLS_StyleScopedClasses['settings-content']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "setting-item" },
});
/** @type {__VLS_StyleScopedClasses['setting-item']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "label" },
});
/** @type {__VLS_StyleScopedClasses['label']} */ ;
let __VLS_61;
/** @ts-ignore @type { | typeof __VLS_components.elSlider | typeof __VLS_components.ElSlider | typeof __VLS_components['el-slider']} */
elSlider;
// @ts-ignore
const __VLS_62 = __VLS_asFunctionalComponent1(__VLS_61, new __VLS_61({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.settings.fontSize),
    min: (14),
    max: (32),
    step: (2),
}));
const __VLS_63 = __VLS_62({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.settings.fontSize),
    min: (14),
    max: (32),
    step: (2),
}, ...__VLS_functionalComponentArgsRest(__VLS_62));
let __VLS_66;
const __VLS_67 = {
    /** @type {typeof __VLS_66.change} */
    onChange: (__VLS_ctx.watchSettings),
};
var __VLS_64;
var __VLS_65;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "value" },
});
/** @type {__VLS_StyleScopedClasses['value']} */ ;
(__VLS_ctx.settings.fontSize);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "setting-item" },
});
/** @type {__VLS_StyleScopedClasses['setting-item']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "label" },
});
/** @type {__VLS_StyleScopedClasses['label']} */ ;
let __VLS_68;
/** @ts-ignore @type { | typeof __VLS_components.elSlider | typeof __VLS_components.ElSlider | typeof __VLS_components['el-slider']} */
elSlider;
// @ts-ignore
const __VLS_69 = __VLS_asFunctionalComponent1(__VLS_68, new __VLS_68({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.settings.lineHeight),
    min: (1.5),
    max: (3.0),
    step: (0.1),
}));
const __VLS_70 = __VLS_69({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.settings.lineHeight),
    min: (1.5),
    max: (3.0),
    step: (0.1),
}, ...__VLS_functionalComponentArgsRest(__VLS_69));
let __VLS_73;
const __VLS_74 = {
    /** @type {typeof __VLS_73.change} */
    onChange: (__VLS_ctx.watchSettings),
};
var __VLS_71;
var __VLS_72;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "value" },
});
/** @type {__VLS_StyleScopedClasses['value']} */ ;
(__VLS_ctx.settings.lineHeight);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "setting-item" },
});
/** @type {__VLS_StyleScopedClasses['setting-item']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "label" },
});
/** @type {__VLS_StyleScopedClasses['label']} */ ;
let __VLS_75;
/** @ts-ignore @type { | typeof __VLS_components.elSelect | typeof __VLS_components.ElSelect | typeof __VLS_components['el-select'] | typeof __VLS_components.elSelect | typeof __VLS_components.ElSelect | typeof __VLS_components['el-select']} */
elSelect;
// @ts-ignore
const __VLS_76 = __VLS_asFunctionalComponent1(__VLS_75, new __VLS_75({
    modelValue: (__VLS_ctx.settings.fontFamily),
    placeholder: "选择字体",
    size: "small",
}));
const __VLS_77 = __VLS_76({
    modelValue: (__VLS_ctx.settings.fontFamily),
    placeholder: "选择字体",
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_76));
const { default: __VLS_80 } = __VLS_78.slots;
let __VLS_81;
/** @ts-ignore @type { | typeof __VLS_components.elOption | typeof __VLS_components.ElOption | typeof __VLS_components['el-option']} */
elOption;
// @ts-ignore
const __VLS_82 = __VLS_asFunctionalComponent1(__VLS_81, new __VLS_81({
    label: "系统默认",
    value: "system-ui, -apple-system, sans-serif",
}));
const __VLS_83 = __VLS_82({
    label: "系统默认",
    value: "system-ui, -apple-system, sans-serif",
}, ...__VLS_functionalComponentArgsRest(__VLS_82));
let __VLS_86;
/** @ts-ignore @type { | typeof __VLS_components.elOption | typeof __VLS_components.ElOption | typeof __VLS_components['el-option']} */
elOption;
// @ts-ignore
const __VLS_87 = __VLS_asFunctionalComponent1(__VLS_86, new __VLS_86({
    label: "宋体",
    value: "'SimSun', 'STSong', serif",
}));
const __VLS_88 = __VLS_87({
    label: "宋体",
    value: "'SimSun', 'STSong', serif",
}, ...__VLS_functionalComponentArgsRest(__VLS_87));
let __VLS_91;
/** @ts-ignore @type { | typeof __VLS_components.elOption | typeof __VLS_components.ElOption | typeof __VLS_components['el-option']} */
elOption;
// @ts-ignore
const __VLS_92 = __VLS_asFunctionalComponent1(__VLS_91, new __VLS_91({
    label: "黑体",
    value: "'SimHei', 'STHeiti', sans-serif",
}));
const __VLS_93 = __VLS_92({
    label: "黑体",
    value: "'SimHei', 'STHeiti', sans-serif",
}, ...__VLS_functionalComponentArgsRest(__VLS_92));
// @ts-ignore
[showSettings, settings, settings, settings, settings, settings, watchSettings, watchSettings,];
var __VLS_78;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "setting-item" },
});
/** @type {__VLS_StyleScopedClasses['setting-item']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "label" },
});
/** @type {__VLS_StyleScopedClasses['label']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "theme-buttons" },
});
/** @type {__VLS_StyleScopedClasses['theme-buttons']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.setTheme('#ffffff', '#333333'));
            // @ts-ignore
            [setTheme,];
        } },
    ...{ class: "theme-btn white" },
});
/** @type {__VLS_StyleScopedClasses['theme-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['white']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.setTheme('#e8e4d9', '#333333'));
            // @ts-ignore
            [setTheme,];
        } },
    ...{ class: "theme-btn sepia" },
});
/** @type {__VLS_StyleScopedClasses['theme-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['sepia']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.setTheme('#1a1a1a', '#eeeeee'));
            // @ts-ignore
            [setTheme,];
        } },
    ...{ class: "theme-btn dark" },
});
/** @type {__VLS_StyleScopedClasses['theme-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['dark']} */ ;
// @ts-ignore
[];
var __VLS_58;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
