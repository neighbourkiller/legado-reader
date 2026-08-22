import { useTheme } from '@/composables/useTheme';
const { themeMode, isDark, setTheme } = useTheme();
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['theme-toggle-segmented']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['theme-toggle-segmented']} */ ;
/** @type {__VLS_StyleScopedClasses['dark']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['theme-toggle-segmented']} */ ;
/** @type {__VLS_StyleScopedClasses['dark']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "theme-toggle-segmented" },
    ...{ class: ({ dark: __VLS_ctx.isDark }) },
});
/** @type {__VLS_StyleScopedClasses['theme-toggle-segmented']} */ ;
/** @type {__VLS_StyleScopedClasses['dark']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.setTheme('auto'));
            // @ts-ignore
            [isDark, setTheme,];
        } },
    type: "button",
    ...{ class: "toggle-btn" },
    ...{ class: ({ active: __VLS_ctx.themeMode === 'auto' }) },
    title: "跟随系统",
    'aria-label': "跟随系统",
});
/** @type {__VLS_StyleScopedClasses['toggle-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
    ...{ class: "toggle-icon" },
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    'stroke-width': "2",
    'stroke-linecap': "round",
    'stroke-linejoin': "round",
});
/** @type {__VLS_StyleScopedClasses['toggle-icon']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.rect, __VLS_intrinsics.rect)({
    x: "2",
    y: "3",
    width: "20",
    height: "14",
    rx: "2",
    ry: "2",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.line, __VLS_intrinsics.line)({
    x1: "8",
    y1: "21",
    x2: "16",
    y2: "21",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.line, __VLS_intrinsics.line)({
    x1: "12",
    y1: "17",
    x2: "12",
    y2: "21",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.setTheme('light'));
            // @ts-ignore
            [setTheme, themeMode,];
        } },
    type: "button",
    ...{ class: "toggle-btn" },
    ...{ class: ({ active: __VLS_ctx.themeMode === 'light' }) },
    title: "浅色模式",
    'aria-label': "浅色模式",
});
/** @type {__VLS_StyleScopedClasses['toggle-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
    ...{ class: "toggle-icon" },
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    'stroke-width': "2",
    'stroke-linecap': "round",
    'stroke-linejoin': "round",
});
/** @type {__VLS_StyleScopedClasses['toggle-icon']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.circle, __VLS_intrinsics.circle)({
    cx: "12",
    cy: "12",
    r: "5",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.line, __VLS_intrinsics.line)({
    x1: "12",
    y1: "1",
    x2: "12",
    y2: "3",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.line, __VLS_intrinsics.line)({
    x1: "12",
    y1: "21",
    x2: "12",
    y2: "23",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.line, __VLS_intrinsics.line)({
    x1: "4.22",
    y1: "4.22",
    x2: "5.64",
    y2: "5.64",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.line, __VLS_intrinsics.line)({
    x1: "18.36",
    y1: "18.36",
    x2: "19.78",
    y2: "19.78",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.line, __VLS_intrinsics.line)({
    x1: "1",
    y1: "12",
    x2: "3",
    y2: "12",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.line, __VLS_intrinsics.line)({
    x1: "21",
    y1: "12",
    x2: "23",
    y2: "12",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.line, __VLS_intrinsics.line)({
    x1: "4.22",
    y1: "19.78",
    x2: "5.64",
    y2: "18.36",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.line, __VLS_intrinsics.line)({
    x1: "18.36",
    y1: "5.64",
    x2: "19.78",
    y2: "4.22",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.setTheme('dark'));
            // @ts-ignore
            [setTheme, themeMode,];
        } },
    type: "button",
    ...{ class: "toggle-btn" },
    ...{ class: ({ active: __VLS_ctx.themeMode === 'dark' }) },
    title: "暗黑模式",
    'aria-label': "暗黑模式",
});
/** @type {__VLS_StyleScopedClasses['toggle-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
    ...{ class: "toggle-icon" },
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    'stroke-width': "2",
    'stroke-linecap': "round",
    'stroke-linejoin': "round",
});
/** @type {__VLS_StyleScopedClasses['toggle-icon']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.path, __VLS_intrinsics.path)({
    d: "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z",
});
// @ts-ignore
[themeMode,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
