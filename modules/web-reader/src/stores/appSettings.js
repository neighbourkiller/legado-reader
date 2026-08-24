import { defineStore } from 'pinia';
import { ref } from 'vue';
const STORAGE_KEY = 'legado_app_settings';
function loadStoredSettings() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw)
            return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    }
    catch {
        return {};
    }
}
export const useAppSettingsStore = defineStore('appSettings', () => {
    const stored = loadStoredSettings();
    const bookshelfClickAction = ref(stored.bookshelfClickAction === 'detail' ? 'detail' : 'reader');
    const readerThemeSyncPreference = ref(stored.readerThemeSyncPreference === 'sync' ||
        stored.readerThemeSyncPreference === 'independent'
        ? stored.readerThemeSyncPreference
        : 'none');
    const searchEngine = ref(stored.searchEngine === 'baidu' || stored.searchEngine === 'google'
        ? stored.searchEngine
        : 'bing');
    const lastHighlightStyle = ref(stored.lastHighlightStyle?.kind === 'underline'
        ? {
            kind: 'underline',
            color: stored.lastHighlightStyle.color || '#e53935',
            lineStyle: stored.lastHighlightStyle.lineStyle || 'wavy',
        }
        : {
            kind: 'background',
            color: stored.lastHighlightStyle?.color || 'rgba(255, 241, 118, 0.5)',
        });
    const persistSettings = () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            bookshelfClickAction: bookshelfClickAction.value,
            readerThemeSyncPreference: readerThemeSyncPreference.value,
            searchEngine: searchEngine.value,
            lastHighlightStyle: { ...lastHighlightStyle.value },
        }));
    };
    const setBookshelfClickAction = (action) => {
        bookshelfClickAction.value = action;
        persistSettings();
    };
    const setReaderThemeSyncPreference = (preference) => {
        readerThemeSyncPreference.value = preference;
        persistSettings();
    };
    const setSearchEngine = (engine) => {
        searchEngine.value = engine;
        persistSettings();
    };
    const setLastHighlightStyle = (style) => {
        lastHighlightStyle.value = { ...style };
        persistSettings();
    };
    return {
        bookshelfClickAction,
        readerThemeSyncPreference,
        searchEngine,
        lastHighlightStyle,
        setBookshelfClickAction,
        setReaderThemeSyncPreference,
        setSearchEngine,
        setLastHighlightStyle,
    };
});
