import { ref, computed, watchEffect, nextTick, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router';
import { storeToRefs } from 'pinia';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Document as DetailIcon, Download as DownloadIcon, Refresh as RefreshIcon, CollectionTag as BookmarkIcon, } from '@element-plus/icons-vue';
import { useReadingStore } from '@/stores/reading';
import { useFullscreen } from '@/composables/useFullscreen';
import PopCatalog from '@/components/PopCatalog.vue';
import ReadSettings from '@/components/ReadSettings.vue';
import ChapterContent from '@/components/ChapterContent.vue';
import NovelDownloadDialog from '@/components/NovelDownloadDialog.vue';
import ReaderBookmarksDrawer from '@/components/ReaderBookmarksDrawer.vue';
import themeConfig from '@/config/themeConfig';
import jump from '@/plugins/jump';
import { trimChapterWindowBeforeAppend } from '@/utils/chapterWindow';
import { addReadingTime, deleteBookmark, getBookmarksByBookId, getBookmarkAt, saveBookmark, } from '@/storage/db';
import { characterOffsetToParagraphIndex } from '@/backup/compat';
import '@/assets/fonts/iconfont.css';
const route = useRoute();
const router = useRouter();
const store = useReadingStore();
const { isFullscreen, toggleFullscreen } = useFullscreen();
const { currentBook, chapters, settings, miniInterface, popCataVisible, readSettingsVisible, } = storeToRefs(store);
const chapterData = ref([]);
const chapterLoading = ref(false);
const showToolBar = ref(false);
const downloadDialogVisible = ref(false);
const bookmarkDrawerVisible = ref(false);
const bookmarkSaving = ref(false);
const bookmarksLoading = ref(false);
const currentBookBookmarks = ref([]);
const bookmarkDrawerPosition = ref(null);
const currentPositionKey = ref('');
const bookmarkedPositionKey = ref('');
const supportsBookDetail = import.meta.env.VITE_APP_TARGET === 'desktop';
let contentGeneration = 0;
let scrollObserver = null;
const topRef = ref();
const bottomRef = ref();
const loadingRef = ref();
const contentRef = ref();
let readingSessionStartedAt = 0;
// 章节状态
const currentChapterIndex = computed(() => currentBook.value?.currentChapter ?? 0);
const isFirstChapter = computed(() => currentChapterIndex.value <= 0);
const isLastChapter = computed(() => currentChapterIndex.value >= (chapters.value.length || 1) - 1);
// 主题与颜色计算 (theme === 6 为夜间模式)
const isNight = computed(() => settings.value.theme === 6);
const bodyColor = computed(() => themeConfig.themes[settings.value.theme]?.body || '#ede7da');
const chapterColor = computed(() => themeConfig.themes[settings.value.theme]?.content || '#ede7da');
const popupColor = computed(() => themeConfig.themes[settings.value.theme]?.popup || '#ede7da');
// 响应式宽度与样式
const readWidth = computed(() => {
    if (!miniInterface.value) {
        return (settings.value.readWidth || 800) + 'px';
    }
    else {
        return '100%';
    }
});
const popupWidth = computed(() => {
    if (!miniInterface.value) {
        return (settings.value.readWidth || 800) - 33;
    }
    else {
        return window.innerWidth - 33;
    }
});
const bodyTheme = computed(() => ({
    background: bodyColor.value,
}));
const chapterTheme = computed(() => ({
    background: chapterColor.value,
    width: readWidth.value,
}));
// 左侧工具栏贴紧正文左边缘
const leftBarTheme = computed(() => ({
    background: popupColor.value,
    marginLeft: miniInterface.value
        ? '0'
        : -((settings.value.readWidth || 800) / 2 + 60) + 'px',
    display: miniInterface.value && !showToolBar.value ? 'none' : 'block',
}));
// 右侧工具栏贴紧正文右边缘
const rightBarTheme = computed(() => ({
    background: popupColor.value,
    marginRight: miniInterface.value
        ? '0'
        : -((settings.value.readWidth || 800) / 2 + 44) + 'px',
    display: miniInterface.value && !showToolBar.value ? 'none' : 'block',
}));
// 常用字体多变体与别名映射表（兼顾英文名、中文名、GB版、屏幕版等系统安装差异）
const FONT_ALIAS_MAP = {
    'lxgw wenkai screen': [
        'LXGW WenKai Screen',
        'LXGW WenKai GB Screen',
        '霞鹜文楷 屏幕阅读版',
        '霞鹜文楷 GB 屏幕阅读版',
        'LXGW WenKai',
        'LXGW WenKai GB',
        '霞鹜文楷',
    ],
    'lxgw wenkai': [
        'LXGW WenKai',
        'LXGW WenKai GB',
        '霞鹜文楷',
        '霞鹜文楷 GB',
        'LXGW WenKai Screen',
        'LXGW WenKai GB Screen',
        '霞鹜文楷 屏幕阅读版',
        '霞鹜文楷 GB 屏幕阅读版',
    ],
    '霞鹜文楷': [
        '霞鹜文楷 GB 屏幕阅读版',
        '霞鹜文楷 屏幕阅读版',
        '霞鹜文楷',
        'LXGW WenKai GB Screen',
        'LXGW WenKai Screen',
        'LXGW WenKai',
    ],
    'pingfang sc': ['PingFang SC', 'PingFangSC-Regular', '苹方-简', '苹方'],
    'microsoft yahei': ['Microsoft YaHei', '微软雅黑', 'Microsoft YaHei UI'],
    'source han sans': ['Source Han Sans SC', 'Source Han Sans CN', 'Noto Sans CJK SC', 'Noto Sans SC', '思源黑体'],
    'source han serif': ['Source Han Serif SC', 'Source Han Serif CN', 'Noto Serif CJK SC', 'Noto Serif SC', '思源宋体'],
    'kaiti': ['KaiTi', '楷体', 'STKaiti', '华文楷体', 'Kaiti SC', 'AR PL UKai CN'],
    'simsun': ['SimSun', '宋体', 'STSong', '华文宋体', 'Songti SC', 'NSimSun'],
};
// 字体与字号
const fontFamilyStr = computed(() => {
    if (settings.value.font >= 0) {
        return themeConfig.fonts[settings.value.font] || 'Microsoft YaHei, sans-serif';
    }
    const custom = settings.value.customFontName?.trim();
    if (!custom) {
        return 'Microsoft YaHei, sans-serif';
    }
    const lower = custom.toLowerCase();
    let matchedAliases = [];
    for (const [key, aliases] of Object.entries(FONT_ALIAS_MAP)) {
        if (lower === key || lower.includes(key) || aliases.some(a => a.toLowerCase() === lower)) {
            matchedAliases = aliases;
            break;
        }
    }
    if (matchedAliases.length > 0) {
        const list = Array.from(new Set([custom, ...matchedAliases]));
        return list.map(f => `"${f}"`).join(', ') + ', PingFangSC-Regular, "Microsoft YaHei", sans-serif';
    }
    return `"${custom}", PingFangSC-Regular, "Microsoft YaHei", sans-serif`;
});
const fontSizeStr = computed(() => `${settings.value.fontSize || 18}px`);
const infiniteLoading = computed(() => settings.value.infiniteLoading);
const isCurrentPositionBookmarked = computed(() => currentPositionKey.value !== '' && currentPositionKey.value === bookmarkedPositionKey.value);
const findReadingPosition = () => {
    const elements = document.elementsFromPoint(window.innerWidth / 2, Math.min(180, Math.max(80, window.innerHeight / 4)));
    const readingElement = elements.find(element => element.closest('[data-chapter-index]'));
    const chapterElement = readingElement?.closest('[data-chapter-index]');
    if (!chapterElement)
        return null;
    const chapterIndex = Number(chapterElement.dataset.chapterIndex);
    if (!Number.isInteger(chapterIndex))
        return null;
    const positionElement = readingElement?.closest('[data-chapterpos]');
    const rawPosition = Number(positionElement?.dataset.chapterpos);
    const chapterPos = Number.isInteger(rawPosition) ? rawPosition : 0;
    const content = (positionElement?.innerText || readingElement?.textContent || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180);
    return { chapterIndex, chapterPos, content };
};
const syncBookmarkState = async (position = findReadingPosition()) => {
    if (!position || !currentBook.value)
        return;
    const key = `${currentBook.value.id}:${position.chapterIndex}:${position.chapterPos}`;
    if (key === currentPositionKey.value)
        return;
    currentPositionKey.value = key;
    const bookmark = await getBookmarkAt(currentBook.value.id, position.chapterIndex, position.chapterPos).catch(() => undefined);
    if (currentPositionKey.value === key) {
        bookmarkedPositionKey.value = bookmark ? key : '';
    }
};
const loadCurrentBookBookmarks = async () => {
    if (!currentBook.value)
        return;
    bookmarksLoading.value = true;
    try {
        currentBookBookmarks.value = await getBookmarksByBookId(currentBook.value.id);
    }
    catch (error) {
        console.error('读取本书书签失败', error);
        ElMessage.error('读取本书书签失败');
    }
    finally {
        bookmarksLoading.value = false;
    }
};
const openBookmarksDrawer = async () => {
    const position = findReadingPosition();
    bookmarkDrawerPosition.value = position;
    bookmarkDrawerVisible.value = true;
    if (position)
        await syncBookmarkState(position);
    await loadCurrentBookBookmarks();
};
const toggleBookmark = async (position) => {
    if (bookmarkSaving.value || !currentBook.value)
        return;
    if (!position) {
        ElMessage.warning('暂时无法确定当前阅读位置');
        return;
    }
    bookmarkSaving.value = true;
    try {
        const existing = await getBookmarkAt(currentBook.value.id, position.chapterIndex, position.chapterPos);
        const key = `${currentBook.value.id}:${position.chapterIndex}:${position.chapterPos}`;
        currentPositionKey.value = key;
        if (existing) {
            await deleteBookmark(existing.id);
            bookmarkedPositionKey.value = '';
            ElMessage.success('书签已删除');
        }
        else {
            const chapterTitle = chapters.value[position.chapterIndex]?.title || `第${position.chapterIndex + 1}章`;
            await saveBookmark({
                id: key,
                bookId: currentBook.value.id,
                bookName: currentBook.value.name,
                bookAuthor: currentBook.value.author,
                chapterIndex: position.chapterIndex,
                chapterPos: position.chapterPos,
                chapterTitle,
                content: position.content || chapterTitle,
                createdAt: Date.now(),
            });
            bookmarkedPositionKey.value = key;
            ElMessage.success('书签已添加');
        }
        await loadCurrentBookBookmarks();
    }
    catch (error) {
        console.error('保存书签失败', error);
        ElMessage.error('书签操作失败');
    }
    finally {
        bookmarkSaving.value = false;
    }
};
const toggleCurrentBookmark = () => toggleBookmark(bookmarkDrawerPosition.value);
const removeBookmarkFromDrawer = async (bookmark) => {
    try {
        await ElMessageBox.confirm(`确定删除“${bookmark.chapterTitle}”的这条书签吗？`, '删除书签', {
            confirmButtonText: '删除',
            cancelButtonText: '取消',
            type: 'warning',
        });
        await deleteBookmark(bookmark.id);
        currentBookBookmarks.value = currentBookBookmarks.value.filter(item => item.id !== bookmark.id);
        if (bookmarkedPositionKey.value === bookmark.id)
            bookmarkedPositionKey.value = '';
        ElMessage.success('书签已删除');
    }
    catch (error) {
        if (error !== 'cancel' && error !== 'close') {
            console.error('删除书签失败', error);
            ElMessage.error('删除书签失败');
        }
    }
};
const jumpToBookmark = async (bookmark) => {
    bookmarkDrawerVisible.value = false;
    if (!chapterData.value.some(chapter => chapter.index === bookmark.chapterIndex)) {
        const loaded = await getContent(bookmark.chapterIndex, true);
        if (!loaded)
            return;
    }
    await nextTick();
    const target = document.querySelector(`[data-chapter-index="${bookmark.chapterIndex}"] [data-chapterpos="${bookmark.chapterPos}"]`);
    if (!target) {
        ElMessage.warning('暂时无法定位到该书签');
        return;
    }
    jump(target, { duration: 0 });
    await store.saveProgress(bookmark.chapterIndex, bookmark.chapterPos).catch(console.error);
    currentPositionKey.value = bookmark.id;
    bookmarkedPositionKey.value = bookmark.id;
    bookmarkDrawerPosition.value = {
        chapterIndex: bookmark.chapterIndex,
        chapterPos: bookmark.chapterPos,
        content: bookmark.content,
    };
    router.replace({
        path: route.path,
        query: {
            ...route.query,
            chapter: String(bookmark.chapterIndex),
            pos: String(bookmark.chapterPos),
        },
    }).catch(console.error);
};
const flushReadingSession = async (continueSession = document.visibilityState === 'visible') => {
    if (!supportsBookDetail || !currentBook.value || readingSessionStartedAt === 0)
        return;
    const duration = Math.max(0, Date.now() - readingSessionStartedAt);
    readingSessionStartedAt = continueSession ? Date.now() : 0;
    await addReadingTime(currentBook.value, duration).catch(error => {
        console.warn('保存阅读记录失败', error);
    });
};
// 点击屏幕切换移动端工具栏
const handleWrapperClick = () => {
    if (miniInterface.value) {
        showToolBar.value = !showToolBar.value;
    }
};
// 获取章节内容
const getContent = async (index, reloadChapter = true, forceRefresh = false) => {
    if (index < 0 || index >= chapters.value.length)
        return false;
    const generation = reloadChapter ? ++contentGeneration : contentGeneration;
    chapterLoading.value = true;
    if (reloadChapter && !forceRefresh) {
        window.scrollTo(0, 0);
        chapterData.value = [];
        await store.saveProgress(index).catch(console.error);
    }
    else if (!reloadChapter) {
        chapterData.value = trimChapterWindowBeforeAppend(chapterData.value);
    }
    try {
        const payload = await store.fetchChapter(index, { forceRefresh });
        if (generation !== contentGeneration)
            return false;
        if (payload) {
            if (forceRefresh) {
                chapterData.value = [payload];
            }
            else {
                chapterData.value.push(payload);
            }
            if (reloadChapter && store.currentBook) {
                store.currentBook.currentChapter = index;
                if (store.currentBook.legacyChapterCharPos !== undefined &&
                    store.currentBook.legacyChapterCharPos >= 0) {
                    const rawContent = Array.isArray(payload.content)
                        ? payload.content.join('\n')
                        : payload.content.replace(/<[^>]+>/g, '\n');
                    store.currentBook.currentChapterPos = characterOffsetToParagraphIndex(rawContent, store.currentBook.legacyChapterCharPos);
                    store.currentBook.legacyChapterCharPos = undefined;
                    await store.saveProgress(index, store.currentBook.currentChapterPos).catch(console.error);
                }
            }
            return true;
        }
        return false;
    }
    catch (err) {
        console.error('获取章节内容失败', err);
        const action = forceRefresh ? '刷新正文' : '获取章节内容';
        ElMessage.error(err instanceof Error ? `${action}失败: ${err.message}` : `${action}失败`);
        return false;
    }
    finally {
        if (generation === contentGeneration) {
            chapterLoading.value = false;
        }
    }
};
const refreshCurrentChapter = async () => {
    if (chapterLoading.value)
        return;
    const refreshed = await getContent(currentChapterIndex.value, true, true);
    if (refreshed)
        ElMessage.success('本章正文已刷新');
};
// 底部触底无限加载
const loadMore = () => {
    const lastChapter = chapterData.value[chapterData.value.length - 1];
    if (!lastChapter)
        return;
    const nextIndex = lastChapter.index + 1;
    if (nextIndex < chapters.value.length) {
        getContent(nextIndex, false);
    }
};
const onReachBottom = (entries) => {
    if (chapterLoading.value)
        return;
    for (const entry of entries) {
        if (entry.isIntersecting) {
            loadMore();
            break;
        }
    }
};
watchEffect(() => {
    if (!infiniteLoading.value) {
        scrollObserver?.disconnect();
    }
    else if (loadingRef.value && scrollObserver) {
        scrollObserver.observe(loadingRef.value);
    }
});
// 顶部 / 底部跳转
const toTop = () => {
    if (topRef.value)
        jump(topRef.value, { duration: settings.value.jumpDuration });
};
const toBottom = () => {
    if (bottomRef.value)
        jump(bottomRef.value, { duration: settings.value.jumpDuration });
};
const toShelf = () => {
    router.push('/bookshelf');
};
const toBookDetail = () => {
    if (!currentBook.value)
        return;
    router.push({
        path: '/book-detail',
        query: { id: currentBook.value.id },
    });
};
// 章节前后切换
const toPreChapter = async () => {
    if (isFirstChapter.value) {
        ElMessage.warning('已经是第一章');
        return;
    }
    await getContent(currentChapterIndex.value - 1, true);
};
const toNextChapter = async () => {
    if (isLastChapter.value) {
        ElMessage.warning('已经是最后一章');
        return;
    }
    await getContent(currentChapterIndex.value + 1, true);
};
// 键盘事件
let canJump = true;
const handleKeyPress = (event) => {
    if (!canJump)
        return;
    switch (event.key) {
        case 'ArrowLeft':
            event.stopPropagation();
            event.preventDefault();
            toPreChapter();
            break;
        case 'ArrowRight':
            event.stopPropagation();
            event.preventDefault();
            toNextChapter();
            break;
        case 'ArrowUp':
            event.stopPropagation();
            event.preventDefault();
            if (document.documentElement.scrollTop === 0) {
                ElMessage.warning('已到达页面顶部');
            }
            else {
                canJump = false;
                jump(0 - document.documentElement.clientHeight + 100, {
                    duration: settings.value.jumpDuration,
                    callback: () => (canJump = true),
                });
            }
            break;
        case 'ArrowDown':
            event.stopPropagation();
            event.preventDefault();
            if (document.documentElement.clientHeight +
                document.documentElement.scrollTop >=
                document.documentElement.scrollHeight - 5) {
                ElMessage.warning('已到达页面底部');
            }
            else {
                canJump = false;
                jump(document.documentElement.clientHeight - 100, {
                    duration: settings.value.jumpDuration,
                    callback: () => (canJump = true),
                });
            }
            break;
    }
};
const ignoreKeyPress = (event) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
    }
};
// 滚动阅读进度更新
let progressFrame = null;
let lastSavedPositionKey = '';
const updateReadingProgress = () => {
    progressFrame = null;
    const position = findReadingPosition();
    if (!position)
        return;
    const index = position.chapterIndex;
    const positionKey = `${position.chapterIndex}:${position.chapterPos}`;
    if (Number.isInteger(index) && positionKey !== lastSavedPositionKey) {
        lastSavedPositionKey = positionKey;
        store.saveProgress(index, position.chapterPos).catch(console.error);
    }
    if (supportsBookDetail)
        syncBookmarkState(position).catch(console.error);
};
const onScroll = () => {
    if (progressFrame === null) {
        progressFrame = window.requestAnimationFrame(updateReadingProgress);
    }
};
// 窗口尺寸变化
const onResize = () => {
    store.setMiniInterface(window.innerWidth < 776);
    if (!store.miniInterface) {
        if (settings.value.readWidth < 640)
            settings.value.readWidth = 640;
        if (settings.value.readWidth + 2 * 68 > window.innerWidth) {
            settings.value.readWidth = Math.max(640, window.innerWidth - 160);
        }
    }
};
// 页面标题更新
watchEffect(() => {
    const title = chapters.value[currentChapterIndex.value]?.title;
    if (currentBook.value && title) {
        document.title = `${currentBook.value.name} | ${title}`;
    }
});
// 监听页面隐藏自动保存进度
const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
        if (currentBook.value)
            store.saveProgress().catch(console.error);
        flushReadingSession().catch(console.error);
    }
    else if (supportsBookDetail && currentBook.value && readingSessionStartedAt === 0) {
        readingSessionStartedAt = Date.now();
    }
};
onMounted(async () => {
    const rawId = route.params.id;
    const bookId = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!bookId) {
        router.push('/bookshelf');
        return;
    }
    try {
        await store.loadBook(bookId);
        if (supportsBookDetail) {
            await addReadingTime(currentBook.value, 0).catch(console.error);
            readingSessionStartedAt = Date.now();
        }
        onResize();
        window.addEventListener('resize', onResize);
        // 若保存了自定义网络字体，页面刷新时自动挂载
        if (settings.value.font === -1 &&
            settings.value.customFontName &&
            settings.value.customFontUrl &&
            typeof FontFace === 'function') {
            try {
                const fontface = new FontFace(settings.value.customFontName, `url("${settings.value.customFontUrl}")`);
                fontface
                    .load()
                    .then(loaded => {
                    document.fonts.add(loaded);
                })
                    .catch(err => {
                    console.warn('自动重新挂载自定义网络字体失败:', err);
                });
            }
            catch (e) {
                console.warn('FontFace 初始化失败:', e);
            }
        }
        if (chapters.value.length === 0) {
            ElMessage.warning('该书籍未包含任何章节');
            return;
        }
        const requestedChapter = Number(route.query.chapter);
        const initialChapter = Math.max(0, Math.min(chapters.value.length - 1, Number.isInteger(requestedChapter)
            ? requestedChapter
            : (currentBook.value?.currentChapter ?? 0)));
        await getContent(initialChapter, true);
        await nextTick();
        const requestedPosition = route.query.pos !== undefined
            ? Number(route.query.pos)
            : currentBook.value?.currentChapterPos;
        if (Number.isInteger(requestedPosition) && Number(requestedPosition) >= 0) {
            const target = document.querySelector(`[data-chapter-index="${initialChapter}"] [data-chapterpos="${Number(requestedPosition)}"]`);
            if (target)
                jump(target, { duration: 0 });
        }
        if (supportsBookDetail)
            await syncBookmarkState();
        window.addEventListener('keyup', handleKeyPress);
        window.addEventListener('keydown', ignoreKeyPress);
        window.addEventListener('scroll', onScroll, { passive: true });
        document.addEventListener('visibilitychange', onVisibilityChange);
        scrollObserver = new IntersectionObserver(onReachBottom, {
            rootMargin: '-100% 0% 20% 0%',
        });
        if (infiniteLoading.value && loadingRef.value) {
            scrollObserver.observe(loadingRef.value);
        }
    }
    catch (err) {
        console.error('加载图书失败详情:', err);
        ElMessage.error(err instanceof Error ? `加载图书失败: ${err.message}` : '加载图书失败，正在返回书架...');
        setTimeout(toShelf, 1500);
    }
});
onUnmounted(() => {
    flushReadingSession(false).catch(console.error);
    window.removeEventListener('keyup', handleKeyPress);
    window.removeEventListener('keydown', ignoreKeyPress);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('scroll', onScroll);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    if (progressFrame !== null)
        window.cancelAnimationFrame(progressFrame);
    popCataVisible.value = false;
    readSettingsVisible.value = false;
    scrollObserver?.disconnect();
    scrollObserver = null;
    store.cleanup();
});
onBeforeRouteLeave(() => {
    window.removeEventListener('keyup', handleKeyPress);
    if (currentBook.value) {
        store.saveProgress().catch(console.error);
        flushReadingSession(false).catch(console.error);
    }
});
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['tool-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['action-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-text']} */ ;
/** @type {__VLS_StyleScopedClasses['no-point']} */ ;
/** @type {__VLS_StyleScopedClasses['tools']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['iconfont']} */ ;
/** @type {__VLS_StyleScopedClasses['no-point']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-text']} */ ;
/** @type {__VLS_StyleScopedClasses['chapter']} */ ;
/** @type {__VLS_StyleScopedClasses['popup']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-text']} */ ;
/** @type {__VLS_StyleScopedClasses['chapter']} */ ;
/** @type {__VLS_StyleScopedClasses['chapter-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['tools']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['read-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['tools']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['iconfont']} */ ;
/** @type {__VLS_StyleScopedClasses['bookmark-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['chapter']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onClick: (__VLS_ctx.handleWrapperClick) },
    ...{ class: "chapter-wrapper" },
    ...{ style: (__VLS_ctx.bodyTheme) },
    ...{ class: ({ night: __VLS_ctx.isNight, day: !__VLS_ctx.isNight }) },
});
/** @type {__VLS_StyleScopedClasses['chapter-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['night']} */ ;
/** @type {__VLS_StyleScopedClasses['day']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onClick: () => { } },
    ...{ class: "tool-bar" },
    ...{ style: (__VLS_ctx.leftBarTheme) },
});
/** @type {__VLS_StyleScopedClasses['tool-bar']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "tools" },
});
/** @type {__VLS_StyleScopedClasses['tools']} */ ;
let __VLS_0;
/** @ts-ignore @type { | typeof __VLS_components.elPopover | typeof __VLS_components.ElPopover | typeof __VLS_components['el-popover'] | typeof __VLS_components.elPopover | typeof __VLS_components.ElPopover | typeof __VLS_components['el-popover']} */
elPopover;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    placement: "right",
    width: (__VLS_ctx.popupWidth),
    trigger: "click",
    showArrow: (false),
    visible: (__VLS_ctx.popCataVisible),
    popperClass: "pop-cata",
}));
const __VLS_2 = __VLS_1({
    placement: "right",
    width: (__VLS_ctx.popupWidth),
    trigger: "click",
    showArrow: (false),
    visible: (__VLS_ctx.popCataVisible),
    popperClass: "pop-cata",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
const { default: __VLS_5 } = __VLS_3.slots;
const __VLS_6 = PopCatalog;
// @ts-ignore
const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
    ...{ 'onGetContent': {} },
    ...{ class: "popup" },
}));
const __VLS_8 = __VLS_7({
    ...{ 'onGetContent': {} },
    ...{ class: "popup" },
}, ...__VLS_functionalComponentArgsRest(__VLS_7));
let __VLS_11;
const __VLS_12 = {
    /** @type {typeof __VLS_11.getContent} */
    onGetContent: (__VLS_ctx.getContent),
};
/** @type {__VLS_StyleScopedClasses['popup']} */ ;
var __VLS_9;
var __VLS_10;
{
    const { reference: __VLS_13 } = __VLS_3.slots;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "tool-icon" },
    });
    /** @type {__VLS_StyleScopedClasses['tool-icon']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "iconfont" },
    });
    /** @type {__VLS_StyleScopedClasses['iconfont']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "icon-text" },
    });
    /** @type {__VLS_StyleScopedClasses['icon-text']} */ ;
    // @ts-ignore
    [handleWrapperClick, bodyTheme, isNight, isNight, leftBarTheme, popupWidth, popCataVisible, getContent,];
}
// @ts-ignore
[];
var __VLS_3;
let __VLS_14;
/** @ts-ignore @type { | typeof __VLS_components.elPopover | typeof __VLS_components.ElPopover | typeof __VLS_components['el-popover'] | typeof __VLS_components.elPopover | typeof __VLS_components.ElPopover | typeof __VLS_components['el-popover']} */
elPopover;
// @ts-ignore
const __VLS_15 = __VLS_asFunctionalComponent1(__VLS_14, new __VLS_14({
    placement: "right",
    width: (__VLS_ctx.popupWidth),
    trigger: "click",
    showArrow: (false),
    visible: (__VLS_ctx.readSettingsVisible),
    popperClass: "pop-setting",
}));
const __VLS_16 = __VLS_15({
    placement: "right",
    width: (__VLS_ctx.popupWidth),
    trigger: "click",
    showArrow: (false),
    visible: (__VLS_ctx.readSettingsVisible),
    popperClass: "pop-setting",
}, ...__VLS_functionalComponentArgsRest(__VLS_15));
const { default: __VLS_19 } = __VLS_17.slots;
const __VLS_20 = ReadSettings;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent1(__VLS_20, new __VLS_20({
    ...{ class: "popup" },
}));
const __VLS_22 = __VLS_21({
    ...{ class: "popup" },
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
/** @type {__VLS_StyleScopedClasses['popup']} */ ;
{
    const { reference: __VLS_25 } = __VLS_17.slots;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "tool-icon" },
    });
    /** @type {__VLS_StyleScopedClasses['tool-icon']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "iconfont" },
    });
    /** @type {__VLS_StyleScopedClasses['iconfont']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "icon-text" },
    });
    /** @type {__VLS_StyleScopedClasses['icon-text']} */ ;
    // @ts-ignore
    [popupWidth, readSettingsVisible,];
}
// @ts-ignore
[];
var __VLS_17;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onClick: (__VLS_ctx.toShelf) },
    ...{ class: "tool-icon" },
});
/** @type {__VLS_StyleScopedClasses['tool-icon']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "iconfont" },
});
/** @type {__VLS_StyleScopedClasses['iconfont']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "icon-text" },
});
/** @type {__VLS_StyleScopedClasses['icon-text']} */ ;
if (__VLS_ctx.supportsBookDetail) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (__VLS_ctx.toBookDetail) },
        ...{ class: "tool-icon" },
    });
    /** @type {__VLS_StyleScopedClasses['tool-icon']} */ ;
    let __VLS_26;
    /** @ts-ignore @type { | typeof __VLS_components.elIcon | typeof __VLS_components.ElIcon | typeof __VLS_components['el-icon'] | typeof __VLS_components.elIcon | typeof __VLS_components.ElIcon | typeof __VLS_components['el-icon']} */
    elIcon;
    // @ts-ignore
    const __VLS_27 = __VLS_asFunctionalComponent1(__VLS_26, new __VLS_26({
        ...{ class: "action-icon" },
    }));
    const __VLS_28 = __VLS_27({
        ...{ class: "action-icon" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_27));
    /** @type {__VLS_StyleScopedClasses['action-icon']} */ ;
    const { default: __VLS_31 } = __VLS_29.slots;
    let __VLS_32;
    /** @ts-ignore @type { | typeof __VLS_components.DetailIcon} */
    DetailIcon;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent1(__VLS_32, new __VLS_32({}));
    const __VLS_34 = __VLS_33({}, ...__VLS_functionalComponentArgsRest(__VLS_33));
    // @ts-ignore
    [toShelf, supportsBookDetail, toBookDetail,];
    var __VLS_29;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "icon-text" },
    });
    /** @type {__VLS_StyleScopedClasses['icon-text']} */ ;
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onClick: (__VLS_ctx.refreshCurrentChapter) },
    ...{ class: "tool-icon" },
    ...{ class: ({ 'no-point': __VLS_ctx.chapterLoading }) },
    title: "重新请求并覆盖本章缓存",
});
/** @type {__VLS_StyleScopedClasses['tool-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['no-point']} */ ;
let __VLS_37;
/** @ts-ignore @type { | typeof __VLS_components.elIcon | typeof __VLS_components.ElIcon | typeof __VLS_components['el-icon'] | typeof __VLS_components.elIcon | typeof __VLS_components.ElIcon | typeof __VLS_components['el-icon']} */
elIcon;
// @ts-ignore
const __VLS_38 = __VLS_asFunctionalComponent1(__VLS_37, new __VLS_37({
    ...{ class: "action-icon" },
}));
const __VLS_39 = __VLS_38({
    ...{ class: "action-icon" },
}, ...__VLS_functionalComponentArgsRest(__VLS_38));
/** @type {__VLS_StyleScopedClasses['action-icon']} */ ;
const { default: __VLS_42 } = __VLS_40.slots;
let __VLS_43;
/** @ts-ignore @type { | typeof __VLS_components.RefreshIcon} */
RefreshIcon;
// @ts-ignore
const __VLS_44 = __VLS_asFunctionalComponent1(__VLS_43, new __VLS_43({}));
const __VLS_45 = __VLS_44({}, ...__VLS_functionalComponentArgsRest(__VLS_44));
// @ts-ignore
[refreshCurrentChapter, chapterLoading,];
var __VLS_40;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "icon-text" },
});
/** @type {__VLS_StyleScopedClasses['icon-text']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onClick: (...[$event]) => {
            return (__VLS_ctx.downloadDialogVisible = true);
            // @ts-ignore
            [downloadDialogVisible,];
        } },
    ...{ class: "tool-icon" },
    ...{ class: ({ 'no-point': __VLS_ctx.currentBook?.format !== 'online' }) },
    title: "下载章节供离线阅读",
});
/** @type {__VLS_StyleScopedClasses['tool-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['no-point']} */ ;
let __VLS_48;
/** @ts-ignore @type { | typeof __VLS_components.elIcon | typeof __VLS_components.ElIcon | typeof __VLS_components['el-icon'] | typeof __VLS_components.elIcon | typeof __VLS_components.ElIcon | typeof __VLS_components['el-icon']} */
elIcon;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent1(__VLS_48, new __VLS_48({
    ...{ class: "action-icon" },
}));
const __VLS_50 = __VLS_49({
    ...{ class: "action-icon" },
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
/** @type {__VLS_StyleScopedClasses['action-icon']} */ ;
const { default: __VLS_53 } = __VLS_51.slots;
let __VLS_54;
/** @ts-ignore @type { | typeof __VLS_components.DownloadIcon} */
DownloadIcon;
// @ts-ignore
const __VLS_55 = __VLS_asFunctionalComponent1(__VLS_54, new __VLS_54({}));
const __VLS_56 = __VLS_55({}, ...__VLS_functionalComponentArgsRest(__VLS_55));
// @ts-ignore
[currentBook,];
var __VLS_51;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "icon-text" },
});
/** @type {__VLS_StyleScopedClasses['icon-text']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onClick: (__VLS_ctx.toggleFullscreen) },
    ...{ class: "tool-icon" },
    title: (__VLS_ctx.isFullscreen ? '退出全屏 (F11/ESC)' : '全屏阅读 (F11)'),
});
/** @type {__VLS_StyleScopedClasses['tool-icon']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "iconfont" },
});
/** @type {__VLS_StyleScopedClasses['iconfont']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "icon-text" },
});
/** @type {__VLS_StyleScopedClasses['icon-text']} */ ;
(__VLS_ctx.isFullscreen ? '退出' : '全屏');
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onClick: (__VLS_ctx.toTop) },
    ...{ class: "tool-icon" },
});
/** @type {__VLS_StyleScopedClasses['tool-icon']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "iconfont" },
});
/** @type {__VLS_StyleScopedClasses['iconfont']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "icon-text" },
});
/** @type {__VLS_StyleScopedClasses['icon-text']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onClick: (__VLS_ctx.toBottom) },
    ...{ class: "tool-icon" },
});
/** @type {__VLS_StyleScopedClasses['tool-icon']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "iconfont" },
});
/** @type {__VLS_StyleScopedClasses['iconfont']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "icon-text" },
});
/** @type {__VLS_StyleScopedClasses['icon-text']} */ ;
if (__VLS_ctx.supportsBookDetail) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: () => { } },
        ...{ class: "bookmark-bar" },
        ...{ style: (__VLS_ctx.rightBarTheme) },
    });
    /** @type {__VLS_StyleScopedClasses['bookmark-bar']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onClick: (__VLS_ctx.openBookmarksDrawer) },
        ...{ class: "tool-icon" },
        ...{ class: ({ active: __VLS_ctx.isCurrentPositionBookmarked }) },
        title: "查看本书书签",
    });
    /** @type {__VLS_StyleScopedClasses['tool-icon']} */ ;
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    let __VLS_59;
    /** @ts-ignore @type { | typeof __VLS_components.elIcon | typeof __VLS_components.ElIcon | typeof __VLS_components['el-icon'] | typeof __VLS_components.elIcon | typeof __VLS_components.ElIcon | typeof __VLS_components['el-icon']} */
    elIcon;
    // @ts-ignore
    const __VLS_60 = __VLS_asFunctionalComponent1(__VLS_59, new __VLS_59({
        ...{ class: "action-icon" },
    }));
    const __VLS_61 = __VLS_60({
        ...{ class: "action-icon" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_60));
    /** @type {__VLS_StyleScopedClasses['action-icon']} */ ;
    const { default: __VLS_64 } = __VLS_62.slots;
    let __VLS_65;
    /** @ts-ignore @type { | typeof __VLS_components.BookmarkIcon} */
    BookmarkIcon;
    // @ts-ignore
    const __VLS_66 = __VLS_asFunctionalComponent1(__VLS_65, new __VLS_65({}));
    const __VLS_67 = __VLS_66({}, ...__VLS_functionalComponentArgsRest(__VLS_66));
    // @ts-ignore
    [supportsBookDetail, toggleFullscreen, isFullscreen, isFullscreen, toTop, toBottom, rightBarTheme, openBookmarksDrawer, isCurrentPositionBookmarked,];
    var __VLS_62;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "icon-text" },
    });
    /** @type {__VLS_StyleScopedClasses['icon-text']} */ ;
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onClick: () => { } },
    ...{ class: "read-bar" },
    ...{ style: (__VLS_ctx.rightBarTheme) },
});
/** @type {__VLS_StyleScopedClasses['read-bar']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "tools" },
});
/** @type {__VLS_StyleScopedClasses['tools']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onClick: (__VLS_ctx.toPreChapter) },
    ...{ class: "tool-icon" },
    ...{ class: ({ 'no-point': __VLS_ctx.isFirstChapter }) },
});
/** @type {__VLS_StyleScopedClasses['tool-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['no-point']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "iconfont" },
});
/** @type {__VLS_StyleScopedClasses['iconfont']} */ ;
if (__VLS_ctx.miniInterface) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ onClick: (__VLS_ctx.toNextChapter) },
    ...{ class: "tool-icon" },
    ...{ class: ({ 'no-point': __VLS_ctx.isLastChapter }) },
});
/** @type {__VLS_StyleScopedClasses['tool-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['no-point']} */ ;
if (__VLS_ctx.miniInterface) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "iconfont" },
});
/** @type {__VLS_StyleScopedClasses['iconfont']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "chapter" },
    ref: "contentRef",
    ...{ style: (__VLS_ctx.chapterTheme) },
});
/** @type {__VLS_StyleScopedClasses['chapter']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "content" },
});
/** @type {__VLS_StyleScopedClasses['content']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "top-bar" },
    ref: "topRef",
});
/** @type {__VLS_StyleScopedClasses['top-bar']} */ ;
for (const [data] of __VLS_vFor((__VLS_ctx.chapterData))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        key: (data.index),
        'data-chapter-index': (data.index),
    });
    const __VLS_70 = ChapterContent;
    // @ts-ignore
    const __VLS_71 = __VLS_asFunctionalComponent1(__VLS_70, new __VLS_70({
        contents: (data.content),
        title: (data.title),
        format: (data.format),
        spacing: (__VLS_ctx.settings.spacing),
        fontSize: (__VLS_ctx.fontSizeStr),
        fontFamily: (__VLS_ctx.fontFamilyStr),
        chapterIndex: (data.index),
    }));
    const __VLS_72 = __VLS_71({
        contents: (data.content),
        title: (data.title),
        format: (data.format),
        spacing: (__VLS_ctx.settings.spacing),
        fontSize: (__VLS_ctx.fontSizeStr),
        fontFamily: (__VLS_ctx.fontFamilyStr),
        chapterIndex: (data.index),
    }, ...__VLS_functionalComponentArgsRest(__VLS_71));
    // @ts-ignore
    [rightBarTheme, toPreChapter, isFirstChapter, miniInterface, miniInterface, toNextChapter, isLastChapter, chapterTheme, chapterData, settings, fontSizeStr, fontFamilyStr,];
}
if (__VLS_ctx.infiniteLoading) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "loading" },
        ref: "loadingRef",
    });
    /** @type {__VLS_StyleScopedClasses['loading']} */ ;
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "bottom-bar" },
    ref: "bottomRef",
});
/** @type {__VLS_StyleScopedClasses['bottom-bar']} */ ;
const __VLS_75 = NovelDownloadDialog;
// @ts-ignore
const __VLS_76 = __VLS_asFunctionalComponent1(__VLS_75, new __VLS_75({
    modelValue: (__VLS_ctx.downloadDialogVisible),
    book: (__VLS_ctx.currentBook),
    chapters: (__VLS_ctx.chapters),
}));
const __VLS_77 = __VLS_76({
    modelValue: (__VLS_ctx.downloadDialogVisible),
    book: (__VLS_ctx.currentBook),
    chapters: (__VLS_ctx.chapters),
}, ...__VLS_functionalComponentArgsRest(__VLS_76));
const __VLS_80 = ReaderBookmarksDrawer;
// @ts-ignore
const __VLS_81 = __VLS_asFunctionalComponent1(__VLS_80, new __VLS_80({
    ...{ 'onToggleCurrent': {} },
    ...{ 'onJump': {} },
    ...{ 'onDelete': {} },
    modelValue: (__VLS_ctx.bookmarkDrawerVisible),
    bookmarks: (__VLS_ctx.currentBookBookmarks),
    loading: (__VLS_ctx.bookmarksLoading),
    saving: (__VLS_ctx.bookmarkSaving),
    currentPositionBookmarked: (__VLS_ctx.isCurrentPositionBookmarked),
}));
const __VLS_82 = __VLS_81({
    ...{ 'onToggleCurrent': {} },
    ...{ 'onJump': {} },
    ...{ 'onDelete': {} },
    modelValue: (__VLS_ctx.bookmarkDrawerVisible),
    bookmarks: (__VLS_ctx.currentBookBookmarks),
    loading: (__VLS_ctx.bookmarksLoading),
    saving: (__VLS_ctx.bookmarkSaving),
    currentPositionBookmarked: (__VLS_ctx.isCurrentPositionBookmarked),
}, ...__VLS_functionalComponentArgsRest(__VLS_81));
let __VLS_85;
const __VLS_86 = {
    /** @type {typeof __VLS_85.toggleCurrent} */
    onToggleCurrent: (__VLS_ctx.toggleCurrentBookmark),
};
const __VLS_87 = {
    /** @type {typeof __VLS_85.jump} */
    onJump: (__VLS_ctx.jumpToBookmark),
};
const __VLS_88 = {
    /** @type {typeof __VLS_85.delete} */
    onDelete: (__VLS_ctx.removeBookmarkFromDrawer),
};
var __VLS_83;
var __VLS_84;
// @ts-ignore
[downloadDialogVisible, currentBook, isCurrentPositionBookmarked, infiniteLoading, chapters, bookmarkDrawerVisible, currentBookBookmarks, bookmarksLoading, bookmarkSaving, toggleCurrentBookmark, jumpToBookmark, removeBookmarkFromDrawer,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
