import { onMounted, onUnmounted } from 'vue';
import { useTheme } from '@/composables/useTheme';
import { useFullscreen } from '@/composables/useFullscreen';
import GlobalDownloadProgress from '@/components/GlobalDownloadProgress.vue';
import ThemeSyncDialog from '@/components/ThemeSyncDialog.vue';
import GlobalHomeButton from '@/components/GlobalHomeButton.vue';
import GlobalSettingsButton from '@/components/GlobalSettingsButton.vue';
import AppTitleBar from '@/components/AppTitleBar.vue';
const isDesktop = import.meta.env.VITE_APP_TARGET === 'desktop';
// Initialize theme globally
useTheme();
const { isFullscreen, toggleFullscreen, exitFullscreen } = useFullscreen();
const handleGlobalKeyDown = async (e) => {
    if (e.key === 'F11') {
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat)
            return;
        await toggleFullscreen();
    }
    else if (e.key === 'Escape') {
        await exitFullscreen();
    }
};
onMounted(() => {
    window.addEventListener('keydown', handleGlobalKeyDown);
});
onUnmounted(() => {
    window.removeEventListener('keydown', handleGlobalKeyDown);
});
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['desktop-app']} */ ;
/** @type {__VLS_StyleScopedClasses['app-content']} */ ;
let __VLS_0;
/** @ts-ignore @type { | typeof __VLS_components.elConfigProvider | typeof __VLS_components.ElConfigProvider | typeof __VLS_components['el-config-provider'] | typeof __VLS_components.elConfigProvider | typeof __VLS_components.ElConfigProvider | typeof __VLS_components['el-config-provider']} */
elConfigProvider;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({}));
const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
var __VLS_5;
const { default: __VLS_6 } = __VLS_3.slots;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "app-container" },
    ...{ class: ({ 'desktop-app': __VLS_ctx.isDesktop }) },
});
/** @type {__VLS_StyleScopedClasses['app-container']} */ ;
/** @type {__VLS_StyleScopedClasses['desktop-app']} */ ;
if (__VLS_ctx.isDesktop && !__VLS_ctx.isFullscreen) {
    const __VLS_7 = AppTitleBar;
    // @ts-ignore
    const __VLS_8 = __VLS_asFunctionalComponent1(__VLS_7, new __VLS_7({}));
    const __VLS_9 = __VLS_8({}, ...__VLS_functionalComponentArgsRest(__VLS_8));
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "app-content" },
});
/** @type {__VLS_StyleScopedClasses['app-content']} */ ;
let __VLS_12;
/** @ts-ignore @type { | typeof __VLS_components.routerView | typeof __VLS_components.RouterView | typeof __VLS_components['router-view']} */
routerView;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent1(__VLS_12, new __VLS_12({}));
const __VLS_14 = __VLS_13({}, ...__VLS_functionalComponentArgsRest(__VLS_13));
const __VLS_17 = GlobalDownloadProgress;
// @ts-ignore
const __VLS_18 = __VLS_asFunctionalComponent1(__VLS_17, new __VLS_17({}));
const __VLS_19 = __VLS_18({}, ...__VLS_functionalComponentArgsRest(__VLS_18));
const __VLS_22 = ThemeSyncDialog;
// @ts-ignore
const __VLS_23 = __VLS_asFunctionalComponent1(__VLS_22, new __VLS_22({}));
const __VLS_24 = __VLS_23({}, ...__VLS_functionalComponentArgsRest(__VLS_23));
if (__VLS_ctx.isDesktop) {
    const __VLS_27 = GlobalHomeButton;
    // @ts-ignore
    const __VLS_28 = __VLS_asFunctionalComponent1(__VLS_27, new __VLS_27({}));
    const __VLS_29 = __VLS_28({}, ...__VLS_functionalComponentArgsRest(__VLS_28));
}
if (__VLS_ctx.isDesktop) {
    const __VLS_32 = GlobalSettingsButton;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent1(__VLS_32, new __VLS_32({}));
    const __VLS_34 = __VLS_33({}, ...__VLS_functionalComponentArgsRest(__VLS_33));
}
// @ts-ignore
[isDesktop, isDesktop, isDesktop, isDesktop, isFullscreen,];
var __VLS_3;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
