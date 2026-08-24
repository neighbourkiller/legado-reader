export const BACKUP_FORMAT = 'legado-tauri-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const MAX_BACKUP_ENTRIES = 10000;
export const MAX_BACKUP_UNCOMPRESSED_BYTES = 512 * 1024 * 1024;
export const ANDROID_BACKUP_FILES = [
    'bookSource.json',
    'bookshelf.json',
    'bookmark.json',
    'readRecord.json',
];
export const ANDROID_OPTIONAL_BACKUP_FILES = ['highlight.json', 'replaceRule.json'];
export const TAURI_DATA_FILE = 'tauri/data.json';
export const TAURI_MANIFEST_FILE = 'tauri/manifest.json';
