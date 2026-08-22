import { computed } from 'vue';
const props = defineProps();
const emit = defineEmits();
const firstChar = computed(() => {
    return props.book.name ? props.book.name.charAt(0) : '书';
});
const coverBgColor = computed(() => {
    const colors = ['#e1f5fe', '#e8f5e9', '#fff3e0', '#f3e5f5', '#e8eaf6'];
    const index = props.book.name ? props.book.name.charCodeAt(0) % colors.length : 0;
    return colors[index];
});
const formattedTime = computed(() => {
    if (!props.book.lastReadTime)
        return '未读';
    const date = new Date(props.book.lastReadTime);
    return `${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;
});
const handleOpen = () => {
    emit('open', props.book.id);
};
const handleDelete = () => {
    emit('delete', props.book.id);
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
/** @type {__VLS_StyleScopedClasses['book-card']} */ ;
let __VLS_0;
/** @ts-ignore @type { | typeof __VLS_components.elCard | typeof __VLS_components.ElCard | typeof __VLS_components['el-card'] | typeof __VLS_components.elCard | typeof __VLS_components.ElCard | typeof __VLS_components['el-card']} */
elCard;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    ...{ 'onClick': {} },
    ...{ class: "book-card" },
    bodyStyle: ({ padding: '0px' }),
    shadow: "hover",
}));
const __VLS_2 = __VLS_1({
    ...{ 'onClick': {} },
    ...{ class: "book-card" },
    bodyStyle: ({ padding: '0px' }),
    shadow: "hover",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_5;
const __VLS_6 = {
    /** @type {typeof __VLS_5.click} */
    onClick: (__VLS_ctx.handleOpen),
};
var __VLS_7;
/** @type {__VLS_StyleScopedClasses['book-card']} */ ;
const { default: __VLS_8 } = __VLS_3.slots;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "cover-placeholder" },
    ...{ style: ({ backgroundColor: __VLS_ctx.coverBgColor }) },
});
/** @type {__VLS_StyleScopedClasses['cover-placeholder']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "cover-text" },
});
/** @type {__VLS_StyleScopedClasses['cover-text']} */ ;
(__VLS_ctx.firstChar);
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "book-info" },
});
/** @type {__VLS_StyleScopedClasses['book-info']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({
    ...{ class: "book-name" },
});
/** @type {__VLS_StyleScopedClasses['book-name']} */ ;
(__VLS_ctx.book.name);
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
    ...{ class: "book-author" },
});
/** @type {__VLS_StyleScopedClasses['book-author']} */ ;
(__VLS_ctx.book.author || '未知作者');
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "progress-container" },
});
/** @type {__VLS_StyleScopedClasses['progress-container']} */ ;
let __VLS_9;
/** @ts-ignore @type { | typeof __VLS_components.elProgress | typeof __VLS_components.ElProgress | typeof __VLS_components['el-progress']} */
elProgress;
// @ts-ignore
const __VLS_10 = __VLS_asFunctionalComponent1(__VLS_9, new __VLS_9({
    percentage: (Number(__VLS_ctx.book.currentProgress.toFixed(1))),
    showText: (false),
}));
const __VLS_11 = __VLS_10({
    percentage: (Number(__VLS_ctx.book.currentProgress.toFixed(1))),
    showText: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_10));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "actions" },
});
/** @type {__VLS_StyleScopedClasses['actions']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "last-read" },
});
/** @type {__VLS_StyleScopedClasses['last-read']} */ ;
(__VLS_ctx.formattedTime);
let __VLS_14;
/** @ts-ignore @type { | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button']} */
elButton;
// @ts-ignore
const __VLS_15 = __VLS_asFunctionalComponent1(__VLS_14, new __VLS_14({
    ...{ 'onClick': {} },
    type: "danger",
    icon: "Delete",
    circle: true,
    size: "small",
}));
const __VLS_16 = __VLS_15({
    ...{ 'onClick': {} },
    type: "danger",
    icon: "Delete",
    circle: true,
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_15));
let __VLS_19;
const __VLS_20 = {
    /** @type {typeof __VLS_19.click} */
    onClick: (__VLS_ctx.handleDelete),
};
var __VLS_17;
var __VLS_18;
// @ts-ignore
[handleOpen, coverBgColor, firstChar, book, book, book, formattedTime, handleDelete,];
var __VLS_3;
var __VLS_4;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
