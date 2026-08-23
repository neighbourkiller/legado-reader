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
    const setBookshelfClickAction = (action) => {
        bookshelfClickAction.value = action;
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ bookshelfClickAction: action }));
    };
    return {
        bookshelfClickAction,
        setBookshelfClickAction,
    };
});
