export const MAX_RETAINED_CHAPTERS = 10

export const trimChapterWindowBeforeAppend = <T>(chapters: T[]): T[] =>
  chapters.length < MAX_RETAINED_CHAPTERS
    ? chapters
    : chapters.slice(chapters.length - MAX_RETAINED_CHAPTERS + 1)
