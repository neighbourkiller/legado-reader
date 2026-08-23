export const platform = {
  get isDesktop(): boolean {
    return import.meta.env.VITE_APP_TARGET === 'desktop'
      && typeof window !== 'undefined'
      && '__TAURI_INTERNALS__' in window
  },
  get supportsNativeHttp(): boolean { return this.isDesktop },
  get supportsOnlineBookSources(): boolean { return this.isDesktop },
  get supportsNativeFileDialog(): boolean { return this.isDesktop },
}
