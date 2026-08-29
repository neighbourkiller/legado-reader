export const READER_PAGE_TURN_GUIDE_VERSION = 1
export const READER_PAGE_TURN_GUIDE_KEY = 'legado_reader_page_turn_guide_version'

/**
 * 与 Android 的 readHelpVersion 一样，阅读操作引导按版本只展示一次。
 * Desktop 使用 Tauri 偏好存储，Web 使用 localStorage，因此两个客户端各自首次进入时都会展示。
 */
export function shouldShowReaderPageTurnGuide(storedVersion: string | null): boolean {
  const version = Number.parseInt(storedVersion ?? '0', 10)
  return !Number.isFinite(version) || version < READER_PAGE_TURN_GUIDE_VERSION
}
