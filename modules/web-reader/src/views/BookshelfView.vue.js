import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessageBox, ElMessage } from 'element-plus';
import { ArrowDown, Plus, Search, Sort as SortIcon, UploadFilled } from '@element-plus/icons-vue';
import '@/assets/fonts/shelffont.css';
import defaultCover from '@/assets/imgs/default_cover.jpg';
import BookCard from '@/components/BookCard.vue';
import ThemeToggle from '@/components/ThemeToggle.vue';
import { useBookshelfStore } from '@/stores/bookshelf';
import { useAppSettingsStore } from '@/stores/appSettings';
import { useTheme } from '@/composables/useTheme';
const router = useRouter();
const isDesktop = import.meta.env.VITE_APP_TARGET === 'desktop';
const bookshelfStore = useBookshelfStore();
const appSettingsStore = useAppSettingsStore();
const { isDark } = useTheme();
const searchWord = ref('');
const bookshelfSort = ref('recent');
const bookshelfSortLabels = {
    recent: '最近阅读',
    name: '书名',
    author: '作者',
    progress: '阅读进度',
};
const isDragging = ref(false);
const fileInputRef = ref(null);
const coverFileInputRef = ref(null);
const showEditDialog = ref(false);
const editForm = ref({
    id: '',
    name: '',
    author: '',
    coverUrl: '',
});
let dragCounter = 0;
onMounted(async () => {
    await bookshelfStore.loadBooks();
});
const filteredBooks = computed(() => {
    const query = searchWord.value.trim().toLowerCase();
    const books = query ? bookshelfStore.books.filter(b => {
        return (b.name.toLowerCase().includes(query) ||
            (b.author && b.author.toLowerCase().includes(query)));
    }) : bookshelfStore.books;
    return [...books].sort((a, b) => {
        if (bookshelfSort.value === 'name') {
            return a.name.localeCompare(b.name, 'zh-CN');
        }
        if (bookshelfSort.value === 'author') {
            return (a.author || '佚名').localeCompare(b.author || '佚名', 'zh-CN')
                || a.name.localeCompare(b.name, 'zh-CN');
        }
        if (bookshelfSort.value === 'progress') {
            return b.currentProgress - a.currentProgress || b.lastReadTime - a.lastReadTime;
        }
        return b.lastReadTime - a.lastReadTime;
    });
});
const handleBookshelfSortCommand = (command) => {
    if (command in bookshelfSortLabels) {
        bookshelfSort.value = command;
    }
};
const mostRecentBook = computed(() => {
    if (bookshelfStore.books.length === 0)
        return null;
    // The store already sorts books by lastReadTime descending
    return bookshelfStore.books[0];
});
const openRecentBook = () => {
    if (mostRecentBook.value) {
        openBook(mostRecentBook.value.id);
    }
};
const openBook = (id) => {
    if (isDesktop && appSettingsStore.bookshelfClickAction === 'detail') {
        router.push({
            path: '/book-detail',
            query: { id },
        });
        return;
    }
    router.push(`/reader/${id}`);
};
const openBookDetail = (id) => {
    router.push({
        path: '/book-detail',
        query: { id },
    });
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
const triggerUpload = () => {
    fileInputRef.value?.click();
};
const handleFileSelect = async (e) => {
    const target = e.target;
    const files = target.files;
    if (!files || files.length === 0)
        return;
    await processFiles(Array.from(files));
    target.value = '';
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
    }
    catch (error) {
        loading.close();
        ElMessage.error('导入失败，请重试');
        console.error(error);
    }
};
const handleEditBook = (book) => {
    editForm.value = {
        id: book.id,
        name: book.name,
        author: book.author || '',
        coverUrl: book.coverUrl || '',
    };
    showEditDialog.value = true;
};
const triggerCoverFilePick = () => {
    coverFileInputRef.value?.click();
};
const handleCoverFileSelect = (e) => {
    const target = e.target;
    const file = target.files?.[0];
    if (!file)
        return;
    if (!file.type.startsWith('image/')) {
        ElMessage.error('请选择有效的图片文件');
        target.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
        if (event.target?.result) {
            editForm.value.coverUrl = event.target.result;
        }
    };
    reader.readAsDataURL(file);
    target.value = '';
};
const saveEditBook = async () => {
    const name = editForm.value.name.trim();
    if (!name) {
        ElMessage.warning('书名不能为空');
        return;
    }
    try {
        await bookshelfStore.updateBook(editForm.value.id, {
            name,
            author: editForm.value.author.trim(),
            coverUrl: editForm.value.coverUrl.trim() || undefined,
        });
        showEditDialog.value = false;
        ElMessage.success('书籍信息已更新');
    }
    catch (error) {
        ElMessage.error('更新失败，请重试');
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
/** @type {__VLS_StyleScopedClasses['bookshelf-index-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['bookshelf-index-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['dark']} */ ;
/** @type {__VLS_StyleScopedClasses['bookshelf-index-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['dark']} */ ;
/** @type {__VLS_StyleScopedClasses['bookshelf-index-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['dark']} */ ;
/** @type {__VLS_StyleScopedClasses['bookshelf-index-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['dark']} */ ;
/** @type {__VLS_StyleScopedClasses['bookshelf-index-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['dark']} */ ;
/** @type {__VLS_StyleScopedClasses['search-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['bookshelf-index-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['dark']} */ ;
/** @type {__VLS_StyleScopedClasses['search-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['el-input__inner']} */ ;
/** @type {__VLS_StyleScopedClasses['bookshelf-index-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['dark']} */ ;
/** @type {__VLS_StyleScopedClasses['bookshelf-index-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['dark']} */ ;
/** @type {__VLS_StyleScopedClasses['bookshelf-index-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['dark']} */ ;
/** @type {__VLS_StyleScopedClasses['recent-book-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['is-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['bookshelf-index-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['dark']} */ ;
/** @type {__VLS_StyleScopedClasses['recent-book-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['bookshelf-index-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['dark']} */ ;
/** @type {__VLS_StyleScopedClasses['bookshelf-index-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['dark']} */ ;
/** @type {__VLS_StyleScopedClasses['bookshelf-index-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['dark']} */ ;
/** @type {__VLS_StyleScopedClasses['bookshelf-index-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['dark']} */ ;
/** @type {__VLS_StyleScopedClasses['bookshelf-index-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['dark']} */ ;
/** @type {__VLS_StyleScopedClasses['github-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['bookshelf-index-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['bookshelf-index-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['light']} */ ;
/** @type {__VLS_StyleScopedClasses['navigation-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['bookshelf-index-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['light']} */ ;
/** @type {__VLS_StyleScopedClasses['navigation-title']} */ ;
/** @type {__VLS_StyleScopedClasses['bookshelf-index-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['light']} */ ;
/** @type {__VLS_StyleScopedClasses['navigation-sub-title']} */ ;
/** @type {__VLS_StyleScopedClasses['bookshelf-index-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['light']} */ ;
/** @type {__VLS_StyleScopedClasses['search-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['el-input__wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['bookshelf-index-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['light']} */ ;
/** @type {__VLS_StyleScopedClasses['search-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['el-input__inner']} */ ;
/** @type {__VLS_StyleScopedClasses['bookshelf-index-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['light']} */ ;
/** @type {__VLS_StyleScopedClasses['search-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['el-input__inner']} */ ;
/** @type {__VLS_StyleScopedClasses['bookshelf-index-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['light']} */ ;
/** @type {__VLS_StyleScopedClasses['recent-title']} */ ;
/** @type {__VLS_StyleScopedClasses['bookshelf-index-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['light']} */ ;
/** @type {__VLS_StyleScopedClasses['recent-book-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['is-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['bookshelf-index-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['light']} */ ;
/** @type {__VLS_StyleScopedClasses['recent-book-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['is-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['bookshelf-index-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['light']} */ ;
/** @type {__VLS_StyleScopedClasses['recent-book-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['is-warning']} */ ;
/** @type {__VLS_StyleScopedClasses['bookshelf-index-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['light']} */ ;
/** @type {__VLS_StyleScopedClasses['shelf-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['bookshelf-index-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['light']} */ ;
/** @type {__VLS_StyleScopedClasses['shelf-header']} */ ;
/** @type {__VLS_StyleScopedClasses['bookshelf-index-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['light']} */ ;
/** @type {__VLS_StyleScopedClasses['shelf-count-text']} */ ;
/** @type {__VLS_StyleScopedClasses['bookshelf-index-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['light']} */ ;
/** @type {__VLS_StyleScopedClasses['github-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['bookshelf-index-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['light']} */ ;
/** @type {__VLS_StyleScopedClasses['github-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['navigation-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['navigation-title']} */ ;
/** @type {__VLS_StyleScopedClasses['navigation-sub-title']} */ ;
/** @type {__VLS_StyleScopedClasses['search-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['el-input__wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['recent-title']} */ ;
/** @type {__VLS_StyleScopedClasses['recent-book-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['recent-book-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['recent-book-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['clickable']} */ ;
/** @type {__VLS_StyleScopedClasses['github-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['github-link']} */ ;
/** @type {__VLS_StyleScopedClasses['github-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['shelf-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['shelf-header']} */ ;
/** @type {__VLS_StyleScopedClasses['shelf-count-text']} */ ;
/** @type {__VLS_StyleScopedClasses['bookshelf-index-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['navigation-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['navigation-title-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['navigation-sub-title']} */ ;
/** @type {__VLS_StyleScopedClasses['bottom-icons']} */ ;
/** @type {__VLS_StyleScopedClasses['shelf-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['shelf-header']} */ ;
/** @type {__VLS_StyleScopedClasses['shelf-header-right']} */ ;
/** @type {__VLS_StyleScopedClasses['books-grid']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onDragover: (__VLS_ctx.onDragOver) },
    ...{ onDragleave: (__VLS_ctx.onDragLeave) },
    ...{ onDrop: (__VLS_ctx.onDrop) },
    ...{ class: "bookshelf-index-wrapper" },
    ...{ class: ({ dark: __VLS_ctx.isDark, light: !__VLS_ctx.isDark }) },
});
/** @type {__VLS_StyleScopedClasses['bookshelf-index-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['dark']} */ ;
/** @type {__VLS_StyleScopedClasses['light']} */ ;
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
    [onDragOver, onDragLeave, onDrop, isDark, isDark, isDragging,];
    var __VLS_9;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "drag-text" },
    });
    /** @type {__VLS_StyleScopedClasses['drag-text']} */ ;
}
// @ts-ignore
[];
var __VLS_3;
__VLS_asFunctionalElement1(__VLS_intrinsics.aside, __VLS_intrinsics.aside)({
    ...{ class: "navigation-wrapper" },
});
/** @type {__VLS_StyleScopedClasses['navigation-wrapper']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "nav-top" },
});
/** @type {__VLS_StyleScopedClasses['nav-top']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.router.push('/'));
            // @ts-ignore
            [router,];
        } },
    ...{ class: "navigation-title-wrapper" },
});
/** @type {__VLS_StyleScopedClasses['navigation-title-wrapper']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "navigation-title" },
});
/** @type {__VLS_StyleScopedClasses['navigation-title']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "navigation-sub-title" },
});
/** @type {__VLS_StyleScopedClasses['navigation-sub-title']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "search-wrapper" },
});
/** @type {__VLS_StyleScopedClasses['search-wrapper']} */ ;
let __VLS_17;
/** @ts-ignore @type { | typeof __VLS_components.elInput | typeof __VLS_components.ElInput | typeof __VLS_components['el-input'] | typeof __VLS_components.elInput | typeof __VLS_components.ElInput | typeof __VLS_components['el-input']} */
elInput;
// @ts-ignore
const __VLS_18 = __VLS_asFunctionalComponent1(__VLS_17, new __VLS_17({
    modelValue: (__VLS_ctx.searchWord),
    placeholder: "搜索书籍，在线书籍自动加入书架",
    ...{ class: "search-input" },
    clearable: true,
}));
const __VLS_19 = __VLS_18({
    modelValue: (__VLS_ctx.searchWord),
    placeholder: "搜索书籍，在线书籍自动加入书架",
    ...{ class: "search-input" },
    clearable: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_18));
/** @type {__VLS_StyleScopedClasses['search-input']} */ ;
const { default: __VLS_22 } = __VLS_20.slots;
{
    const { prefix: __VLS_23 } = __VLS_20.slots;
    let __VLS_24;
    /** @ts-ignore @type { | typeof __VLS_components.elIcon | typeof __VLS_components.ElIcon | typeof __VLS_components['el-icon'] | typeof __VLS_components.elIcon | typeof __VLS_components.ElIcon | typeof __VLS_components['el-icon']} */
    elIcon;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent1(__VLS_24, new __VLS_24({
        ...{ class: "search-icon" },
    }));
    const __VLS_26 = __VLS_25({
        ...{ class: "search-icon" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    /** @type {__VLS_StyleScopedClasses['search-icon']} */ ;
    const { default: __VLS_29 } = __VLS_27.slots;
    let __VLS_30;
    /** @ts-ignore @type { | typeof __VLS_components.Search} */
    Search;
    // @ts-ignore
    const __VLS_31 = __VLS_asFunctionalComponent1(__VLS_30, new __VLS_30({}));
    const __VLS_32 = __VLS_31({}, ...__VLS_functionalComponentArgsRest(__VLS_31));
    // @ts-ignore
    [searchWord,];
    var __VLS_27;
    // @ts-ignore
    [];
}
// @ts-ignore
[];
var __VLS_20;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "bottom-wrapper" },
});
/** @type {__VLS_StyleScopedClasses['bottom-wrapper']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "recent-wrapper" },
});
/** @type {__VLS_StyleScopedClasses['recent-wrapper']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "recent-title" },
});
/** @type {__VLS_StyleScopedClasses['recent-title']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "reading-recent" },
});
/** @type {__VLS_StyleScopedClasses['reading-recent']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onClick: (__VLS_ctx.openRecentBook) },
    ...{ class: "recent-book-badge" },
    ...{ class: ([__VLS_ctx.mostRecentBook ? 'is-primary' : 'is-warning', { 'clickable': Boolean(__VLS_ctx.mostRecentBook) }]) },
    title: (__VLS_ctx.mostRecentBook ? __VLS_ctx.mostRecentBook.name : '尚无阅读记录'),
});
/** @type {__VLS_StyleScopedClasses['recent-book-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['clickable']} */ ;
(__VLS_ctx.mostRecentBook ? __VLS_ctx.mostRecentBook.name : '尚无阅读记录');
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "bottom-icons" },
});
/** @type {__VLS_StyleScopedClasses['bottom-icons']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.a, __VLS_intrinsics.a)({
    href: "https://github.com/neighbourkiller/legado",
    target: "_blank",
    rel: "noopener noreferrer",
    ...{ class: "github-link" },
    title: "访问 GitHub 仓库",
});
/** @type {__VLS_StyleScopedClasses['github-link']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
    ...{ class: "github-icon" },
    viewBox: "0 0 24 24",
    fill: "currentColor",
});
/** @type {__VLS_StyleScopedClasses['github-icon']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.path)({
    'fill-rule': "evenodd",
    'clip-rule': "evenodd",
    d: "M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z",
});
const __VLS_35 = ThemeToggle;
// @ts-ignore
const __VLS_36 = __VLS_asFunctionalComponent1(__VLS_35, new __VLS_35({}));
const __VLS_37 = __VLS_36({}, ...__VLS_functionalComponentArgsRest(__VLS_36));
__VLS_asFunctionalElement1(__VLS_intrinsics.main, __VLS_intrinsics.main)({
    ...{ class: "shelf-wrapper" },
});
/** @type {__VLS_StyleScopedClasses['shelf-wrapper']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "shelf-header" },
});
/** @type {__VLS_StyleScopedClasses['shelf-header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "shelf-header-left" },
});
/** @type {__VLS_StyleScopedClasses['shelf-header-left']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "shelf-count-text" },
});
/** @type {__VLS_StyleScopedClasses['shelf-count-text']} */ ;
(__VLS_ctx.filteredBooks.length);
if (__VLS_ctx.searchWord) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "search-hint" },
    });
    /** @type {__VLS_StyleScopedClasses['search-hint']} */ ;
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "shelf-header-right" },
});
/** @type {__VLS_StyleScopedClasses['shelf-header-right']} */ ;
let __VLS_40;
/** @ts-ignore @type { | typeof __VLS_components.elDropdown | typeof __VLS_components.ElDropdown | typeof __VLS_components['el-dropdown'] | typeof __VLS_components.elDropdown | typeof __VLS_components.ElDropdown | typeof __VLS_components['el-dropdown']} */
elDropdown;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent1(__VLS_40, new __VLS_40({
    ...{ 'onCommand': {} },
}));
const __VLS_42 = __VLS_41({
    ...{ 'onCommand': {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
let __VLS_45;
const __VLS_46 = {
    /** @type {typeof __VLS_45.command} */
    onCommand: (__VLS_ctx.handleBookshelfSortCommand),
};
const { default: __VLS_47 } = __VLS_43.slots;
let __VLS_48;
/** @ts-ignore @type { | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button'] | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button']} */
elButton;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent1(__VLS_48, new __VLS_48({
    plain: true,
    icon: (__VLS_ctx.SortIcon),
}));
const __VLS_50 = __VLS_49({
    plain: true,
    icon: (__VLS_ctx.SortIcon),
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
const { default: __VLS_53 } = __VLS_51.slots;
(__VLS_ctx.bookshelfSortLabels[__VLS_ctx.bookshelfSort]);
let __VLS_54;
/** @ts-ignore @type { | typeof __VLS_components.elIcon | typeof __VLS_components.ElIcon | typeof __VLS_components['el-icon'] | typeof __VLS_components.elIcon | typeof __VLS_components.ElIcon | typeof __VLS_components['el-icon']} */
elIcon;
// @ts-ignore
const __VLS_55 = __VLS_asFunctionalComponent1(__VLS_54, new __VLS_54({
    ...{ class: "el-icon--right" },
}));
const __VLS_56 = __VLS_55({
    ...{ class: "el-icon--right" },
}, ...__VLS_functionalComponentArgsRest(__VLS_55));
/** @type {__VLS_StyleScopedClasses['el-icon--right']} */ ;
const { default: __VLS_59 } = __VLS_57.slots;
let __VLS_60;
/** @ts-ignore @type { | typeof __VLS_components.ArrowDown} */
ArrowDown;
// @ts-ignore
const __VLS_61 = __VLS_asFunctionalComponent1(__VLS_60, new __VLS_60({}));
const __VLS_62 = __VLS_61({}, ...__VLS_functionalComponentArgsRest(__VLS_61));
// @ts-ignore
[searchWord, openRecentBook, mostRecentBook, mostRecentBook, mostRecentBook, mostRecentBook, mostRecentBook, mostRecentBook, filteredBooks, handleBookshelfSortCommand, SortIcon, bookshelfSortLabels, bookshelfSort,];
var __VLS_57;
// @ts-ignore
[];
var __VLS_51;
{
    const { dropdown: __VLS_65 } = __VLS_43.slots;
    let __VLS_66;
    /** @ts-ignore @type { | typeof __VLS_components.elDropdownMenu | typeof __VLS_components.ElDropdownMenu | typeof __VLS_components['el-dropdown-menu'] | typeof __VLS_components.elDropdownMenu | typeof __VLS_components.ElDropdownMenu | typeof __VLS_components['el-dropdown-menu']} */
    elDropdownMenu;
    // @ts-ignore
    const __VLS_67 = __VLS_asFunctionalComponent1(__VLS_66, new __VLS_66({}));
    const __VLS_68 = __VLS_67({}, ...__VLS_functionalComponentArgsRest(__VLS_67));
    const { default: __VLS_71 } = __VLS_69.slots;
    let __VLS_72;
    /** @ts-ignore @type { | typeof __VLS_components.elDropdownItem | typeof __VLS_components.ElDropdownItem | typeof __VLS_components['el-dropdown-item'] | typeof __VLS_components.elDropdownItem | typeof __VLS_components.ElDropdownItem | typeof __VLS_components['el-dropdown-item']} */
    elDropdownItem;
    // @ts-ignore
    const __VLS_73 = __VLS_asFunctionalComponent1(__VLS_72, new __VLS_72({
        command: "recent",
    }));
    const __VLS_74 = __VLS_73({
        command: "recent",
    }, ...__VLS_functionalComponentArgsRest(__VLS_73));
    const { default: __VLS_77 } = __VLS_75.slots;
    // @ts-ignore
    [];
    var __VLS_75;
    let __VLS_78;
    /** @ts-ignore @type { | typeof __VLS_components.elDropdownItem | typeof __VLS_components.ElDropdownItem | typeof __VLS_components['el-dropdown-item'] | typeof __VLS_components.elDropdownItem | typeof __VLS_components.ElDropdownItem | typeof __VLS_components['el-dropdown-item']} */
    elDropdownItem;
    // @ts-ignore
    const __VLS_79 = __VLS_asFunctionalComponent1(__VLS_78, new __VLS_78({
        command: "name",
    }));
    const __VLS_80 = __VLS_79({
        command: "name",
    }, ...__VLS_functionalComponentArgsRest(__VLS_79));
    const { default: __VLS_83 } = __VLS_81.slots;
    // @ts-ignore
    [];
    var __VLS_81;
    let __VLS_84;
    /** @ts-ignore @type { | typeof __VLS_components.elDropdownItem | typeof __VLS_components.ElDropdownItem | typeof __VLS_components['el-dropdown-item'] | typeof __VLS_components.elDropdownItem | typeof __VLS_components.ElDropdownItem | typeof __VLS_components['el-dropdown-item']} */
    elDropdownItem;
    // @ts-ignore
    const __VLS_85 = __VLS_asFunctionalComponent1(__VLS_84, new __VLS_84({
        command: "author",
    }));
    const __VLS_86 = __VLS_85({
        command: "author",
    }, ...__VLS_functionalComponentArgsRest(__VLS_85));
    const { default: __VLS_89 } = __VLS_87.slots;
    // @ts-ignore
    [];
    var __VLS_87;
    let __VLS_90;
    /** @ts-ignore @type { | typeof __VLS_components.elDropdownItem | typeof __VLS_components.ElDropdownItem | typeof __VLS_components['el-dropdown-item'] | typeof __VLS_components.elDropdownItem | typeof __VLS_components.ElDropdownItem | typeof __VLS_components['el-dropdown-item']} */
    elDropdownItem;
    // @ts-ignore
    const __VLS_91 = __VLS_asFunctionalComponent1(__VLS_90, new __VLS_90({
        command: "progress",
    }));
    const __VLS_92 = __VLS_91({
        command: "progress",
    }, ...__VLS_functionalComponentArgsRest(__VLS_91));
    const { default: __VLS_95 } = __VLS_93.slots;
    // @ts-ignore
    [];
    var __VLS_93;
    // @ts-ignore
    [];
    var __VLS_69;
    // @ts-ignore
    [];
}
// @ts-ignore
[];
var __VLS_43;
var __VLS_44;
if (__VLS_ctx.isDesktop) {
    let __VLS_96;
    /** @ts-ignore @type { | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button'] | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button']} */
    elButton;
    // @ts-ignore
    const __VLS_97 = __VLS_asFunctionalComponent1(__VLS_96, new __VLS_96({
        ...{ 'onClick': {} },
        plain: true,
    }));
    const __VLS_98 = __VLS_97({
        ...{ 'onClick': {} },
        plain: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_97));
    let __VLS_101;
    const __VLS_102 = {
        /** @type {typeof __VLS_101.click} */
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.isDesktop))
                throw 0;
            return (__VLS_ctx.router.push('/book-sources'));
            // @ts-ignore
            [router, isDesktop,];
        },
    };
    const { default: __VLS_103 } = __VLS_99.slots;
    // @ts-ignore
    [];
    var __VLS_99;
    var __VLS_100;
}
let __VLS_104;
/** @ts-ignore @type { | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button'] | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button']} */
elButton;
// @ts-ignore
const __VLS_105 = __VLS_asFunctionalComponent1(__VLS_104, new __VLS_104({
    ...{ 'onClick': {} },
    type: "primary",
    icon: (__VLS_ctx.Plus),
    ...{ class: "import-btn" },
}));
const __VLS_106 = __VLS_105({
    ...{ 'onClick': {} },
    type: "primary",
    icon: (__VLS_ctx.Plus),
    ...{ class: "import-btn" },
}, ...__VLS_functionalComponentArgsRest(__VLS_105));
let __VLS_109;
const __VLS_110 = {
    /** @type {typeof __VLS_109.click} */
    onClick: (__VLS_ctx.triggerUpload),
};
/** @type {__VLS_StyleScopedClasses['import-btn']} */ ;
const { default: __VLS_111 } = __VLS_107.slots;
// @ts-ignore
[Plus, triggerUpload,];
var __VLS_107;
var __VLS_108;
let __VLS_112;
/** @ts-ignore @type { | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button'] | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button']} */
elButton;
// @ts-ignore
const __VLS_113 = __VLS_asFunctionalComponent1(__VLS_112, new __VLS_112({
    ...{ 'onClick': {} },
    plain: true,
    ...{ class: "back-home-btn" },
}));
const __VLS_114 = __VLS_113({
    ...{ 'onClick': {} },
    plain: true,
    ...{ class: "back-home-btn" },
}, ...__VLS_functionalComponentArgsRest(__VLS_113));
let __VLS_117;
const __VLS_118 = {
    /** @type {typeof __VLS_117.click} */
    onClick: (...[$event]) => {
        return (__VLS_ctx.router.push('/'));
        // @ts-ignore
        [router,];
    },
};
/** @type {__VLS_StyleScopedClasses['back-home-btn']} */ ;
const { default: __VLS_119 } = __VLS_115.slots;
// @ts-ignore
[];
var __VLS_115;
var __VLS_116;
if (__VLS_ctx.filteredBooks.length > 0) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "books-grid" },
    });
    /** @type {__VLS_StyleScopedClasses['books-grid']} */ ;
    for (const [book] of __VLS_vFor((__VLS_ctx.filteredBooks))) {
        const __VLS_120 = BookCard;
        // @ts-ignore
        const __VLS_121 = __VLS_asFunctionalComponent1(__VLS_120, new __VLS_120({
            ...{ 'onOpen': {} },
            ...{ 'onDetail': {} },
            ...{ 'onEdit': {} },
            ...{ 'onDelete': {} },
            key: (book.id),
            book: (book),
        }));
        const __VLS_122 = __VLS_121({
            ...{ 'onOpen': {} },
            ...{ 'onDetail': {} },
            ...{ 'onEdit': {} },
            ...{ 'onDelete': {} },
            key: (book.id),
            book: (book),
        }, ...__VLS_functionalComponentArgsRest(__VLS_121));
        let __VLS_125;
        const __VLS_126 = {
            /** @type {typeof __VLS_125.open} */
            onOpen: (__VLS_ctx.openBook),
        };
        const __VLS_127 = {
            /** @type {typeof __VLS_125.detail} */
            onDetail: (__VLS_ctx.openBookDetail),
        };
        const __VLS_128 = {
            /** @type {typeof __VLS_125.edit} */
            onEdit: (__VLS_ctx.handleEditBook),
        };
        const __VLS_129 = {
            /** @type {typeof __VLS_125.delete} */
            onDelete: (__VLS_ctx.confirmDeleteBook),
        };
        var __VLS_123;
        var __VLS_124;
        // @ts-ignore
        [filteredBooks, filteredBooks, openBook, openBookDetail, handleEditBook, confirmDeleteBook,];
    }
}
else if (__VLS_ctx.searchWord) {
    let __VLS_130;
    /** @ts-ignore @type { | typeof __VLS_components.elEmpty | typeof __VLS_components.ElEmpty | typeof __VLS_components['el-empty'] | typeof __VLS_components.elEmpty | typeof __VLS_components.ElEmpty | typeof __VLS_components['el-empty']} */
    elEmpty;
    // @ts-ignore
    const __VLS_131 = __VLS_asFunctionalComponent1(__VLS_130, new __VLS_130({
        description: "未找到匹配的书籍",
        ...{ class: "shelf-empty" },
    }));
    const __VLS_132 = __VLS_131({
        description: "未找到匹配的书籍",
        ...{ class: "shelf-empty" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_131));
    /** @type {__VLS_StyleScopedClasses['shelf-empty']} */ ;
    const { default: __VLS_135 } = __VLS_133.slots;
    let __VLS_136;
    /** @ts-ignore @type { | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button'] | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button']} */
    elButton;
    // @ts-ignore
    const __VLS_137 = __VLS_asFunctionalComponent1(__VLS_136, new __VLS_136({
        ...{ 'onClick': {} },
    }));
    const __VLS_138 = __VLS_137({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_137));
    let __VLS_141;
    const __VLS_142 = {
        /** @type {typeof __VLS_141.click} */
        onClick: (...[$event]) => {
            if (!!(__VLS_ctx.filteredBooks.length > 0))
                throw 0;
            if (!(__VLS_ctx.searchWord))
                throw 0;
            return (__VLS_ctx.searchWord = '');
            // @ts-ignore
            [searchWord, searchWord,];
        },
    };
    const { default: __VLS_143 } = __VLS_139.slots;
    // @ts-ignore
    [];
    var __VLS_139;
    var __VLS_140;
    // @ts-ignore
    [];
    var __VLS_133;
}
else {
    let __VLS_144;
    /** @ts-ignore @type { | typeof __VLS_components.elEmpty | typeof __VLS_components.ElEmpty | typeof __VLS_components['el-empty'] | typeof __VLS_components.elEmpty | typeof __VLS_components.ElEmpty | typeof __VLS_components['el-empty']} */
    elEmpty;
    // @ts-ignore
    const __VLS_145 = __VLS_asFunctionalComponent1(__VLS_144, new __VLS_144({
        description: "书架空空如也，去导入电子书吧",
        ...{ class: "shelf-empty" },
    }));
    const __VLS_146 = __VLS_145({
        description: "书架空空如也，去导入电子书吧",
        ...{ class: "shelf-empty" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_145));
    /** @type {__VLS_StyleScopedClasses['shelf-empty']} */ ;
    const { default: __VLS_149 } = __VLS_147.slots;
    let __VLS_150;
    /** @ts-ignore @type { | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button'] | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button']} */
    elButton;
    // @ts-ignore
    const __VLS_151 = __VLS_asFunctionalComponent1(__VLS_150, new __VLS_150({
        ...{ 'onClick': {} },
        type: "primary",
        icon: (__VLS_ctx.Plus),
    }));
    const __VLS_152 = __VLS_151({
        ...{ 'onClick': {} },
        type: "primary",
        icon: (__VLS_ctx.Plus),
    }, ...__VLS_functionalComponentArgsRest(__VLS_151));
    let __VLS_155;
    const __VLS_156 = {
        /** @type {typeof __VLS_155.click} */
        onClick: (__VLS_ctx.triggerUpload),
    };
    const { default: __VLS_157 } = __VLS_153.slots;
    // @ts-ignore
    [Plus, triggerUpload,];
    var __VLS_153;
    var __VLS_154;
    // @ts-ignore
    [];
    var __VLS_147;
}
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    ...{ onChange: (__VLS_ctx.handleFileSelect) },
    ref: "fileInputRef",
    type: "file",
    accept: ".txt,.epub",
    multiple: true,
    ...{ style: {} },
});
let __VLS_158;
/** @ts-ignore @type { | typeof __VLS_components.elDialog | typeof __VLS_components.ElDialog | typeof __VLS_components['el-dialog'] | typeof __VLS_components.elDialog | typeof __VLS_components.ElDialog | typeof __VLS_components['el-dialog']} */
elDialog;
// @ts-ignore
const __VLS_159 = __VLS_asFunctionalComponent1(__VLS_158, new __VLS_158({
    modelValue: (__VLS_ctx.showEditDialog),
    title: "修改书籍信息",
    width: "480px",
    destroyOnClose: true,
    alignCenter: true,
}));
const __VLS_160 = __VLS_159({
    modelValue: (__VLS_ctx.showEditDialog),
    title: "修改书籍信息",
    width: "480px",
    destroyOnClose: true,
    alignCenter: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_159));
const { default: __VLS_163 } = __VLS_161.slots;
let __VLS_164;
/** @ts-ignore @type { | typeof __VLS_components.elForm | typeof __VLS_components.ElForm | typeof __VLS_components['el-form'] | typeof __VLS_components.elForm | typeof __VLS_components.ElForm | typeof __VLS_components['el-form']} */
elForm;
// @ts-ignore
const __VLS_165 = __VLS_asFunctionalComponent1(__VLS_164, new __VLS_164({
    model: (__VLS_ctx.editForm),
    labelPosition: "top",
}));
const __VLS_166 = __VLS_165({
    model: (__VLS_ctx.editForm),
    labelPosition: "top",
}, ...__VLS_functionalComponentArgsRest(__VLS_165));
const { default: __VLS_169 } = __VLS_167.slots;
let __VLS_170;
/** @ts-ignore @type { | typeof __VLS_components.elFormItem | typeof __VLS_components.ElFormItem | typeof __VLS_components['el-form-item'] | typeof __VLS_components.elFormItem | typeof __VLS_components.ElFormItem | typeof __VLS_components['el-form-item']} */
elFormItem;
// @ts-ignore
const __VLS_171 = __VLS_asFunctionalComponent1(__VLS_170, new __VLS_170({
    label: "书籍名称",
    required: true,
}));
const __VLS_172 = __VLS_171({
    label: "书籍名称",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_171));
const { default: __VLS_175 } = __VLS_173.slots;
let __VLS_176;
/** @ts-ignore @type { | typeof __VLS_components.elInput | typeof __VLS_components.ElInput | typeof __VLS_components['el-input']} */
elInput;
// @ts-ignore
const __VLS_177 = __VLS_asFunctionalComponent1(__VLS_176, new __VLS_176({
    modelValue: (__VLS_ctx.editForm.name),
    placeholder: "请输入书名",
    maxlength: "100",
    showWordLimit: true,
}));
const __VLS_178 = __VLS_177({
    modelValue: (__VLS_ctx.editForm.name),
    placeholder: "请输入书名",
    maxlength: "100",
    showWordLimit: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_177));
// @ts-ignore
[handleFileSelect, showEditDialog, editForm, editForm,];
var __VLS_173;
let __VLS_181;
/** @ts-ignore @type { | typeof __VLS_components.elFormItem | typeof __VLS_components.ElFormItem | typeof __VLS_components['el-form-item'] | typeof __VLS_components.elFormItem | typeof __VLS_components.ElFormItem | typeof __VLS_components['el-form-item']} */
elFormItem;
// @ts-ignore
const __VLS_182 = __VLS_asFunctionalComponent1(__VLS_181, new __VLS_181({
    label: "作者",
}));
const __VLS_183 = __VLS_182({
    label: "作者",
}, ...__VLS_functionalComponentArgsRest(__VLS_182));
const { default: __VLS_186 } = __VLS_184.slots;
let __VLS_187;
/** @ts-ignore @type { | typeof __VLS_components.elInput | typeof __VLS_components.ElInput | typeof __VLS_components['el-input']} */
elInput;
// @ts-ignore
const __VLS_188 = __VLS_asFunctionalComponent1(__VLS_187, new __VLS_187({
    modelValue: (__VLS_ctx.editForm.author),
    placeholder: "请输入作者",
    maxlength: "50",
    showWordLimit: true,
}));
const __VLS_189 = __VLS_188({
    modelValue: (__VLS_ctx.editForm.author),
    placeholder: "请输入作者",
    maxlength: "50",
    showWordLimit: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_188));
// @ts-ignore
[editForm,];
var __VLS_184;
let __VLS_192;
/** @ts-ignore @type { | typeof __VLS_components.elFormItem | typeof __VLS_components.ElFormItem | typeof __VLS_components['el-form-item'] | typeof __VLS_components.elFormItem | typeof __VLS_components.ElFormItem | typeof __VLS_components['el-form-item']} */
elFormItem;
// @ts-ignore
const __VLS_193 = __VLS_asFunctionalComponent1(__VLS_192, new __VLS_192({
    label: "封面设置",
}));
const __VLS_194 = __VLS_193({
    label: "封面设置",
}, ...__VLS_functionalComponentArgsRest(__VLS_193));
const { default: __VLS_197 } = __VLS_195.slots;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "cover-edit-section" },
});
/** @type {__VLS_StyleScopedClasses['cover-edit-section']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "cover-preview-box" },
});
/** @type {__VLS_StyleScopedClasses['cover-preview-box']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.img)({
    src: (__VLS_ctx.editForm.coverUrl || __VLS_ctx.defaultCover),
    ...{ class: "preview-img" },
    alt: "封面预览",
});
/** @type {__VLS_StyleScopedClasses['preview-img']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "cover-inputs" },
});
/** @type {__VLS_StyleScopedClasses['cover-inputs']} */ ;
let __VLS_198;
/** @ts-ignore @type { | typeof __VLS_components.elInput | typeof __VLS_components.ElInput | typeof __VLS_components['el-input']} */
elInput;
// @ts-ignore
const __VLS_199 = __VLS_asFunctionalComponent1(__VLS_198, new __VLS_198({
    modelValue: (__VLS_ctx.editForm.coverUrl),
    placeholder: "输入封面图片 URL 链接",
    clearable: true,
}));
const __VLS_200 = __VLS_199({
    modelValue: (__VLS_ctx.editForm.coverUrl),
    placeholder: "输入封面图片 URL 链接",
    clearable: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_199));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "cover-action-btns" },
});
/** @type {__VLS_StyleScopedClasses['cover-action-btns']} */ ;
let __VLS_203;
/** @ts-ignore @type { | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button'] | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button']} */
elButton;
// @ts-ignore
const __VLS_204 = __VLS_asFunctionalComponent1(__VLS_203, new __VLS_203({
    ...{ 'onClick': {} },
    type: "primary",
    plain: true,
    size: "small",
}));
const __VLS_205 = __VLS_204({
    ...{ 'onClick': {} },
    type: "primary",
    plain: true,
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_204));
let __VLS_208;
const __VLS_209 = {
    /** @type {typeof __VLS_208.click} */
    onClick: (__VLS_ctx.triggerCoverFilePick),
};
const { default: __VLS_210 } = __VLS_206.slots;
// @ts-ignore
[editForm, editForm, defaultCover, triggerCoverFilePick,];
var __VLS_206;
var __VLS_207;
let __VLS_211;
/** @ts-ignore @type { | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button'] | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button']} */
elButton;
// @ts-ignore
const __VLS_212 = __VLS_asFunctionalComponent1(__VLS_211, new __VLS_211({
    ...{ 'onClick': {} },
    size: "small",
}));
const __VLS_213 = __VLS_212({
    ...{ 'onClick': {} },
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_212));
let __VLS_216;
const __VLS_217 = {
    /** @type {typeof __VLS_216.click} */
    onClick: (...[$event]) => {
        return (__VLS_ctx.editForm.coverUrl = '');
        // @ts-ignore
        [editForm,];
    },
};
const { default: __VLS_218 } = __VLS_214.slots;
// @ts-ignore
[];
var __VLS_214;
var __VLS_215;
// @ts-ignore
[];
var __VLS_195;
// @ts-ignore
[];
var __VLS_167;
{
    const { footer: __VLS_219 } = __VLS_161.slots;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "dialog-footer" },
    });
    /** @type {__VLS_StyleScopedClasses['dialog-footer']} */ ;
    let __VLS_220;
    /** @ts-ignore @type { | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button'] | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button']} */
    elButton;
    // @ts-ignore
    const __VLS_221 = __VLS_asFunctionalComponent1(__VLS_220, new __VLS_220({
        ...{ 'onClick': {} },
    }));
    const __VLS_222 = __VLS_221({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_221));
    let __VLS_225;
    const __VLS_226 = {
        /** @type {typeof __VLS_225.click} */
        onClick: (...[$event]) => {
            return (__VLS_ctx.showEditDialog = false);
            // @ts-ignore
            [showEditDialog,];
        },
    };
    const { default: __VLS_227 } = __VLS_223.slots;
    // @ts-ignore
    [];
    var __VLS_223;
    var __VLS_224;
    let __VLS_228;
    /** @ts-ignore @type { | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button'] | typeof __VLS_components.elButton | typeof __VLS_components.ElButton | typeof __VLS_components['el-button']} */
    elButton;
    // @ts-ignore
    const __VLS_229 = __VLS_asFunctionalComponent1(__VLS_228, new __VLS_228({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_230 = __VLS_229({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_229));
    let __VLS_233;
    const __VLS_234 = {
        /** @type {typeof __VLS_233.click} */
        onClick: (__VLS_ctx.saveEditBook),
    };
    const { default: __VLS_235 } = __VLS_231.slots;
    // @ts-ignore
    [saveEditBook,];
    var __VLS_231;
    var __VLS_232;
    // @ts-ignore
    [];
}
// @ts-ignore
[];
var __VLS_161;
__VLS_asFunctionalElement1(__VLS_intrinsics.input)({
    ...{ onChange: (__VLS_ctx.handleCoverFileSelect) },
    ref: "coverFileInputRef",
    type: "file",
    accept: "image/*",
    ...{ style: {} },
});
// @ts-ignore
[handleCoverFileSelect,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
