import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getAllBookSources, saveBookSource, deleteBookSource as deleteBookSourceFromDB, importBookSources as importBookSourcesToDB, getAllReplaceRules, saveReplaceRule, } from '@/storage/db';
import { getTransport } from '@/source/transport';
import { getDefaultUserAgent } from '@/source/engine/SourceEngine';
import { applyRulesToSourceJson, ReplacementTimeoutError } from '@/utils/replaceRules';
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
    function parseSources(jsonText) {
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
        return validList;
    }
    async function previewSourceImport(jsonText) {
        const original = parseSources(jsonText);
        const rules = await getAllReplaceRules();
        const replaced = [];
        const errors = [];
        let changed = 0;
        for (const source of original) {
            try {
                const result = await applyRulesToSourceJson(source, rules);
                replaced.push(result);
                if (JSON.stringify(result) !== JSON.stringify(source))
                    changed += 1;
            }
            catch (error) {
                if (error instanceof ReplacementTimeoutError) {
                    await saveReplaceRule({ ...error.rule, isEnabled: false }).catch(console.error);
                }
                replaced.push(source);
                errors.push({
                    name: String(source.bookSourceName || source.bookSourceUrl || '未命名书源'),
                    message: error instanceof Error ? error.message : String(error),
                });
            }
        }
        return { original, replaced, changed, errors };
    }
    async function importPreparedSources(preview, useReplacement) {
        if (useReplacement && preview.errors.length > 0) {
            throw new Error(`有 ${preview.errors.length} 条书源替换失败，请改为导入原始书源或修正规则`);
        }
        const validList = useReplacement ? preview.replaced : preview.original;
        const uniqueCount = await importBookSourcesToDB(validList);
        await loadSources();
        return {
            total: validList.length,
            unique: uniqueCount,
            duplicates: validList.length - uniqueCount,
            changed: useReplacement ? preview.changed : 0,
            replacementErrors: preview.errors.length,
        };
    }
    async function importSources(jsonText, useReplacement = true) {
        return importPreparedSources(await previewSourceImport(jsonText), useReplacement);
    }
    async function fetchSourceText(url) {
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
                'User-Agent': getDefaultUserAgent(),
            },
            timeout: 30000,
        });
        if (res.status < 200 || res.status >= 300) {
            throw new Error(`网络请求失败 (HTTP ${res.status})`);
        }
        return new TextDecoder(res.charset || 'utf-8').decode(res.body);
    }
    async function previewSourceImportFromUrl(url) {
        return previewSourceImport(await fetchSourceText(url));
    }
    async function importSourcesFromUrl(url, useReplacement = true) {
        return importSources(await fetchSourceText(url), useReplacement);
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
        previewSourceImport,
        previewSourceImportFromUrl,
        importPreparedSources,
        toggleSource,
        setAllSourcesEnabled,
        getEnabledSources,
    };
});
