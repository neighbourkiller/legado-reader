import { ref, computed } from 'vue';
import { Edit, Delete } from '@element-plus/icons-vue';
import defaultCover from '@/assets/imgs/default_cover.jpg';
const props = defineProps();
const emit = defineEmits();
const dropdownRef = ref(null);
const imageLoadFailed = ref(false);
const hasCoverImage = computed(() => {
    return Boolean(props.book.coverUrl) && !imageLoadFailed.value;
});
const coverSrc = computed(() => {
    if (props.book.coverUrl && !imageLoadFailed.value) {
        return props.book.coverUrl;
    }
    return defaultCover;
});
const onImageError = () => {
    imageLoadFailed.value = true;
};
const timeFormatted = computed(() => {
    if (!props.book.lastReadTime)
        return props.book.format.toUpperCase();
    const diff = Date.now() - props.book.lastReadTime;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0)
        return `${days}天前`;
    if (hours > 0)
        return `${hours}小时前`;
    if (minutes > 0)
        return `${minutes}分钟前`;
    return '刚刚';
});
const durChapterText = computed(() => {
    if (props.book.durChapterTitle) {
        return props.book.durChapterTitle;
    }
    if (props.book.currentChapter !== undefined && props.book.currentChapter > 0) {
        return `第${props.book.currentChapter + 1}章`;
    }
    return '尚无阅读记录';
});
const latestChapterText = computed(() => {
    if (props.book.latestChapterTitle) {
        return props.book.latestChapterTitle;
    }
    return `第${props.book.totalChapters}章`;
});
const handleOpen = () => {
    emit('open', props.book.id);
};
const handleContextMenu = () => {
    dropdownRef.value?.handleOpen();
};
const handleCommand = (command) => {
    if (command === 'edit') {
        emit('edit', props.book);
    }
    else if (command === 'delete') {
        emit('delete', props.book.id);
    }
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
/** @type {__VLS_StyleScopedClasses['book-item-card']} */ ;
/** @type {__VLS_StyleScopedClasses['book-item-card']} */ ;
/** @type {__VLS_StyleScopedClasses['dark']} */ ;
/** @type {__VLS_StyleScopedClasses['book-title']} */ ;
/** @type {__VLS_StyleScopedClasses['book-item-card']} */ ;
/** @type {__VLS_StyleScopedClasses['more-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['more-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['dark']} */ ;
/** @type {__VLS_StyleScopedClasses['more-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['dark']} */ ;
/** @type {__VLS_StyleScopedClasses['more-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['dark']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-info']} */ ;
/** @type {__VLS_StyleScopedClasses['dark']} */ ;
/** @type {__VLS_StyleScopedClasses['dur-chapter']} */ ;
/** @type {__VLS_StyleScopedClasses['dark']} */ ;
/** @type {__VLS_StyleScopedClasses['last-chapter']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onClick: (__VLS_ctx.handleOpen) },
    ...{ onContextmenu: (__VLS_ctx.handleContextMenu) },
    ...{ class: "book-item-card" },
});
/** @type {__VLS_StyleScopedClasses['book-item-card']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "cover-wrapper" },
});
/** @type {__VLS_StyleScopedClasses['cover-wrapper']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.img)({
    ...{ onError: (__VLS_ctx.onImageError) },
    ...{ class: "cover-img" },
    src: (__VLS_ctx.coverSrc),
    alt: (__VLS_ctx.book.name),
    loading: "lazy",
});
/** @type {__VLS_StyleScopedClasses['cover-img']} */ ;
if (!__VLS_ctx.hasCoverImage) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "cover-title-overlay" },
    });
    /** @type {__VLS_StyleScopedClasses['cover-title-overlay']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "cover-name" },
    });
    /** @type {__VLS_StyleScopedClasses['cover-name']} */ ;
    (__VLS_ctx.book.name);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "cover-author" },
    });
    /** @type {__VLS_StyleScopedClasses['cover-author']} */ ;
    (__VLS_ctx.book.author);
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "info-wrapper" },
});
/** @type {__VLS_StyleScopedClasses['info-wrapper']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "title-row" },
});
/** @type {__VLS_StyleScopedClasses['title-row']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "book-title" },
    title: (__VLS_ctx.book.name),
});
/** @type {__VLS_StyleScopedClasses['book-title']} */ ;
(__VLS_ctx.book.name);
let __VLS_0;
/** @ts-ignore @type { | typeof __VLS_components.elDropdown | typeof __VLS_components.ElDropdown | typeof __VLS_components['el-dropdown'] | typeof __VLS_components.elDropdown | typeof __VLS_components.ElDropdown | typeof __VLS_components['el-dropdown']} */
elDropdown;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    ...{ 'onCommand': {} },
    ...{ 'onClick': {} },
    ref: "dropdownRef",
    trigger: "click",
    placement: "bottom-end",
}));
const __VLS_2 = __VLS_1({
    ...{ 'onCommand': {} },
    ...{ 'onClick': {} },
    ref: "dropdownRef",
    trigger: "click",
    placement: "bottom-end",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_5;
const __VLS_6 = {
    /** @type {typeof __VLS_5.command} */
    onCommand: (__VLS_ctx.handleCommand),
};
const __VLS_7 = {
    /** @type {typeof __VLS_5.click} */
    onClick: () => { },
};
var __VLS_8;
const { default: __VLS_10 } = __VLS_3.slots;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: () => { } },
    type: "button",
    ...{ class: "more-btn" },
    title: "更多操作",
    'aria-label': "更多操作",
});
/** @type {__VLS_StyleScopedClasses['more-btn']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
    ...{ class: "more-icon" },
    viewBox: "0 0 24 24",
    fill: "currentColor",
});
/** @type {__VLS_StyleScopedClasses['more-icon']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.circle, __VLS_intrinsics.circle)({
    cx: "12",
    cy: "5",
    r: "2.2",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.circle, __VLS_intrinsics.circle)({
    cx: "12",
    cy: "12",
    r: "2.2",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.circle, __VLS_intrinsics.circle)({
    cx: "12",
    cy: "19",
    r: "2.2",
});
{
    const { dropdown: __VLS_11 } = __VLS_3.slots;
    let __VLS_12;
    /** @ts-ignore @type { | typeof __VLS_components.elDropdownMenu | typeof __VLS_components.ElDropdownMenu | typeof __VLS_components['el-dropdown-menu'] | typeof __VLS_components.elDropdownMenu | typeof __VLS_components.ElDropdownMenu | typeof __VLS_components['el-dropdown-menu']} */
    elDropdownMenu;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent1(__VLS_12, new __VLS_12({
        ...{ class: "book-action-menu" },
    }));
    const __VLS_14 = __VLS_13({
        ...{ class: "book-action-menu" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_13));
    /** @type {__VLS_StyleScopedClasses['book-action-menu']} */ ;
    const { default: __VLS_17 } = __VLS_15.slots;
    let __VLS_18;
    /** @ts-ignore @type { | typeof __VLS_components.elDropdownItem | typeof __VLS_components.ElDropdownItem | typeof __VLS_components['el-dropdown-item'] | typeof __VLS_components.elDropdownItem | typeof __VLS_components.ElDropdownItem | typeof __VLS_components['el-dropdown-item']} */
    elDropdownItem;
    // @ts-ignore
    const __VLS_19 = __VLS_asFunctionalComponent1(__VLS_18, new __VLS_18({
        command: "edit",
        icon: (__VLS_ctx.Edit),
    }));
    const __VLS_20 = __VLS_19({
        command: "edit",
        icon: (__VLS_ctx.Edit),
    }, ...__VLS_functionalComponentArgsRest(__VLS_19));
    const { default: __VLS_23 } = __VLS_21.slots;
    // @ts-ignore
    [handleOpen, handleContextMenu, onImageError, coverSrc, book, book, book, book, book, hasCoverImage, handleCommand, Edit,];
    var __VLS_21;
    let __VLS_24;
    /** @ts-ignore @type { | typeof __VLS_components.elDropdownItem | typeof __VLS_components.ElDropdownItem | typeof __VLS_components['el-dropdown-item'] | typeof __VLS_components.elDropdownItem | typeof __VLS_components.ElDropdownItem | typeof __VLS_components['el-dropdown-item']} */
    elDropdownItem;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent1(__VLS_24, new __VLS_24({
        command: "delete",
        icon: (__VLS_ctx.Delete),
        divided: true,
        ...{ class: "delete-action-item" },
    }));
    const __VLS_26 = __VLS_25({
        command: "delete",
        icon: (__VLS_ctx.Delete),
        divided: true,
        ...{ class: "delete-action-item" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    /** @type {__VLS_StyleScopedClasses['delete-action-item']} */ ;
    const { default: __VLS_29 } = __VLS_27.slots;
    // @ts-ignore
    [Delete,];
    var __VLS_27;
    // @ts-ignore
    [];
    var __VLS_15;
    // @ts-ignore
    [];
}
// @ts-ignore
[];
var __VLS_3;
var __VLS_4;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "sub-info" },
});
/** @type {__VLS_StyleScopedClasses['sub-info']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "author" },
    title: (__VLS_ctx.book.author),
});
/** @type {__VLS_StyleScopedClasses['author']} */ ;
(__VLS_ctx.book.author || '佚名');
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "dot" },
});
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "chapters" },
});
/** @type {__VLS_StyleScopedClasses['chapters']} */ ;
(__VLS_ctx.book.totalChapters);
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "dot" },
});
/** @type {__VLS_StyleScopedClasses['dot']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "time" },
});
/** @type {__VLS_StyleScopedClasses['time']} */ ;
(__VLS_ctx.timeFormatted);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "dur-chapter" },
    title: (__VLS_ctx.durChapterText),
});
/** @type {__VLS_StyleScopedClasses['dur-chapter']} */ ;
(__VLS_ctx.durChapterText);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "last-chapter" },
    title: (__VLS_ctx.latestChapterText),
});
/** @type {__VLS_StyleScopedClasses['last-chapter']} */ ;
(__VLS_ctx.latestChapterText);
// @ts-ignore
var __VLS_9 = __VLS_8;
// @ts-ignore
[book, book, book, timeFormatted, durChapterText, durChapterText, latestChapterText, latestChapterText,];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
