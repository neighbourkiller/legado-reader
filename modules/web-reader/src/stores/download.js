import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { SourceEngine } from '@/source/engine/SourceEngine';
import { getBookChapterContents, saveChapterContent, } from '@/storage/db';
const DOWNLOAD_CONCURRENCY = 2;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;
function wait(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
}
export const useDownloadStore = defineStore('download', () => {
    const tasks = ref({});
    const cancelFlags = new Map();
    const activeCount = computed(() => Object.values(tasks.value).filter(task => task.status === 'running').length);
    function getTask(bookId) {
        return tasks.value[bookId];
    }
    async function getDownloadedCount(bookId, sourceUrl, chapters) {
        const records = await getBookChapterContents(bookId);
        return records.filter(record => {
            if (sourceUrl && record.sourceUrl && record.sourceUrl !== sourceUrl)
                return false;
            const chapter = chapters?.[record.chapterIndex];
            if (chapters && !chapter)
                return false;
            if (chapter?.href && record.chapterUrl && record.chapterUrl !== chapter.href)
                return false;
            return true;
        }).length;
    }
    async function fetchWithRetry(engine, source, href, cancelFlag) {
        let lastError;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
            if (cancelFlag.cancelled)
                throw new Error('下载已停止');
            try {
                const content = (await engine.getContent(source, href)).trim();
                if (!content)
                    throw new Error('章节正文为空');
                return content;
            }
            catch (error) {
                lastError = error;
                if (attempt < MAX_ATTEMPTS && !cancelFlag.cancelled) {
                    await wait(RETRY_DELAY_MS);
                }
            }
        }
        throw lastError instanceof Error ? lastError : new Error(String(lastError));
    }
    async function startDownload(book, chapters, source, startIndex = 0, endIndex = chapters.length - 1) {
        if (chapters.length === 0)
            throw new Error('当前书籍没有可下载的章节');
        const running = tasks.value[book.id];
        if (running?.status === 'running')
            return running;
        const safeStart = Math.max(0, Math.min(startIndex, chapters.length - 1));
        const safeEnd = Math.max(safeStart, Math.min(endIndex, chapters.length - 1));
        const selected = chapters.slice(safeStart, safeEnd + 1);
        const existing = await getBookChapterContents(book.id);
        const cachedIndexes = new Set(existing
            .filter(record => {
            if (record.sourceUrl && record.sourceUrl !== source.bookSourceUrl)
                return false;
            const chapter = chapters[record.chapterIndex];
            return !chapter?.href || !record.chapterUrl || record.chapterUrl === chapter.href;
        })
            .map(record => record.chapterIndex));
        const pending = selected.filter(chapter => !cachedIndexes.has(chapter.index));
        const skipped = selected.length - pending.length;
        const task = {
            bookId: book.id,
            bookName: book.name,
            startIndex: safeStart,
            endIndex: safeEnd,
            total: selected.length,
            completed: skipped,
            succeeded: 0,
            skipped,
            failed: 0,
            currentTitle: '',
            status: 'running',
            errors: [],
        };
        tasks.value[book.id] = task;
        const activeTask = tasks.value[book.id];
        const cancelFlag = { cancelled: false };
        cancelFlags.set(book.id, cancelFlag);
        let cursor = 0;
        const worker = async () => {
            const engine = new SourceEngine();
            while (!cancelFlag.cancelled) {
                const next = cursor;
                cursor += 1;
                const chapter = pending[next];
                if (!chapter)
                    return;
                activeTask.currentTitle = chapter.title;
                try {
                    if (!chapter.href)
                        throw new Error('章节链接为空');
                    const content = await fetchWithRetry(engine, source, chapter.href, cancelFlag);
                    if (cancelFlag.cancelled)
                        return;
                    await saveChapterContent({
                        bookId: book.id,
                        chapterIndex: chapter.index,
                        title: chapter.title,
                        content,
                        sourceUrl: source.bookSourceUrl,
                        chapterUrl: chapter.href,
                    });
                    activeTask.succeeded += 1;
                }
                catch (error) {
                    if (cancelFlag.cancelled)
                        return;
                    activeTask.failed += 1;
                    const message = error instanceof Error ? error.message : String(error);
                    activeTask.errors.push(`第 ${chapter.index + 1} 章 ${chapter.title}: ${message}`);
                }
                finally {
                    if (!cancelFlag.cancelled)
                        activeTask.completed += 1;
                }
            }
        };
        try {
            await Promise.all(Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, Math.max(1, pending.length)) }, () => worker()));
            if (cancelFlag.cancelled) {
                activeTask.status = 'cancelled';
            }
            else if (activeTask.failed > 0) {
                activeTask.status = 'partial';
            }
            else {
                activeTask.status = 'completed';
            }
            activeTask.currentTitle = '';
            return activeTask;
        }
        finally {
            cancelFlags.delete(book.id);
        }
    }
    function cancelDownload(bookId) {
        const flag = cancelFlags.get(bookId);
        if (flag)
            flag.cancelled = true;
    }
    return {
        tasks,
        activeCount,
        getTask,
        getDownloadedCount,
        startDownload,
        cancelDownload,
    };
});
