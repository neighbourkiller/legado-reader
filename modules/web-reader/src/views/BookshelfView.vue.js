import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessageBox, ElMessage } from 'element-plus';
import BookCard from '@/components/BookCard.vue';
import { useBookshelfStore } from '@/stores/bookshelf';
const router = useRouter();
const bookshelfStore = useBookshelfStore();
onMounted(async () => {
    await bookshelfStore.loadBooks();
});
const openBook = (id) => {
    router.push(`/reader/${id}`);
};
const confirmDeleteBook = (id) => {
    ElMessageBox.confirm('确定要删除这本书吗？阅读进度也将一并删除。', '删除确认', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
    }).then(async () => {
        try {
            await bookshelfStore.deleteBook(id);
            ElMessage.success('已删除');
        }
        catch (error) {
            ElMessage.error('删除失败');
        }
    }).catch(() => {
        // cancelled
    });
};
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "bookshelf-container" },
});
/** @type {__VLS_StyleScopedClasses['bookshelf-container']} */ ;
if (__VLS_ctx.bookshelfStore.books.length > 0) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "books-grid" },
    });
    /** @type {__VLS_StyleScopedClasses['books-grid']} */ ;
    for (const [book] of __VLS_vFor((__VLS_ctx.bookshelfStore.books))) {
        const __VLS_0 = BookCard;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
            ...{ 'onOpen': {} },
            ...{ 'onDelete': {} },
            key: (book.id),
            book: (book),
        }));
        const __VLS_2 = __VLS_1({
            ...{ 'onOpen': {} },
            ...{ 'onDelete': {} },
            key: (book.id),
            book: (book),
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
        let __VLS_5;
        const __VLS_6 = {
            /** @type {typeof __VLS_5.open} */
            onOpen: (__VLS_ctx.openBook),
        };
        const __VLS_7 = {
            /** @type {typeof __VLS_5.delete} */
            onDelete: (__VLS_ctx.confirmDeleteBook),
        };
        var __VLS_3;
        var __VLS_4;
        // @ts-ignore
        [bookshelfStore, bookshelfStore, openBook, confirmDeleteBook,];
    }
}
else {
    let __VLS_8;
    /** @ts-ignore @type { | typeof __VLS_components.elEmpty | typeof __VLS_components.ElEmpty | typeof __VLS_components['el-empty'] | typeof __VLS_components.elEmpty | typeof __VLS_components.ElEmpty | typeof __VLS_components['el-empty']} */
    elEmpty;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent1(__VLS_8, new __VLS_8({
        description: "书架空空如也，去首页导入小说吧",
    }));
    const __VLS_10 = __VLS_9({
        description: "书架空空如也，去首页导入小说吧",
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    const { default: __VLS_13 } = __VLS_11.slots;
    let __VLS_14;
    /** @ts-ignore @type { | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button'] | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button']} */
    elButton;
    // @ts-ignore
    const __VLS_15 = __VLS_asFunctionalComponent1(__VLS_14, new __VLS_14({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_16 = __VLS_15({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_15));
    let __VLS_19;
    const __VLS_20 = {
        /** @type {typeof __VLS_19.click} */
        onClick: (...[$event]) => {
            if (!!(__VLS_ctx.bookshelfStore.books.length > 0))
                throw 0;
            return (__VLS_ctx.router.push('/'));
            // @ts-ignore
            [router,];
        },
    };
    const { default: __VLS_21 } = __VLS_17.slots;
    // @ts-ignore
    [];
    var __VLS_17;
    var __VLS_18;
    // @ts-ignore
    [];
    var __VLS_11;
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
