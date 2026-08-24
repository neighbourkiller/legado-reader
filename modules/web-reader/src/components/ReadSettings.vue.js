import { ref, computed, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { ElMessageBox, ElMessage } from 'element-plus';
import { useDebounceFn } from '@vueuse/shared';
import { useReadingStore } from '@/stores/reading';
import themeConfig from '@/config/themeConfig';
import SystemFontDialog from './SystemFontDialog.vue';
import '@/assets/fonts/popfont.css';
import '@/assets/fonts/iconfont.css';
const store = useReadingStore();
const { settings, miniInterface } = storeToRefs(store);
const saveDebounced = useDebounceFn(() => {
    store.updateSettings(settings.value);
}, 400);
const isNight = computed(() => settings.value.theme === 6);
const moonIcon = computed(() => (settings.value.theme === 6 ? '' : ''));
const themeColors = [
    { background: 'rgba(250, 245, 235, 0.8)' },
    { background: 'rgba(245, 234, 204, 0.8)' },
    { background: 'rgba(230, 242, 230, 0.8)' },
    { background: 'rgba(228, 241, 245, 0.8)' },
    { background: 'rgba(245, 228, 228, 0.8)' },
    { background: 'rgba(224, 224, 224, 0.8)' },
    { background: 'rgba(0, 0, 0, 0.5)' },
];
const popupTheme = computed(() => {
    const themeIdx = settings.value.theme ?? 1;
    return {
        background: themeConfig.themes[themeIdx]?.popup || '#ede7da',
    };
});
const setTheme = (idx) => {
    settings.value.theme = idx;
    saveDebounced();
};
// 预设字体
const fontOptions = ['雅黑', '宋体', '楷书'];
const setFont = (fontIdx) => {
    settings.value.font = fontIdx;
    saveDebounced();
};
// 常用字体与系统字体弹窗
const showSystemFontDialog = ref(false);
const favoriteFontsList = computed(() => {
    const list = [];
    if (settings.value.font === -1 && settings.value.customFontName?.trim()) {
        list.push(settings.value.customFontName.trim());
    }
    for (const f of settings.value.favoriteFonts || []) {
        if (f && f.trim() && !list.includes(f.trim())) {
            list.push(f.trim());
        }
    }
    return list;
});
const selectFavoriteFont = async (fontName) => {
    settings.value.font = -1;
    settings.value.customFontName = fontName;
    const currentFavs = [
        fontName,
        ...(settings.value.favoriteFonts || []).filter(f => f !== fontName),
    ];
    settings.value.favoriteFonts = currentFavs;
    await store.updateSettings({
        font: -1,
        customFontName: fontName,
        favoriteFonts: currentFavs,
    });
};
const handleSystemFontSelect = async (fontName) => {
    settings.value.font = -1;
    settings.value.customFontName = fontName;
    const currentFavs = [
        fontName,
        ...(settings.value.favoriteFonts || []).filter(f => f !== fontName),
    ];
    settings.value.favoriteFonts = currentFavs;
    await store.updateSettings({
        font: -1,
        customFontName: fontName,
        favoriteFonts: currentFavs,
    });
    ElMessage.success(`已应用系统字体: ${fontName}`);
};
const handleUpdateFavorites = async (favorites) => {
    settings.value.favoriteFonts = favorites;
    await store.updateSettings({
        favoriteFonts: favorites,
    });
};
// 自定义字体
const customFontNameInput = ref(settings.value.customFontName || '');
const customFontSavePopVisible = ref(false);
watch(() => settings.value.customFontName, name => {
    customFontNameInput.value = name || '';
}, { immediate: true });
const handleFontInputChange = () => {
    const fontName = customFontNameInput.value.trim();
    if (fontName) {
        settings.value.font = -1;
        settings.value.customFontName = fontName;
        store.updateSettings({
            font: -1,
            customFontName: fontName,
        });
    }
};
const saveCustomFont = async () => {
    customFontSavePopVisible.value = false;
    const fontName = customFontNameInput.value.trim();
    if (!fontName) {
        ElMessage.warning('请输入自定义字体名称');
        return;
    }
    settings.value.font = -1;
    settings.value.customFontName = fontName;
    const currentFavs = [
        fontName,
        ...(settings.value.favoriteFonts || []).filter(f => f !== fontName),
    ];
    settings.value.favoriteFonts = currentFavs;
    await store.updateSettings({
        font: -1,
        customFontName: fontName,
        favoriteFonts: currentFavs,
    });
    ElMessage.success(`已应用自定义字体: ${fontName}`);
};
const loadFontFromURL = () => {
    customFontSavePopVisible.value = false;
    ElMessageBox.prompt('请输入字体网络链接 (URL)', '下载网络字体', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputPattern: /^https?:.+$/,
        inputErrorMessage: 'URL 格式不正确',
        beforeClose: (action, instance, done) => {
            if (action === 'confirm') {
                instance.confirmButtonLoading = true;
                instance.confirmButtonText = '下载中...';
                const url = instance.inputValue;
                if (typeof FontFace !== 'function') {
                    ElMessage.error('当前浏览器不支持 FontFace API');
                    return done();
                }
                const fontName = customFontNameInput.value.trim() || 'CustomWebFont';
                const fontface = new FontFace(fontName, `url("${url}")`);
                document.fonts.add(fontface);
                fontface
                    .load()
                    .then(async () => {
                    instance.confirmButtonLoading = false;
                    ElMessage.success('字体加载成功！');
                    settings.value.customFontName = fontName;
                    settings.value.customFontUrl = url;
                    settings.value.font = -1;
                    await store.updateSettings({
                        font: -1,
                        customFontName: fontName,
                        customFontUrl: url,
                    });
                    done();
                })
                    .catch(err => {
                    instance.confirmButtonLoading = false;
                    instance.confirmButtonText = '确定';
                    ElMessage.error('字体下载失败，请检查链接有效性与跨域策略');
                    console.error(err);
                });
            }
            else {
                done();
            }
        },
    });
};
// 字体大小
const moreFontSize = () => {
    if (settings.value.fontSize < 48) {
        settings.value.fontSize += 2;
        saveDebounced();
    }
};
const lessFontSize = () => {
    if (settings.value.fontSize > 12) {
        settings.value.fontSize -= 2;
        saveDebounced();
    }
};
// 字距 / 行距 / 段距
const lessLetterSpacing = () => {
    settings.value.spacing.letter = Math.max(-0.2, settings.value.spacing.letter - 0.01);
    saveDebounced();
};
const moreLetterSpacing = () => {
    settings.value.spacing.letter = Math.min(1.0, settings.value.spacing.letter + 0.01);
    saveDebounced();
};
const lessLineSpacing = () => {
    settings.value.spacing.line = Math.max(0.5, settings.value.spacing.line - 0.1);
    saveDebounced();
};
const moreLineSpacing = () => {
    settings.value.spacing.line = Math.min(3.0, settings.value.spacing.line + 0.1);
    saveDebounced();
};
const lessParagraphSpacing = () => {
    settings.value.spacing.paragraph = Math.max(0.2, settings.value.spacing.paragraph - 0.1);
    saveDebounced();
};
const moreParagraphSpacing = () => {
    settings.value.spacing.paragraph = Math.min(3.0, settings.value.spacing.paragraph + 0.1);
    saveDebounced();
};
// 页面宽度
const moreReadWidth = () => {
    if (settings.value.readWidth + 160 + 2 * 68 > window.innerWidth)
        return;
    settings.value.readWidth += 160;
    saveDebounced();
};
const lessReadWidth = () => {
    if (settings.value.readWidth > 640) {
        settings.value.readWidth -= 160;
        saveDebounced();
    }
};
// 翻页速度
const moreJumpDuration = () => {
    settings.value.jumpDuration = Math.min(1500, settings.value.jumpDuration + 100);
    saveDebounced();
};
const lessJumpDuration = () => {
    settings.value.jumpDuration = Math.max(0, settings.value.jumpDuration - 100);
    saveDebounced();
};
// 无限加载
const setInfiniteLoading = (val) => {
    settings.value.infiniteLoading = val;
    saveDebounced();
};
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['iconfont']} */ ;
/** @type {__VLS_StyleScopedClasses['iconfont']} */ ;
/** @type {__VLS_StyleScopedClasses['selected']} */ ;
/** @type {__VLS_StyleScopedClasses['font-item']} */ ;
/** @type {__VLS_StyleScopedClasses['selected']} */ ;
/** @type {__VLS_StyleScopedClasses['infinite-loading-item']} */ ;
/** @type {__VLS_StyleScopedClasses['theme-item']} */ ;
/** @type {__VLS_StyleScopedClasses['selected']} */ ;
/** @type {__VLS_StyleScopedClasses['moon-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['font-list']} */ ;
/** @type {__VLS_StyleScopedClasses['infinite-loading']} */ ;
/** @type {__VLS_StyleScopedClasses['font-item']} */ ;
/** @type {__VLS_StyleScopedClasses['infinite-loading-item']} */ ;
/** @type {__VLS_StyleScopedClasses['resize']} */ ;
/** @type {__VLS_StyleScopedClasses['theme-item']} */ ;
/** @type {__VLS_StyleScopedClasses['selected']} */ ;
/** @type {__VLS_StyleScopedClasses['moon-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['font-list']} */ ;
/** @type {__VLS_StyleScopedClasses['infinite-loading']} */ ;
/** @type {__VLS_StyleScopedClasses['font-item']} */ ;
/** @type {__VLS_StyleScopedClasses['infinite-loading-item']} */ ;
/** @type {__VLS_StyleScopedClasses['resize']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-wrapper']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "settings-wrapper" },
    ...{ style: (__VLS_ctx.popupTheme) },
    ...{ class: ({ night: __VLS_ctx.isNight, day: !__VLS_ctx.isNight }) },
});
/** @type {__VLS_StyleScopedClasses['settings-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['night']} */ ;
/** @type {__VLS_StyleScopedClasses['day']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "settings-title" },
});
/** @type {__VLS_StyleScopedClasses['settings-title']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "setting-list" },
});
/** @type {__VLS_StyleScopedClasses['setting-list']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
    ...{ class: "theme-list" },
});
/** @type {__VLS_StyleScopedClasses['theme-list']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.i, __VLS_intrinsics.i)({});
for (const [themeColor, index] of __VLS_vFor((__VLS_ctx.themeColors))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ onClick: (...[$event]) => {
                return (__VLS_ctx.setTheme(index));
                // @ts-ignore
                [popupTheme, isNight, isNight, themeColors, setTheme,];
            } },
        ...{ class: "theme-item" },
        key: (index),
        ...{ style: (themeColor) },
        ...{ class: ({ selected: __VLS_ctx.settings.theme === index }) },
    });
    /** @type {__VLS_StyleScopedClasses['theme-item']} */ ;
    /** @type {__VLS_StyleScopedClasses['selected']} */ ;
    if (index < 6) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.em, __VLS_intrinsics.em)({
            ...{ class: "iconfont" },
        });
        /** @type {__VLS_StyleScopedClasses['iconfont']} */ ;
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.em, __VLS_intrinsics.em)({
            ...{ class: "moon-icon" },
        });
        /** @type {__VLS_StyleScopedClasses['moon-icon']} */ ;
        (__VLS_ctx.moonIcon);
    }
    // @ts-ignore
    [settings, moonIcon,];
}
__VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
    ...{ class: "font-list" },
});
/** @type {__VLS_StyleScopedClasses['font-list']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.i, __VLS_intrinsics.i)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "font-group-items" },
});
/** @type {__VLS_StyleScopedClasses['font-group-items']} */ ;
for (const [fontName, index] of __VLS_vFor((__VLS_ctx.fontOptions))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ onClick: (...[$event]) => {
                return (__VLS_ctx.setFont(index));
                // @ts-ignore
                [fontOptions, setFont,];
            } },
        ...{ class: "font-item" },
        key: (index),
        ...{ class: ({ selected: __VLS_ctx.settings.font === index }) },
    });
    /** @type {__VLS_StyleScopedClasses['font-item']} */ ;
    /** @type {__VLS_StyleScopedClasses['selected']} */ ;
    (fontName);
    // @ts-ignore
    [settings,];
}
if (__VLS_ctx.favoriteFontsList.length > 0) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
        ...{ class: "font-list" },
    });
    /** @type {__VLS_StyleScopedClasses['font-list']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.i, __VLS_intrinsics.i)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "font-group-items" },
    });
    /** @type {__VLS_StyleScopedClasses['font-group-items']} */ ;
    for (const [favFont] of __VLS_vFor((__VLS_ctx.favoriteFontsList))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.favoriteFontsList.length > 0))
                        throw 0;
                    return (__VLS_ctx.selectFavoriteFont(favFont));
                    // @ts-ignore
                    [favoriteFontsList, favoriteFontsList, selectFavoriteFont,];
                } },
            ...{ class: "font-item font-fav-item" },
            key: (favFont),
            ...{ class: ({ selected: __VLS_ctx.settings.font === -1 && __VLS_ctx.settings.customFontName === favFont }) },
            title: (favFont),
        });
        /** @type {__VLS_StyleScopedClasses['font-item']} */ ;
        /** @type {__VLS_StyleScopedClasses['font-fav-item']} */ ;
        /** @type {__VLS_StyleScopedClasses['selected']} */ ;
        (favFont);
        // @ts-ignore
        [settings, settings,];
    }
}
__VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
    ...{ class: "font-list" },
});
/** @type {__VLS_StyleScopedClasses['font-list']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.i, __VLS_intrinsics.i)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "font-group-items" },
});
/** @type {__VLS_StyleScopedClasses['font-group-items']} */ ;
let __VLS_0;
/** @ts-ignore @type { | typeof __VLS_components.elTooltip | typeof __VLS_components.ElTooltip | typeof __VLS_components['el-tooltip'] | typeof __VLS_components.elTooltip | typeof __VLS_components.ElTooltip | typeof __VLS_components['el-tooltip']} */
elTooltip;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    effect: "dark",
    content: "输入已在系统安装的字体名称",
    placement: "top",
}));
const __VLS_2 = __VLS_1({
    effect: "dark",
    content: "输入已在系统安装的字体名称",
    placement: "top",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
const { default: __VLS_5 } = __VLS_3.slots;
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    ...{ onInput: (__VLS_ctx.handleFontInputChange) },
    ...{ onChange: (__VLS_ctx.handleFontInputChange) },
    ...{ onKeyup: (__VLS_ctx.saveCustomFont) },
    type: "text",
    ...{ class: "font-item font-item-input" },
    ...{ class: ({ selected: __VLS_ctx.settings.font === -1 && (!__VLS_ctx.favoriteFontsList.includes(__VLS_ctx.settings.customFontName) || !__VLS_ctx.settings.customFontName) }) },
    value: (__VLS_ctx.customFontNameInput),
    placeholder: "输入自定义字体...",
});
/** @type {__VLS_StyleScopedClasses['font-item']} */ ;
/** @type {__VLS_StyleScopedClasses['font-item-input']} */ ;
/** @type {__VLS_StyleScopedClasses['selected']} */ ;
// @ts-ignore
[settings, settings, settings, favoriteFontsList, handleFontInputChange, handleFontInputChange, saveCustomFont, customFontNameInput,];
var __VLS_3;
let __VLS_6;
/** @ts-ignore @type { | typeof __VLS_components.elPopover | typeof __VLS_components.ElPopover | typeof __VLS_components['el-popover'] | typeof __VLS_components.elPopover | typeof __VLS_components.ElPopover | typeof __VLS_components['el-popover']} */
elPopover;
// @ts-ignore
const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
    placement: "top",
    width: (270),
    trigger: "click",
    visible: (__VLS_ctx.customFontSavePopVisible),
}));
const __VLS_8 = __VLS_7({
    placement: "top",
    width: (270),
    trigger: "click",
    visible: (__VLS_ctx.customFontSavePopVisible),
}, ...__VLS_functionalComponentArgsRest(__VLS_7));
const { default: __VLS_11 } = __VLS_9.slots;
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
    ...{ style: {} },
});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ style: {} },
});
let __VLS_12;
/** @ts-ignore @type { | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button'] | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button']} */
elButton;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent1(__VLS_12, new __VLS_12({
    ...{ 'onClick': {} },
    size: "small",
    plain: true,
}));
const __VLS_14 = __VLS_13({
    ...{ 'onClick': {} },
    size: "small",
    plain: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
let __VLS_17;
const __VLS_18 = {
    /** @type {typeof __VLS_17.click} */
    onClick: (...[$event]) => {
        return (__VLS_ctx.customFontSavePopVisible = false);
        // @ts-ignore
        [customFontSavePopVisible, customFontSavePopVisible,];
    },
};
const { default: __VLS_19 } = __VLS_15.slots;
// @ts-ignore
[];
var __VLS_15;
var __VLS_16;
let __VLS_20;
/** @ts-ignore @type { | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button'] | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button']} */
elButton;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent1(__VLS_20, new __VLS_20({
    ...{ 'onClick': {} },
    type: "primary",
    size: "small",
}));
const __VLS_22 = __VLS_21({
    ...{ 'onClick': {} },
    type: "primary",
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
let __VLS_25;
const __VLS_26 = {
    /** @type {typeof __VLS_25.click} */
    onClick: (__VLS_ctx.saveCustomFont),
};
const { default: __VLS_27 } = __VLS_23.slots;
// @ts-ignore
[saveCustomFont,];
var __VLS_23;
var __VLS_24;
let __VLS_28;
/** @ts-ignore @type { | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button'] | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button']} */
elButton;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent1(__VLS_28, new __VLS_28({
    ...{ 'onClick': {} },
    type: "primary",
    size: "small",
}));
const __VLS_30 = __VLS_29({
    ...{ 'onClick': {} },
    type: "primary",
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
let __VLS_33;
const __VLS_34 = {
    /** @type {typeof __VLS_33.click} */
    onClick: (__VLS_ctx.loadFontFromURL),
};
const { default: __VLS_35 } = __VLS_31.slots;
// @ts-ignore
[loadFontFromURL,];
var __VLS_31;
var __VLS_32;
{
    const { reference: __VLS_36 } = __VLS_9.slots;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ onClick: (__VLS_ctx.saveCustomFont) },
        ...{ class: "font-item font-btn" },
    });
    /** @type {__VLS_StyleScopedClasses['font-item']} */ ;
    /** @type {__VLS_StyleScopedClasses['font-btn']} */ ;
    // @ts-ignore
    [saveCustomFont,];
}
// @ts-ignore
[];
var __VLS_9;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.showSystemFontDialog = true);
            // @ts-ignore
            [showSystemFontDialog,];
        } },
    ...{ class: "font-item font-btn system-font-btn" },
});
/** @type {__VLS_StyleScopedClasses['font-item']} */ ;
/** @type {__VLS_StyleScopedClasses['font-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['system-font-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
    ...{ class: "font-size" },
});
/** @type {__VLS_StyleScopedClasses['font-size']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.i, __VLS_intrinsics.i)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "resize" },
});
/** @type {__VLS_StyleScopedClasses['resize']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ onClick: (__VLS_ctx.lessFontSize) },
    ...{ class: "less" },
});
/** @type {__VLS_StyleScopedClasses['less']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.em, __VLS_intrinsics.em)({
    ...{ class: "iconfont" },
});
/** @type {__VLS_StyleScopedClasses['iconfont']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.b, __VLS_intrinsics.b)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "lang" },
});
/** @type {__VLS_StyleScopedClasses['lang']} */ ;
(__VLS_ctx.settings.fontSize);
__VLS_asFunctionalElement1(__VLS_intrinsics.b, __VLS_intrinsics.b)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ onClick: (__VLS_ctx.moreFontSize) },
    ...{ class: "more" },
});
/** @type {__VLS_StyleScopedClasses['more']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.em, __VLS_intrinsics.em)({
    ...{ class: "iconfont" },
});
/** @type {__VLS_StyleScopedClasses['iconfont']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
    ...{ class: "letter-spacing" },
});
/** @type {__VLS_StyleScopedClasses['letter-spacing']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.i, __VLS_intrinsics.i)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "resize" },
});
/** @type {__VLS_StyleScopedClasses['resize']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ onClick: (__VLS_ctx.lessLetterSpacing) },
    ...{ class: "less" },
});
/** @type {__VLS_StyleScopedClasses['less']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.em, __VLS_intrinsics.em)({
    ...{ class: "iconfont" },
});
/** @type {__VLS_StyleScopedClasses['iconfont']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.b, __VLS_intrinsics.b)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "lang" },
});
/** @type {__VLS_StyleScopedClasses['lang']} */ ;
((__VLS_ctx.settings.spacing?.letter ?? 0).toFixed(2));
__VLS_asFunctionalElement1(__VLS_intrinsics.b, __VLS_intrinsics.b)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ onClick: (__VLS_ctx.moreLetterSpacing) },
    ...{ class: "more" },
});
/** @type {__VLS_StyleScopedClasses['more']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.em, __VLS_intrinsics.em)({
    ...{ class: "iconfont" },
});
/** @type {__VLS_StyleScopedClasses['iconfont']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
    ...{ class: "line-spacing" },
});
/** @type {__VLS_StyleScopedClasses['line-spacing']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.i, __VLS_intrinsics.i)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "resize" },
});
/** @type {__VLS_StyleScopedClasses['resize']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ onClick: (__VLS_ctx.lessLineSpacing) },
    ...{ class: "less" },
});
/** @type {__VLS_StyleScopedClasses['less']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.em, __VLS_intrinsics.em)({
    ...{ class: "iconfont" },
});
/** @type {__VLS_StyleScopedClasses['iconfont']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.b, __VLS_intrinsics.b)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "lang" },
});
/** @type {__VLS_StyleScopedClasses['lang']} */ ;
((__VLS_ctx.settings.spacing?.line ?? 1.0).toFixed(1));
__VLS_asFunctionalElement1(__VLS_intrinsics.b, __VLS_intrinsics.b)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ onClick: (__VLS_ctx.moreLineSpacing) },
    ...{ class: "more" },
});
/** @type {__VLS_StyleScopedClasses['more']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.em, __VLS_intrinsics.em)({
    ...{ class: "iconfont" },
});
/** @type {__VLS_StyleScopedClasses['iconfont']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
    ...{ class: "paragraph-spacing" },
});
/** @type {__VLS_StyleScopedClasses['paragraph-spacing']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.i, __VLS_intrinsics.i)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "resize" },
});
/** @type {__VLS_StyleScopedClasses['resize']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ onClick: (__VLS_ctx.lessParagraphSpacing) },
    ...{ class: "less" },
});
/** @type {__VLS_StyleScopedClasses['less']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.em, __VLS_intrinsics.em)({
    ...{ class: "iconfont" },
});
/** @type {__VLS_StyleScopedClasses['iconfont']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.b, __VLS_intrinsics.b)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "lang" },
});
/** @type {__VLS_StyleScopedClasses['lang']} */ ;
((__VLS_ctx.settings.spacing?.paragraph ?? 1.0).toFixed(1));
__VLS_asFunctionalElement1(__VLS_intrinsics.b, __VLS_intrinsics.b)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ onClick: (__VLS_ctx.moreParagraphSpacing) },
    ...{ class: "more" },
});
/** @type {__VLS_StyleScopedClasses['more']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.em, __VLS_intrinsics.em)({
    ...{ class: "iconfont" },
});
/** @type {__VLS_StyleScopedClasses['iconfont']} */ ;
if (!__VLS_ctx.miniInterface) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
        ...{ class: "read-width" },
    });
    /** @type {__VLS_StyleScopedClasses['read-width']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.i, __VLS_intrinsics.i)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "resize" },
    });
    /** @type {__VLS_StyleScopedClasses['resize']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ onClick: (__VLS_ctx.lessReadWidth) },
        ...{ class: "less" },
    });
    /** @type {__VLS_StyleScopedClasses['less']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.em, __VLS_intrinsics.em)({
        ...{ class: "iconfont" },
    });
    /** @type {__VLS_StyleScopedClasses['iconfont']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.b, __VLS_intrinsics.b)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "lang" },
    });
    /** @type {__VLS_StyleScopedClasses['lang']} */ ;
    (__VLS_ctx.settings.readWidth);
    __VLS_asFunctionalElement1(__VLS_intrinsics.b, __VLS_intrinsics.b)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ onClick: (__VLS_ctx.moreReadWidth) },
        ...{ class: "more" },
    });
    /** @type {__VLS_StyleScopedClasses['more']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.em, __VLS_intrinsics.em)({
        ...{ class: "iconfont" },
    });
    /** @type {__VLS_StyleScopedClasses['iconfont']} */ ;
}
__VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
    ...{ class: "paragraph-spacing" },
});
/** @type {__VLS_StyleScopedClasses['paragraph-spacing']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.i, __VLS_intrinsics.i)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "resize" },
});
/** @type {__VLS_StyleScopedClasses['resize']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ onClick: (__VLS_ctx.lessJumpDuration) },
    ...{ class: "less" },
});
/** @type {__VLS_StyleScopedClasses['less']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.em, __VLS_intrinsics.em)({
    ...{ class: "iconfont" },
});
/** @type {__VLS_StyleScopedClasses['iconfont']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.b, __VLS_intrinsics.b)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "lang" },
});
/** @type {__VLS_StyleScopedClasses['lang']} */ ;
(__VLS_ctx.settings.jumpDuration);
__VLS_asFunctionalElement1(__VLS_intrinsics.b, __VLS_intrinsics.b)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ onClick: (__VLS_ctx.moreJumpDuration) },
    ...{ class: "more" },
});
/** @type {__VLS_StyleScopedClasses['more']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.em, __VLS_intrinsics.em)({
    ...{ class: "iconfont" },
});
/** @type {__VLS_StyleScopedClasses['iconfont']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
    ...{ class: "infinite-loading" },
});
/** @type {__VLS_StyleScopedClasses['infinite-loading']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.i, __VLS_intrinsics.i)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.setInfiniteLoading(false));
            // @ts-ignore
            [settings, settings, settings, settings, settings, settings, lessFontSize, moreFontSize, lessLetterSpacing, moreLetterSpacing, lessLineSpacing, moreLineSpacing, lessParagraphSpacing, moreParagraphSpacing, miniInterface, lessReadWidth, moreReadWidth, lessJumpDuration, moreJumpDuration, setInfiniteLoading,];
        } },
    ...{ class: "infinite-loading-item" },
    ...{ class: ({ selected: !__VLS_ctx.settings.infiniteLoading }) },
});
/** @type {__VLS_StyleScopedClasses['infinite-loading-item']} */ ;
/** @type {__VLS_StyleScopedClasses['selected']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.setInfiniteLoading(true));
            // @ts-ignore
            [settings, setInfiniteLoading,];
        } },
    ...{ class: "infinite-loading-item" },
    ...{ class: ({ selected: __VLS_ctx.settings.infiniteLoading }) },
});
/** @type {__VLS_StyleScopedClasses['infinite-loading-item']} */ ;
/** @type {__VLS_StyleScopedClasses['selected']} */ ;
const __VLS_37 = SystemFontDialog;
// @ts-ignore
const __VLS_38 = __VLS_asFunctionalComponent1(__VLS_37, new __VLS_37({
    ...{ 'onSelect': {} },
    ...{ 'onUpdateFavorites': {} },
    modelValue: (__VLS_ctx.showSystemFontDialog),
    currentFont: (__VLS_ctx.settings.font === -1 ? __VLS_ctx.settings.customFontName : ''),
    favoriteFonts: (__VLS_ctx.favoriteFontsList),
}));
const __VLS_39 = __VLS_38({
    ...{ 'onSelect': {} },
    ...{ 'onUpdateFavorites': {} },
    modelValue: (__VLS_ctx.showSystemFontDialog),
    currentFont: (__VLS_ctx.settings.font === -1 ? __VLS_ctx.settings.customFontName : ''),
    favoriteFonts: (__VLS_ctx.favoriteFontsList),
}, ...__VLS_functionalComponentArgsRest(__VLS_38));
let __VLS_42;
const __VLS_43 = {
    /** @type {typeof __VLS_42.select} */
    onSelect: (__VLS_ctx.handleSystemFontSelect),
};
const __VLS_44 = {
    /** @type {typeof __VLS_42.updateFavorites} */
    onUpdateFavorites: (__VLS_ctx.handleUpdateFavorites),
};
var __VLS_40;
var __VLS_41;
// @ts-ignore
[settings, settings, settings, favoriteFontsList, showSystemFontDialog, handleSystemFontSelect, handleUpdateFavorites,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
