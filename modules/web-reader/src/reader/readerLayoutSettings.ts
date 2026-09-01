import type { ReadSettings } from '@/parsers/types'
import { DEFAULT_READ_SETTINGS } from '@/parsers/types'

export const READER_CONTENT_PADDING_MIN = 0
export const READER_CONTENT_PADDING_MAX = 200
export const READER_CONTENT_PADDING_STEP = 4

export const READER_DOCK_HEIGHT_MIN = 56
export const READER_DOCK_HEIGHT_MAX = 88
export const READER_DOCK_HEIGHT_STEP = 4

export type ReaderLayoutSettings = Pick<
  ReadSettings,
  'contentPaddingTop' | 'contentPaddingBottom' | 'dockHeight'
>

function normalizeInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

export function normalizeReaderLayoutSettings(
  settings: Partial<ReadSettings>,
): ReaderLayoutSettings {
  return {
    contentPaddingTop: normalizeInteger(
      settings.contentPaddingTop,
      DEFAULT_READ_SETTINGS.contentPaddingTop,
      READER_CONTENT_PADDING_MIN,
      READER_CONTENT_PADDING_MAX,
    ),
    contentPaddingBottom: normalizeInteger(
      settings.contentPaddingBottom,
      DEFAULT_READ_SETTINGS.contentPaddingBottom,
      READER_CONTENT_PADDING_MIN,
      READER_CONTENT_PADDING_MAX,
    ),
    dockHeight: normalizeInteger(
      settings.dockHeight,
      DEFAULT_READ_SETTINGS.dockHeight,
      READER_DOCK_HEIGHT_MIN,
      READER_DOCK_HEIGHT_MAX,
    ),
  }
}
