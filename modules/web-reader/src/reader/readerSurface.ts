import themeConfig from '@/config/themeConfig'

export const READER_SURFACE_CLASS = 'reader-surface-active'
export const READER_SURFACE_BACKGROUND_PROPERTY = '--reader-surface-background'
export const DEFAULT_READER_SURFACE_BACKGROUND = '#f4eee1'

export function resolveReaderSurfaceBackground(themeIndex: number): string {
  return themeConfig.themes[themeIndex]?.body || DEFAULT_READER_SURFACE_BACKGROUND
}

export function syncReaderSurfaceDocument(
  active: boolean,
  background: string,
  targetDocument: Document = document,
): void {
  const root = targetDocument.documentElement
  root.classList.toggle(READER_SURFACE_CLASS, active)
  if (active) {
    root.style.setProperty(READER_SURFACE_BACKGROUND_PROPERTY, background)
  } else {
    root.style.removeProperty(READER_SURFACE_BACKGROUND_PROPERTY)
  }
}
