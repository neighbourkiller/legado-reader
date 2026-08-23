export const platform = {
    get isDesktop() {
        return import.meta.env.VITE_APP_TARGET === 'desktop'
            && typeof window !== 'undefined'
            && '__TAURI_INTERNALS__' in window;
    },
    get supportsNativeHttp() { return this.isDesktop; },
    get supportsOnlineBookSources() { return this.isDesktop; },
    get supportsNativeFileDialog() { return this.isDesktop; },
};
