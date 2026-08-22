import { ref, computed } from 'vue';
import { Search } from '@element-plus/icons-vue';
import { useSystemFonts } from '@/composables/useSystemFonts';
const props = defineProps();
const emit = defineEmits();
const visible = computed({
    get: () => props.modelValue,
    set: val => emit('update:modelValue', val),
});
const { systemFonts, isLoading, loadFonts } = useSystemFonts();
const searchQuery = ref('');
const handleOpen = () => {
    searchQuery.value = '';
    loadFonts();
};
// 置顶列表：合并当前使用字体 + 常用收藏列表（去重）
const topFavorites = computed(() => {
    const list = [];
    if (props.currentFont && props.currentFont.trim()) {
        list.push(props.currentFont.trim());
    }
    for (const f of props.favoriteFonts || []) {
        if (f && f.trim() && !list.includes(f.trim())) {
            list.push(f.trim());
        }
    }
    return list;
});
const isFavorite = (font) => {
    return topFavorites.value.includes(font);
};
const toggleFavorite = (font) => {
    const current = [...(props.favoriteFonts || [])];
    const idx = current.indexOf(font);
    if (idx !== -1) {
        current.splice(idx, 1);
    }
    else {
        current.unshift(font); // 勾选后置顶于常用最上方
    }
    emit('updateFavorites', current);
};
// 过滤后的常用字体
const displayFavorites = computed(() => {
    const q = searchQuery.value.trim().toLowerCase();
    if (!q)
        return topFavorites.value;
    return topFavorites.value.filter(f => f.toLowerCase().includes(q));
});
// 过滤后的全部字体 (排除已在置顶常用中的，避免重复展示)
const filteredAllFonts = computed(() => {
    const q = searchQuery.value.trim().toLowerCase();
    const list = systemFonts.value.filter(f => !topFavorites.value.includes(f));
    if (!q)
        return list;
    return list.filter(f => f.toLowerCase().includes(q));
});
const handleSelect = (font) => {
    // 选择字体时，自动加入常用置顶列表最前部
    const current = [
        font,
        ...(props.favoriteFonts || []).filter(f => f !== font),
    ];
    emit('updateFavorites', current);
    emit('select', font);
    visible.value = false;
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
/** @type {__VLS_StyleScopedClasses['active']} */ ;
let __VLS_0;
/** @ts-ignore @type { | typeof __VLS_components.elDialog | typeof __VLS_components.ElDialog | typeof __VLS_components['el-dialog'] | typeof __VLS_components.elDialog | typeof __VLS_components.ElDialog | typeof __VLS_components['el-dialog']} */
elDialog;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    ...{ 'onOpen': {} },
    modelValue: (__VLS_ctx.visible),
    title: "选择系统字体",
    width: "540px",
    ...{ class: "system-font-dialog" },
    destroyOnClose: true,
    appendToBody: true,
}));
const __VLS_2 = __VLS_1({
    ...{ 'onOpen': {} },
    modelValue: (__VLS_ctx.visible),
    title: "选择系统字体",
    width: "540px",
    ...{ class: "system-font-dialog" },
    destroyOnClose: true,
    appendToBody: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_5;
const __VLS_6 = {
    /** @type {typeof __VLS_5.open} */
    onOpen: (__VLS_ctx.handleOpen),
};
var __VLS_7;
/** @type {__VLS_StyleScopedClasses['system-font-dialog']} */ ;
const { default: __VLS_8 } = __VLS_3.slots;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "font-dialog-body" },
});
__VLS_asFunctionalDirective(__VLS_directives.vLoading, {})(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.isLoading), }, null, null);
/** @type {__VLS_StyleScopedClasses['font-dialog-body']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "search-bar" },
});
/** @type {__VLS_StyleScopedClasses['search-bar']} */ ;
let __VLS_9;
/** @ts-ignore @type { | typeof __VLS_components.elInput | typeof __VLS_components.ElInput | typeof __VLS_components['el-input']} */
elInput;
// @ts-ignore
const __VLS_10 = __VLS_asFunctionalComponent1(__VLS_9, new __VLS_9({
    modelValue: (__VLS_ctx.searchQuery),
    placeholder: "搜索字体名称...",
    clearable: true,
    prefixIcon: (__VLS_ctx.Search),
}));
const __VLS_11 = __VLS_10({
    modelValue: (__VLS_ctx.searchQuery),
    placeholder: "搜索字体名称...",
    clearable: true,
    prefixIcon: (__VLS_ctx.Search),
}, ...__VLS_functionalComponentArgsRest(__VLS_10));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "font-list-scroll" },
});
/** @type {__VLS_StyleScopedClasses['font-list-scroll']} */ ;
if (__VLS_ctx.displayFavorites.length > 0) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "section-container" },
    });
    /** @type {__VLS_StyleScopedClasses['section-container']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "section-title" },
    });
    /** @type {__VLS_StyleScopedClasses['section-title']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "star-icon filled" },
    });
    /** @type {__VLS_StyleScopedClasses['star-icon']} */ ;
    /** @type {__VLS_StyleScopedClasses['filled']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "count-badge" },
    });
    /** @type {__VLS_StyleScopedClasses['count-badge']} */ ;
    (__VLS_ctx.displayFavorites.length);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "font-grid" },
    });
    /** @type {__VLS_StyleScopedClasses['font-grid']} */ ;
    for (const [font] of __VLS_vFor((__VLS_ctx.displayFavorites))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.displayFavorites.length > 0))
                        throw 0;
                    return (__VLS_ctx.handleSelect(font));
                    // @ts-ignore
                    [visible, handleOpen, vLoading, isLoading, searchQuery, Search, displayFavorites, displayFavorites, displayFavorites, handleSelect,];
                } },
            key: ('fav-' + font),
            ...{ class: "font-item-card" },
            ...{ class: ({ active: __VLS_ctx.currentFont === font }) },
        });
        /** @type {__VLS_StyleScopedClasses['font-item-card']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "card-left" },
        });
        /** @type {__VLS_StyleScopedClasses['card-left']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.displayFavorites.length > 0))
                        throw 0;
                    return (__VLS_ctx.toggleFavorite(font));
                    // @ts-ignore
                    [currentFont, toggleFavorite,];
                } },
            type: "button",
            ...{ class: "star-btn active" },
            title: "常用字体",
        });
        /** @type {__VLS_StyleScopedClasses['star-btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "font-meta" },
        });
        /** @type {__VLS_StyleScopedClasses['font-meta']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "font-name" },
            title: (font),
        });
        /** @type {__VLS_StyleScopedClasses['font-name']} */ ;
        (font);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "font-preview" },
            ...{ style: ({ fontFamily: `&quot;${font}&quot;, sans-serif` }) },
        });
        /** @type {__VLS_StyleScopedClasses['font-preview']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "card-right" },
        });
        /** @type {__VLS_StyleScopedClasses['card-right']} */ ;
        if (__VLS_ctx.currentFont === font) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "using-badge" },
            });
            /** @type {__VLS_StyleScopedClasses['using-badge']} */ ;
        }
        // @ts-ignore
        [currentFont,];
    }
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "section-container" },
});
/** @type {__VLS_StyleScopedClasses['section-container']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "section-title" },
});
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "section-icon" },
});
/** @type {__VLS_StyleScopedClasses['section-icon']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "count-badge" },
});
/** @type {__VLS_StyleScopedClasses['count-badge']} */ ;
(__VLS_ctx.filteredAllFonts.length);
if (__VLS_ctx.filteredAllFonts.length === 0 && !__VLS_ctx.isLoading) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "empty-tip" },
    });
    /** @type {__VLS_StyleScopedClasses['empty-tip']} */ ;
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "font-grid" },
});
/** @type {__VLS_StyleScopedClasses['font-grid']} */ ;
for (const [font] of __VLS_vFor((__VLS_ctx.filteredAllFonts))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (...[$event]) => {
                return (__VLS_ctx.handleSelect(font));
                // @ts-ignore
                [isLoading, handleSelect, filteredAllFonts, filteredAllFonts, filteredAllFonts,];
            } },
        key: ('all-' + font),
        ...{ class: "font-item-card" },
        ...{ class: ({ active: __VLS_ctx.currentFont === font }) },
    });
    /** @type {__VLS_StyleScopedClasses['font-item-card']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "card-left" },
    });
    /** @type {__VLS_StyleScopedClasses['card-left']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                return (__VLS_ctx.toggleFavorite(font));
                // @ts-ignore
                [currentFont, toggleFavorite,];
            } },
        type: "button",
        ...{ class: "star-btn" },
        ...{ class: ({ active: __VLS_ctx.isFavorite(font) }) },
        title: (__VLS_ctx.isFavorite(font) ? '取消常用' : '设为常用置顶'),
    });
    /** @type {__VLS_StyleScopedClasses['star-btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    (__VLS_ctx.isFavorite(font) ? '★' : '☆');
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "font-meta" },
    });
    /** @type {__VLS_StyleScopedClasses['font-meta']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "font-name" },
        title: (font),
    });
    /** @type {__VLS_StyleScopedClasses['font-name']} */ ;
    (font);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "font-preview" },
        ...{ style: ({ fontFamily: `&quot;${font}&quot;, sans-serif` }) },
    });
    /** @type {__VLS_StyleScopedClasses['font-preview']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "card-right" },
    });
    /** @type {__VLS_StyleScopedClasses['card-right']} */ ;
    if (__VLS_ctx.currentFont === font) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "using-badge" },
        });
        /** @type {__VLS_StyleScopedClasses['using-badge']} */ ;
    }
    // @ts-ignore
    [currentFont, isFavorite, isFavorite, isFavorite,];
}
// @ts-ignore
[];
var __VLS_3;
var __VLS_4;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
