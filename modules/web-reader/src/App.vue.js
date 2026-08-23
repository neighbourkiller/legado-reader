import { onMounted, onUnmounted } from 'vue';
import { useTheme } from '@/composables/useTheme';
import { useFullscreen } from '@/composables/useFullscreen';
// Initialize theme globally
useTheme();
const { toggleFullscreen, exitFullscreen } = useFullscreen();
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
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
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
});
/** @type {__VLS_StyleScopedClasses['app-container']} */ ;
let __VLS_7;
/** @ts-ignore @type { | typeof __VLS_components.routerView | typeof __VLS_components.RouterView | typeof __VLS_components['router-view']} */
routerView;
// @ts-ignore
const __VLS_8 = __VLS_asFunctionalComponent1(__VLS_7, new __VLS_7({}));
const __VLS_9 = __VLS_8({}, ...__VLS_functionalComponentArgsRest(__VLS_8));
var __VLS_3;
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
