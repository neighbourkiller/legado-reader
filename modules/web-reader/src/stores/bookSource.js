import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getAllBookSources, saveBookSource, deleteBookSource as deleteBookSourceFromDB, importBookSources as importBookSourcesToDB, } from '@/storage/db';
import { getTransport } from '@/source/transport';
export const useBookSourceStore = defineStore('bookSource', () => {
    const sources = ref([]);
    const isLoading = ref(false);
    function sortSources(list) {
        return [...list].sort((a, b) => {
            const topA = a.isTop ? 1 : 0;
            const topB = b.isTop ? 1 : 0;
            if (topA !== topB) {
                return topB - topA;
            }
            const orderA = a.customOrder ?? 0;
            const orderB = b.customOrder ?? 0;
            if (orderA !== orderB) {
                return orderB - orderA;
            }
            return 0;
        });
    }
    async function loadSources() {
        isLoading.value = true;
        try {
            const raw = await getAllBookSources();
            sources.value = sortSources(raw);
        }
        finally {
            isLoading.value = false;
        }
    }
    async function addSource(source) {
        await saveBookSource(source);
        await loadSources();
    }
    async function deleteSource(bookSourceUrl) {
        await deleteBookSourceFromDB(bookSourceUrl);
        sources.value = sources.value.filter(s => s.bookSourceUrl !== bookSourceUrl);
    }
    async function deleteAllSources() {
        for (const source of sources.value) {
            await deleteBookSourceFromDB(source.bookSourceUrl);
        }
        sources.value = [];
    }
    async function importSources(jsonText) {
        let parsed;
        const trimmed = jsonText.trim();
        try {
            parsed = JSON.parse(trimmed);
        }
        catch {
            // 尝试提取 JSON 数组或对象（去除首尾多余非 JSON 字符）
            const firstBracket = trimmed.indexOf('[');
            const firstBrace = trimmed.indexOf('{');
            let start = -1;
            if (firstBracket !== -1 && firstBrace !== -1) {
                start = Math.min(firstBracket, firstBrace);
            }
            else {
                start = Math.max(firstBracket, firstBrace);
            }
            if (start !== -1) {
                const lastBracket = trimmed.lastIndexOf(']');
                const lastBrace = trimmed.lastIndexOf('}');
                const end = Math.max(lastBracket, lastBrace);
                if (end > start) {
                    parsed = JSON.parse(trimmed.slice(start, end + 1));
                }
                else {
                    parsed = JSON.parse(trimmed.slice(start));
                }
            }
            else {
                throw new Error('无效的 JSON 格式');
            }
        }
        const rawList = Array.isArray(parsed) ? parsed : [parsed];
        const validList = rawList
            .filter((s) => Boolean(s && typeof s === 'object' && s.bookSourceName))
            .map(s => {
            const source = { ...s };
            if (!source.bookSourceUrl || typeof source.bookSourceUrl !== 'string' || !source.bookSourceUrl.trim()) {
                source.bookSourceUrl = `source_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            }
            if (source.enabled === undefined) {
                source.enabled = true;
            }
            return source;
        });
        if (validList.length === 0) {
            throw new Error('数据中未包含有效的书源规则对象');
        }
        const uniqueCount = await importBookSourcesToDB(validList);
        await loadSources();
        return {
            total: validList.length,
            unique: uniqueCount,
            duplicates: validList.length - uniqueCount,
        };
    }
    async function importSourcesFromUrl(url) {
        const targetUrl = url.trim();
        if (!targetUrl || (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://'))) {
            throw new Error('请输入以 http:// 或 https:// 开头的有效链接');
        }
        const transport = await getTransport();
        const res = await transport.request({
            sourceId: 'book_source_import_url',
            url: targetUrl,
            method: 'GET',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
            timeout: 30000,
        });
        if (res.status < 200 || res.status >= 300) {
            throw new Error(`网络请求失败 (HTTP ${res.status})`);
        }
        const text = new TextDecoder(res.charset || 'utf-8').decode(res.body);
        return await importSources(text);
    }
    async function toggleSource(bookSourceUrl) {
        const source = sources.value.find(s => s.bookSourceUrl === bookSourceUrl);
        if (!source)
            return;
        source.enabled = !source.enabled;
        await saveBookSource(source);
    }
    async function setAllSourcesEnabled(enabled) {
        for (const source of sources.value) {
            source.enabled = enabled;
            await saveBookSource(source);
        }
    }
    function getEnabledSources() {
        return sources.value.filter(s => s.enabled);
    }
    async function updateSource(source) {
        await saveBookSource(source);
        await loadSources();
    }
    async function toggleTopSource(bookSourceUrl) {
        const source = sources.value.find(s => s.bookSourceUrl === bookSourceUrl);
        if (!source)
            return;
        source.isTop = !source.isTop;
        source.customOrder = source.isTop ? Date.now() : 0;
        await saveBookSource(source);
        sources.value = sortSources([...sources.value]);
    }
    return {
        sources,
        isLoading,
        loadSources,
        addSource,
        updateSource,
        toggleTopSource,
        deleteSource,
        deleteAllSources,
        importSources,
        importSourcesFromUrl,
        toggleSource,
        setAllSourcesEnabled,
        getEnabledSources,
    };
});
