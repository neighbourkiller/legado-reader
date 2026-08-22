import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { UploadFilled } from '@element-plus/icons-vue';
import { useBookshelfStore } from '@/stores/bookshelf';
const router = useRouter();
const bookshelfStore = useBookshelfStore();
const showMenu = ref(false);
const showBookSourceModal = ref(false);
const showRssSourceModal = ref(false);
const isDragging = ref(false);
const fileInputRef = ref(null);
let dragCounter = 0;
const goToBookshelf = () => {
    router.push('/bookshelf');
};
const openBookSourceDialog = () => {
    showBookSourceModal.value = true;
};
const openRssSourceDialog = () => {
    showRssSourceModal.value = true;
};
const triggerBookUpload = () => {
    fileInputRef.value?.click();
};
const triggerBookUploadAndCloseMenu = () => {
    showMenu.value = false;
    triggerBookUpload();
};
const goTo = (path) => {
    showMenu.value = false;
    router.push(path);
};
const onDragOver = (e) => {
    e.preventDefault();
    if (dragCounter === 0) {
        isDragging.value = true;
    }
    dragCounter++;
};
const onDragLeave = (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter <= 0) {
        dragCounter = 0;
        isDragging.value = false;
    }
};
const onDrop = async (e) => {
    dragCounter = 0;
    isDragging.value = false;
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0)
        return;
    await processFiles(Array.from(files));
};
const handleFileSelect = async (e) => {
    const target = e.target;
    const files = target.files;
    if (!files || files.length === 0)
        return;
    await processFiles(Array.from(files));
    target.value = '';
};
const processFiles = async (files) => {
    const validFiles = files.filter(f => {
        const ext = f.name.split('.').pop()?.toLowerCase();
        return ext === 'txt' || ext === 'epub';
    });
    if (validFiles.length === 0) {
        ElMessage.error('仅支持导入 TXT 和 EPUB 格式的小说文件');
        return;
    }
    const loading = ElMessage({
        message: `正在导入 ${validFiles.length} 本书籍...`,
        type: 'info',
        duration: 0
    });
    try {
        for (const file of validFiles) {
            await bookshelfStore.parseAndImportBook(file);
        }
        loading.close();
        ElMessage.success('导入成功');
        router.push('/bookshelf');
    }
    catch (error) {
        loading.close();
        ElMessage.error('导入失败，请重试');
        console.error(error);
    }
};
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['menu-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['menu-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-button']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-button']} */ ;
/** @type {__VLS_StyleScopedClasses['next']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-button']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-button']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-button']} */ ;
/** @type {__VLS_StyleScopedClasses['close-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['drawer-links']} */ ;
/** @type {__VLS_StyleScopedClasses['drawer-links']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['dialog-link-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['banner-section']} */ ;
/** @type {__VLS_StyleScopedClasses['banner-title']} */ ;
/** @type {__VLS_StyleScopedClasses['site-header']} */ ;
/** @type {__VLS_StyleScopedClasses['banner-section']} */ ;
/** @type {__VLS_StyleScopedClasses['banner-title']} */ ;
/** @type {__VLS_StyleScopedClasses['banner-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['nav-button']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onDragover: (__VLS_ctx.onDragOver) },
    ...{ onDragleave: (__VLS_ctx.onDragLeave) },
    ...{ onDrop: (__VLS_ctx.onDrop) },
    ...{ class: "home-wrapper" },
});
/** @type {__VLS_StyleScopedClasses['home-wrapper']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "home-bg" },
});
/** @type {__VLS_StyleScopedClasses['home-bg']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "home-overlay" },
});
/** @type {__VLS_StyleScopedClasses['home-overlay']} */ ;
let __VLS_0;
/** @ts-ignore @type { | typeof __VLS_components.transition | typeof __VLS_components.Transition | typeof __VLS_components.transition | typeof __VLS_components.Transition} */
transition;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    name: "fade",
}));
const __VLS_2 = __VLS_1({
    name: "fade",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
const { default: __VLS_5 } = __VLS_3.slots;
if (__VLS_ctx.isDragging) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "drag-drop-overlay" },
    });
    /** @type {__VLS_StyleScopedClasses['drag-drop-overlay']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "drag-drop-box" },
    });
    /** @type {__VLS_StyleScopedClasses['drag-drop-box']} */ ;
    let __VLS_6;
    /** @ts-ignore @type { | typeof __VLS_components.elIcon | typeof __VLS_components.ElIcon | typeof __VLS_components['el-icon'] | typeof __VLS_components.elIcon | typeof __VLS_components.ElIcon | typeof __VLS_components['el-icon']} */
    elIcon;
    // @ts-ignore
    const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
        ...{ class: "drag-icon" },
    }));
    const __VLS_8 = __VLS_7({
        ...{ class: "drag-icon" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_7));
    /** @type {__VLS_StyleScopedClasses['drag-icon']} */ ;
    const { default: __VLS_11 } = __VLS_9.slots;
    let __VLS_12;
    /** @ts-ignore @type { | typeof __VLS_components.UploadFilled} */
    UploadFilled;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent1(__VLS_12, new __VLS_12({}));
    const __VLS_14 = __VLS_13({}, ...__VLS_functionalComponentArgsRest(__VLS_13));
    // @ts-ignore
    [onDragOver, onDragLeave, onDrop, isDragging,];
    var __VLS_9;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "drag-text" },
    });
    /** @type {__VLS_StyleScopedClasses['drag-text']} */ ;
}
// @ts-ignore
[];
var __VLS_3;
__VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
    ...{ class: "site-header" },
});
/** @type {__VLS_StyleScopedClasses['site-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.nav, __VLS_intrinsics.nav)({
    ...{ class: "header-nav" },
});
/** @type {__VLS_StyleScopedClasses['header-nav']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.a, __VLS_intrinsics.a)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.showMenu = true);
            // @ts-ignore
            [showMenu,];
        } },
    href: "#menu",
    ...{ class: "menu-btn" },
});
/** @type {__VLS_StyleScopedClasses['menu-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.main, __VLS_intrinsics.main)({
    ...{ class: "banner-section" },
});
/** @type {__VLS_StyleScopedClasses['banner-section']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "banner-inner" },
});
/** @type {__VLS_StyleScopedClasses['banner-inner']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
    ...{ class: "banner-header" },
});
/** @type {__VLS_StyleScopedClasses['banner-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({
    ...{ class: "banner-title" },
});
/** @type {__VLS_StyleScopedClasses['banner-title']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "banner-divider" },
});
/** @type {__VLS_StyleScopedClasses['banner-divider']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "banner-actions" },
});
/** @type {__VLS_StyleScopedClasses['banner-actions']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.goToBookshelf) },
    ...{ class: "nav-button next" },
});
/** @type {__VLS_StyleScopedClasses['nav-button']} */ ;
/** @type {__VLS_StyleScopedClasses['next']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.openBookSourceDialog) },
    ...{ class: "nav-button next" },
});
/** @type {__VLS_StyleScopedClasses['nav-button']} */ ;
/** @type {__VLS_StyleScopedClasses['next']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.triggerBookUpload) },
    ...{ class: "nav-button next" },
});
/** @type {__VLS_StyleScopedClasses['nav-button']} */ ;
/** @type {__VLS_StyleScopedClasses['next']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.openRssSourceDialog) },
    ...{ class: "nav-button next" },
});
/** @type {__VLS_StyleScopedClasses['nav-button']} */ ;
/** @type {__VLS_StyleScopedClasses['next']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    ...{ onChange: (__VLS_ctx.handleFileSelect) },
    ref: "fileInputRef",
    type: "file",
    accept: ".txt,.epub",
    multiple: true,
    ...{ class: "hidden-file-input" },
});
/** @type {__VLS_StyleScopedClasses['hidden-file-input']} */ ;
let __VLS_17;
/** @ts-ignore @type { | typeof __VLS_components.elDrawer | typeof __VLS_components.ElDrawer | typeof __VLS_components['el-drawer'] | typeof __VLS_components.elDrawer | typeof __VLS_components.ElDrawer | typeof __VLS_components['el-drawer']} */
elDrawer;
// @ts-ignore
const __VLS_18 = __VLS_asFunctionalComponent1(__VLS_17, new __VLS_17({
    modelValue: (__VLS_ctx.showMenu),
    direction: "rtl",
    size: "320px",
    showClose: (false),
    ...{ class: "forty-menu-drawer" },
    withHeader: (false),
}));
const __VLS_19 = __VLS_18({
    modelValue: (__VLS_ctx.showMenu),
    direction: "rtl",
    size: "320px",
    showClose: (false),
    ...{ class: "forty-menu-drawer" },
    withHeader: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_18));
/** @type {__VLS_StyleScopedClasses['forty-menu-drawer']} */ ;
const { default: __VLS_22 } = __VLS_20.slots;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "drawer-content" },
});
/** @type {__VLS_StyleScopedClasses['drawer-content']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "drawer-header" },
});
/** @type {__VLS_StyleScopedClasses['drawer-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.showMenu = false);
            // @ts-ignore
            [showMenu, showMenu, goToBookshelf, openBookSourceDialog, triggerBookUpload, openRssSourceDialog, handleFileSelect,];
        } },
    ...{ class: "close-btn" },
    'aria-label': "Close menu",
});
/** @type {__VLS_StyleScopedClasses['close-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
    ...{ class: "drawer-links" },
});
/** @type {__VLS_StyleScopedClasses['drawer-links']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.a, __VLS_intrinsics.a)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.goTo('/'));
            // @ts-ignore
            [goTo,];
        } },
    href: "javascript:void(0)",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.a, __VLS_intrinsics.a)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.goTo('/bookshelf'));
            // @ts-ignore
            [goTo,];
        } },
    href: "javascript:void(0)",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.a, __VLS_intrinsics.a)({
    ...{ onClick: (__VLS_ctx.triggerBookUploadAndCloseMenu) },
    href: "javascript:void(0)",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
    ...{ class: "divider-li" },
});
/** @type {__VLS_StyleScopedClasses['divider-li']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.a, __VLS_intrinsics.a)({
    href: "https://github.com/neighbourkiller/legado",
    target: "_blank",
    rel: "noopener noreferrer",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.a, __VLS_intrinsics.a)({
    href: "https://github.com/zsakvo",
    target: "_blank",
    rel: "noopener noreferrer",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.a, __VLS_intrinsics.a)({
    href: "https://html5up.net",
    target: "_blank",
    rel: "noopener noreferrer",
});
// @ts-ignore
[triggerBookUploadAndCloseMenu,];
var __VLS_20;
let __VLS_23;
/** @ts-ignore @type { | typeof __VLS_components.elDialog | typeof __VLS_components.ElDialog | typeof __VLS_components['el-dialog'] | typeof __VLS_components.elDialog | typeof __VLS_components.ElDialog | typeof __VLS_components['el-dialog']} */
elDialog;
// @ts-ignore
const __VLS_24 = __VLS_asFunctionalComponent1(__VLS_23, new __VLS_23({
    modelValue: (__VLS_ctx.showBookSourceModal),
    title: "书源说明",
    width: "480px",
    center: true,
    alignCenter: true,
    ...{ class: "forty-dialog" },
}));
const __VLS_25 = __VLS_24({
    modelValue: (__VLS_ctx.showBookSourceModal),
    title: "书源说明",
    width: "480px",
    center: true,
    alignCenter: true,
    ...{ class: "forty-dialog" },
}, ...__VLS_functionalComponentArgsRest(__VLS_24));
/** @type {__VLS_StyleScopedClasses['forty-dialog']} */ ;
const { default: __VLS_28 } = __VLS_26.slots;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "dialog-body" },
});
/** @type {__VLS_StyleScopedClasses['dialog-body']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
    ...{ class: "dialog-desc" },
});
/** @type {__VLS_StyleScopedClasses['dialog-desc']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.code, __VLS_intrinsics.code)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.code, __VLS_intrinsics.code)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
    ...{ class: "dialog-desc" },
});
/** @type {__VLS_StyleScopedClasses['dialog-desc']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
{
    const { footer: __VLS_29 } = __VLS_26.slots;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "dialog-footer" },
    });
    /** @type {__VLS_StyleScopedClasses['dialog-footer']} */ ;
    let __VLS_30;
    /** @ts-ignore @type { | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button'] | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button']} */
    elButton;
    // @ts-ignore
    const __VLS_31 = __VLS_asFunctionalComponent1(__VLS_30, new __VLS_30({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_32 = __VLS_31({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_31));
    let __VLS_35;
    const __VLS_36 = {
        /** @type {typeof __VLS_35.click} */
        onClick: (...[$event]) => {
            return (__VLS_ctx.showBookSourceModal = false);
            // @ts-ignore
            [showBookSourceModal, showBookSourceModal,];
        },
    };
    const { default: __VLS_37 } = __VLS_33.slots;
    // @ts-ignore
    [];
    var __VLS_33;
    var __VLS_34;
    __VLS_asFunctionalElement1(__VLS_intrinsics.a, __VLS_intrinsics.a)({
        href: "https://github.com/neighbourkiller/legado",
        target: "_blank",
        rel: "noopener noreferrer",
        ...{ class: "dialog-link-btn" },
    });
    /** @type {__VLS_StyleScopedClasses['dialog-link-btn']} */ ;
    // @ts-ignore
    [];
}
// @ts-ignore
[];
var __VLS_26;
let __VLS_38;
/** @ts-ignore @type { | typeof __VLS_components.elDialog | typeof __VLS_components.ElDialog | typeof __VLS_components['el-dialog'] | typeof __VLS_components.elDialog | typeof __VLS_components.ElDialog | typeof __VLS_components['el-dialog']} */
elDialog;
// @ts-ignore
const __VLS_39 = __VLS_asFunctionalComponent1(__VLS_38, new __VLS_38({
    modelValue: (__VLS_ctx.showRssSourceModal),
    title: "订阅源说明",
    width: "480px",
    center: true,
    alignCenter: true,
    ...{ class: "forty-dialog" },
}));
const __VLS_40 = __VLS_39({
    modelValue: (__VLS_ctx.showRssSourceModal),
    title: "订阅源说明",
    width: "480px",
    center: true,
    alignCenter: true,
    ...{ class: "forty-dialog" },
}, ...__VLS_functionalComponentArgsRest(__VLS_39));
/** @type {__VLS_StyleScopedClasses['forty-dialog']} */ ;
const { default: __VLS_43 } = __VLS_41.slots;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "dialog-body" },
});
/** @type {__VLS_StyleScopedClasses['dialog-body']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
    ...{ class: "dialog-desc" },
});
/** @type {__VLS_StyleScopedClasses['dialog-desc']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
    ...{ class: "dialog-desc" },
});
/** @type {__VLS_StyleScopedClasses['dialog-desc']} */ ;
{
    const { footer: __VLS_44 } = __VLS_41.slots;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "dialog-footer" },
    });
    /** @type {__VLS_StyleScopedClasses['dialog-footer']} */ ;
    let __VLS_45;
    /** @ts-ignore @type { | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button'] | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button']} */
    elButton;
    // @ts-ignore
    const __VLS_46 = __VLS_asFunctionalComponent1(__VLS_45, new __VLS_45({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_47 = __VLS_46({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_46));
    let __VLS_50;
    const __VLS_51 = {
        /** @type {typeof __VLS_50.click} */
        onClick: (...[$event]) => {
            return (__VLS_ctx.showRssSourceModal = false);
            // @ts-ignore
            [showRssSourceModal, showRssSourceModal,];
        },
    };
    const { default: __VLS_52 } = __VLS_48.slots;
    // @ts-ignore
    [];
    var __VLS_48;
    var __VLS_49;
    // @ts-ignore
    [];
}
// @ts-ignore
[];
var __VLS_41;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
