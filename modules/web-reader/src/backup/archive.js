import JSZip from 'jszip';
import { DATABASE_STORE_NAMES, aggregateReadingDevices, exportDatabaseSnapshot, importDatabaseSnapshot, normalizeReadingRecord, } from '@/storage/db';
import { createAndroidBackupData, fromAndroidBook, fromAndroidBookmark, fromAndroidHighlight, fromAndroidReadRecords, } from './compat';
import { ANDROID_BACKUP_FILES, ANDROID_OPTIONAL_BACKUP_FILES, BACKUP_FORMAT, BACKUP_FORMAT_VERSION, MAX_BACKUP_ENTRIES, MAX_BACKUP_UNCOMPRESSED_BYTES, TAURI_DATA_FILE, TAURI_MANIFEST_FILE, } from './types';
export const BACKED_UP_LOCAL_STORAGE_KEYS = [
    'legado_app_settings',
    'legado_web_reader_settings',
    'legado_theme',
    'legado_theme_accent',
];
const CRITICAL_FILES = new Set([
    ...ANDROID_BACKUP_FILES,
    ...ANDROID_OPTIONAL_BACKUP_FILES,
    TAURI_MANIFEST_FILE,
    TAURI_DATA_FILE,
].map(item => item.toLowerCase()));
function readUint16(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8);
}
function readUint32(bytes, offset) {
    return (bytes[offset] |
        (bytes[offset + 1] << 8) |
        (bytes[offset + 2] << 16) |
        (bytes[offset + 3] << 24)) >>> 0;
}
function findEndOfCentralDirectory(bytes) {
    const minimumOffset = Math.max(0, bytes.length - 65557);
    for (let offset = bytes.length - 22; offset >= minimumOffset; offset -= 1) {
        if (readUint32(bytes, offset) === 0x06054b50)
            return offset;
    }
    throw new Error('不是有效的 ZIP 文件：缺少中央目录');
}
/**
 * JSZip 会把同名条目折叠成一个对象，因此先解析中央目录来检测重复关键文件和解压上限。
 */
export function inspectZipCentralDirectory(bytes) {
    const eocdOffset = findEndOfCentralDirectory(bytes);
    const entryCount = readUint16(bytes, eocdOffset + 10);
    const directorySize = readUint32(bytes, eocdOffset + 12);
    const directoryOffset = readUint32(bytes, eocdOffset + 16);
    if (entryCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
        throw new Error('暂不支持 ZIP64 备份');
    }
    if (entryCount > MAX_BACKUP_ENTRIES) {
        throw new Error(`备份包含 ${entryCount} 个条目，超过 ${MAX_BACKUP_ENTRIES} 个上限`);
    }
    if (directoryOffset + directorySize > eocdOffset || directoryOffset > bytes.length) {
        throw new Error('ZIP 中央目录损坏');
    }
    const decoder = new TextDecoder();
    const entries = [];
    let offset = directoryOffset;
    let totalSize = 0;
    const criticalNames = new Set();
    for (let index = 0; index < entryCount; index += 1) {
        if (offset + 46 > bytes.length || readUint32(bytes, offset) !== 0x02014b50) {
            throw new Error('ZIP 中央目录条目损坏');
        }
        const flags = readUint16(bytes, offset + 8);
        if ((flags & 0x1) !== 0)
            throw new Error('不支持加密 ZIP 备份');
        const uncompressedSize = readUint32(bytes, offset + 24);
        const nameLength = readUint16(bytes, offset + 28);
        const extraLength = readUint16(bytes, offset + 30);
        const commentLength = readUint16(bytes, offset + 32);
        const nextOffset = offset + 46 + nameLength + extraLength + commentLength;
        if (nextOffset > bytes.length)
            throw new Error('ZIP 条目名称越界');
        const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
        validateArchivePath(name);
        totalSize += uncompressedSize;
        if (totalSize > MAX_BACKUP_UNCOMPRESSED_BYTES) {
            throw new Error('备份解压数据超过 512 MiB 上限');
        }
        const normalized = name.replace(/\\/g, '/').toLowerCase();
        if (CRITICAL_FILES.has(normalized)) {
            if (criticalNames.has(normalized))
                throw new Error(`备份包含重复关键文件：${name}`);
            criticalNames.add(normalized);
        }
        entries.push({ name, uncompressedSize });
        offset = nextOffset;
    }
    return entries;
}
export function validateArchivePath(name) {
    const normalized = name.replace(/\\/g, '/');
    if (!normalized ||
        normalized.includes('\0') ||
        normalized.startsWith('/') ||
        /^[a-zA-Z]:\//.test(normalized) ||
        normalized.split('/').some(segment => segment === '..')) {
        throw new Error(`备份包含不安全路径：${name}`);
    }
}
async function sha256(data) {
    const digest = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}
function jsonBytes(value) {
    return new TextEncoder().encode(JSON.stringify(value));
}
function parseJsonArray(raw, fileName) {
    if (!raw)
        return [];
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        throw new Error(`${fileName} 不是有效 JSON`);
    }
    if (!Array.isArray(parsed))
        throw new Error(`${fileName} 的顶层必须是数组`);
    return parsed;
}
function storeRecords(snapshot, name) {
    return (snapshot[name] || []);
}
function countSnapshot(snapshot) {
    const books = storeRecords(snapshot, 'books');
    return {
        bookSources: storeRecords(snapshot, 'bookSources').length,
        onlineBooks: books.filter(book => book.meta?.format === 'online').length,
        localBooks: books.filter(book => book.meta?.format !== 'online').length,
        bookmarks: storeRecords(snapshot, 'bookmarks').length,
        readingRecords: storeRecords(snapshot, 'readingRecords').length,
        chapterContents: storeRecords(snapshot, 'chapterContents').length,
        highlights: storeRecords(snapshot, 'highlights').length,
        replaceRules: storeRecords(snapshot, 'replaceRules').length,
    };
}
export function makeBackupFilename(deviceName = '') {
    const now = new Date();
    const date = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
    ].join('-');
    const safeDevice = deviceName.trim().replace(/[\\/:*?"<>|]/g, '_');
    return `backup${date}${safeDevice ? `-${safeDevice}` : ''}.zip`;
}
export async function createBackupArchive(appVersion = '1.0.0') {
    const snapshot = await exportDatabaseSnapshot();
    const books = storeRecords(snapshot, 'books');
    const chapterContents = storeRecords(snapshot, 'chapterContents');
    const bookmarks = storeRecords(snapshot, 'bookmarks');
    const readingRecords = storeRecords(snapshot, 'readingRecords');
    const highlights = storeRecords(snapshot, 'highlights');
    const replaceRules = storeRecords(snapshot, 'replaceRules');
    const converted = createAndroidBackupData({
        books,
        chapterContents,
        bookmarks,
        readingRecords,
        highlights,
        replaceRules,
    });
    converted.data.bookSources = storeRecords(snapshot, 'bookSources');
    const zip = new JSZip();
    const checksums = {};
    const addChecked = async (path, bytes) => {
        checksums[path] = await sha256(bytes);
        zip.file(path, bytes);
    };
    await addChecked('bookSource.json', jsonBytes(converted.data.bookSources));
    await addChecked('bookshelf.json', jsonBytes(converted.data.books));
    await addChecked('bookmark.json', jsonBytes(converted.data.bookmarks));
    await addChecked('readRecord.json', jsonBytes(converted.data.readingRecords));
    await addChecked('highlight.json', jsonBytes(converted.data.highlights));
    await addChecked('replaceRule.json', jsonBytes(converted.data.replaceRules));
    const backupBooks = [];
    for (let index = 0; index < books.length; index += 1) {
        const book = books[index];
        const backupBook = {
            meta: JSON.parse(JSON.stringify(book.meta)),
            chapters: JSON.parse(JSON.stringify(book.chapters)),
            fileData: null,
        };
        if (book.fileData) {
            const fileEntry = `tauri/books/${String(index).padStart(6, '0')}.${book.meta.format}`;
            backupBook.fileEntry = fileEntry;
            await addChecked(fileEntry, new Uint8Array(book.fileData));
        }
        backupBooks.push(backupBook);
    }
    const database = {
        ...snapshot,
        books: backupBooks,
    };
    const localStorageSnapshot = Object.fromEntries(BACKED_UP_LOCAL_STORAGE_KEYS.map(key => [key, localStorage.getItem(key)]));
    const tauriData = {
        version: 1,
        database,
        localStorage: localStorageSnapshot,
    };
    await addChecked(TAURI_DATA_FILE, jsonBytes(tauriData));
    const manifest = {
        format: BACKUP_FORMAT,
        version: BACKUP_FORMAT_VERSION,
        appVersion,
        createdAt: new Date().toISOString(),
        categories: [
            'bookSources',
            'books',
            'bookmarks',
            'readingRecords',
            'chapterContents',
            'highlights',
            'replaceRules',
            'desktopSettings',
            'localBookFiles',
        ],
        counts: countSnapshot(snapshot),
        checksums,
    };
    zip.file(TAURI_MANIFEST_FILE, jsonBytes(manifest));
    return {
        bytes: await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }),
        manifest,
        positionFallbacks: converted.positionFallbacks,
    };
}
async function readZipText(zip, name) {
    return zip.file(name)?.async('string');
}
async function parseAndroidData(zip) {
    const data = {
        bookSources: parseJsonArray(await readZipText(zip, 'bookSource.json'), 'bookSource.json'),
        books: parseJsonArray(await readZipText(zip, 'bookshelf.json'), 'bookshelf.json'),
        bookmarks: parseJsonArray(await readZipText(zip, 'bookmark.json'), 'bookmark.json'),
        readingRecords: parseJsonArray(await readZipText(zip, 'readRecord.json'), 'readRecord.json'),
        highlights: parseJsonArray(await readZipText(zip, 'highlight.json'), 'highlight.json'),
        replaceRules: parseJsonArray(await readZipText(zip, 'replaceRule.json'), 'replaceRule.json'),
    };
    for (const [index, source] of data.bookSources.entries()) {
        if (!source || typeof source !== 'object' || typeof source.bookSourceUrl !== 'string') {
            throw new Error(`bookSource.json 第 ${index + 1} 条缺少 bookSourceUrl`);
        }
    }
    for (const [index, book] of data.books.entries()) {
        if (!book ||
            typeof book !== 'object' ||
            typeof book.bookUrl !== 'string' ||
            typeof book.origin !== 'string' ||
            typeof book.name !== 'string') {
            throw new Error(`bookshelf.json 第 ${index + 1} 条书籍结构无效`);
        }
    }
    for (const [index, bookmark] of data.bookmarks.entries()) {
        if (!bookmark || typeof bookmark !== 'object' || !Number.isFinite(bookmark.time) || typeof bookmark.bookName !== 'string') {
            throw new Error(`bookmark.json 第 ${index + 1} 条书签结构无效`);
        }
    }
    for (const [index, record] of data.readingRecords.entries()) {
        if (!record || typeof record !== 'object' || typeof record.deviceId !== 'string' || typeof record.bookName !== 'string') {
            throw new Error(`readRecord.json 第 ${index + 1} 条阅读记录结构无效`);
        }
    }
    for (const [index, highlight] of data.highlights.entries()) {
        if (!highlight || typeof highlight !== 'object' || !Number.isFinite(highlight.time) || typeof highlight.bookName !== 'string') {
            throw new Error(`highlight.json 第 ${index + 1} 条标注结构无效`);
        }
    }
    for (const [index, rule] of data.replaceRules.entries()) {
        if (!rule || typeof rule !== 'object' || !Number.isFinite(rule.id) || typeof rule.pattern !== 'string') {
            throw new Error(`replaceRule.json 第 ${index + 1} 条替换规则结构无效`);
        }
    }
    return data;
}
function validateTauriData(data) {
    if (data.version !== 1 || !data.database || typeof data.database !== 'object') {
        throw new Error('Tauri 数据快照版本无效');
    }
    for (const storeName of DATABASE_STORE_NAMES) {
        const records = data.database[storeName];
        if (records !== undefined && !Array.isArray(records)) {
            throw new Error(`Tauri 数据快照中的 ${storeName} 不是数组`);
        }
    }
    for (const [index, book] of (data.database.books || []).entries()) {
        if (!book || typeof book !== 'object' || !book.meta || !Array.isArray(book.chapters)) {
            throw new Error(`Tauri 数据快照第 ${index + 1} 本书结构无效`);
        }
    }
    if (!data.localStorage || typeof data.localStorage !== 'object' || Array.isArray(data.localStorage)) {
        throw new Error('Tauri localStorage 快照结构无效');
    }
    for (const [key, value] of Object.entries(data.localStorage)) {
        if (value !== null && typeof value !== 'string') {
            throw new Error(`Tauri localStorage 项 ${key} 不是字符串或 null`);
        }
    }
}
function androidCounts(data) {
    return {
        bookSources: data.bookSources.length,
        onlineBooks: data.books.filter(book => String(book.origin || '').toUpperCase() !== 'LOCAL').length,
        localBooks: data.books.filter(book => String(book.origin || '').toUpperCase() === 'LOCAL').length,
        bookmarks: data.bookmarks.length,
        readingRecords: data.readingRecords.length,
        chapterContents: 0,
        highlights: data.highlights.length,
        replaceRules: data.replaceRules.length,
    };
}
export async function parseBackupArchive(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    inspectZipCentralDirectory(bytes);
    let zip;
    try {
        zip = await JSZip.loadAsync(bytes, { createFolders: false, checkCRC32: true });
    }
    catch (error) {
        throw new Error(`无法读取 ZIP 备份：${error instanceof Error ? error.message : String(error)}`);
    }
    const androidData = await parseAndroidData(zip);
    const manifestRaw = await readZipText(zip, TAURI_MANIFEST_FILE);
    const warnings = [];
    let manifest;
    let tauriData;
    let kind = 'android';
    const localBookFiles = new Map();
    if (manifestRaw) {
        let candidate;
        try {
            candidate = JSON.parse(manifestRaw);
        }
        catch {
            throw new Error(`${TAURI_MANIFEST_FILE} 不是有效 JSON`);
        }
        if (!candidate || typeof candidate !== 'object')
            throw new Error('Tauri 备份清单无效');
        const rawManifest = candidate;
        if (rawManifest.format !== BACKUP_FORMAT || !Number.isInteger(rawManifest.version)) {
            throw new Error('Tauri 备份清单格式无效');
        }
        if ((rawManifest.version || 0) > BACKUP_FORMAT_VERSION) {
            kind = 'newer-tauri';
            warnings.push(`备份格式版本 ${rawManifest.version} 高于当前支持的 ${BACKUP_FORMAT_VERSION}，仅可恢复安卓共同数据。`);
        }
        else if (rawManifest.version === 1) {
            manifest = rawManifest;
            kind = 'tauri';
            for (const [path, expected] of Object.entries(manifest.checksums || {})) {
                validateArchivePath(path);
                const file = zip.file(path);
                if (!file)
                    throw new Error(`备份缺少校验文件：${path}`);
                const actual = await sha256(await file.async('uint8array'));
                if (actual !== expected)
                    throw new Error(`备份校验失败：${path}`);
            }
            const tauriDataRaw = await readZipText(zip, TAURI_DATA_FILE);
            if (!tauriDataRaw)
                throw new Error(`备份缺少 ${TAURI_DATA_FILE}`);
            try {
                tauriData = JSON.parse(tauriDataRaw);
            }
            catch {
                throw new Error(`${TAURI_DATA_FILE} 不是有效 JSON`);
            }
            validateTauriData(tauriData);
            const requiredChecksums = [...ANDROID_BACKUP_FILES, TAURI_DATA_FILE];
            for (const path of requiredChecksums) {
                if (!manifest.checksums?.[path])
                    throw new Error(`备份清单缺少校验值：${path}`);
            }
            for (const book of tauriData.database.books || []) {
                if (!book.fileEntry)
                    continue;
                validateArchivePath(book.fileEntry);
                if (!book.fileEntry.startsWith('tauri/books/'))
                    throw new Error('本地书籍条目路径无效');
                if (!manifest.checksums?.[book.fileEntry]) {
                    throw new Error(`备份清单缺少本地书籍校验值：${book.fileEntry}`);
                }
                const file = zip.file(book.fileEntry);
                if (!file)
                    throw new Error(`备份缺少本地书籍文件：${book.fileEntry}`);
                localBookFiles.set(book.fileEntry, await file.async('arraybuffer'));
            }
        }
    }
    const preview = {
        kind,
        version: manifest?.version || (manifestRaw ? Number(JSON.parse(manifestRaw).version) : undefined),
        appVersion: manifest?.appVersion,
        createdAt: manifest?.createdAt,
        counts: manifest?.counts
            ? Object.assign({ highlights: 0, replaceRules: 0 }, manifest.counts)
            : androidCounts(androidData),
        warnings,
        canRestoreTauriData: kind === 'tauri',
        androidData,
    };
    return { preview, tauriData, localBookFiles };
}
function mergeByKey(current, incoming, getKey) {
    const result = new Map();
    for (const item of current)
        result.set(getKey(item), item);
    for (const item of incoming)
        result.set(getKey(item), item);
    return [...result.values()];
}
function mergeSnapshots(current, incoming) {
    const keys = {
        books: record => record.meta?.format === 'online'
            ? `online:${record.meta?.bookUrl || record.meta?.id}`
            : `local:${record.meta?.id}`,
        settings: record => String(record.key),
        bookSources: record => String(record.bookSourceUrl),
        remoteBooks: record => String(record.id),
        chapterContents: record => String(record.key),
        bookmarks: record => `${record.createdAt}:${record.bookName}:${record.bookAuthor}`,
        readingRecords: record => String(record.bookId),
        highlights: record => String(record.id),
        replaceRules: record => String(record.id),
    };
    const merged = Object.fromEntries(DATABASE_STORE_NAMES.map(storeName => [
        storeName,
        mergeByKey(current[storeName] || [], incoming[storeName] || [], keys[storeName]),
    ]));
    const readingRecords = new Map(storeRecords(current, 'readingRecords').map(record => [
        record.bookId,
        normalizeReadingRecord(record),
    ]));
    for (const incomingRecord of storeRecords(incoming, 'readingRecords')) {
        const normalizedIncoming = normalizeReadingRecord(incomingRecord);
        const existing = readingRecords.get(incomingRecord.bookId);
        const devices = { ...(existing?.devices || {}), ...(normalizedIncoming.devices || {}) };
        const aggregate = aggregateReadingDevices(devices);
        readingRecords.set(incomingRecord.bookId, {
            ...existing,
            ...normalizedIncoming,
            readTime: aggregate.readTime,
            lastRead: aggregate.lastRead,
            devices,
        });
    }
    merged.readingRecords = [...readingRecords.values()];
    return merged;
}
function hydrateTauriSnapshot(parsed) {
    if (!parsed.tauriData)
        throw new Error('该备份不包含可恢复的 Tauri 快照');
    const database = JSON.parse(JSON.stringify(parsed.tauriData.database));
    database.books = (parsed.tauriData.database.books || []).map(book => {
        const { fileEntry, ...stored } = book;
        return {
            ...stored,
            fileData: fileEntry ? parsed.localBookFiles.get(fileEntry) || null : null,
        };
    });
    database.bookmarks = storeRecords(database, 'bookmarks').map(bookmark => ({
        ...bookmark,
        startOffset: Math.max(0, bookmark.startOffset || 0),
        endOffset: Math.max(bookmark.startOffset || 0, bookmark.endOffset || bookmark.startOffset || 0),
    }));
    return database;
}
function buildAndroidSnapshot(data, current, mode) {
    const currentBooks = storeRecords(current, 'books');
    const localBooks = currentBooks.filter(book => book.meta?.format !== 'online');
    const onlineByUrl = new Map(currentBooks
        .filter(book => book.meta?.format === 'online' && book.meta.bookUrl)
        .map(book => [book.meta.bookUrl, book]));
    const importedBooks = data.books
        .map(book => fromAndroidBook(book, onlineByUrl.get(book.bookUrl)))
        .filter((book) => Boolean(book));
    const finalBooks = mode === 'merge'
        ? mergeByKey(currentBooks, importedBooks, book => book.meta.format === 'online' ? `online:${book.meta.bookUrl || book.meta.id}` : `local:${book.meta.id}`)
        : [...localBooks, ...importedBooks];
    const currentContents = storeRecords(current, 'chapterContents');
    const currentBookmarks = storeRecords(current, 'bookmarks');
    const importedBookmarks = data.bookmarks
        .map(bookmark => fromAndroidBookmark(bookmark, finalBooks, currentContents))
        .filter((bookmark) => Boolean(bookmark));
    const preservedBookmarks = mode === 'overwrite'
        ? currentBookmarks.filter(bookmark => localBooks.some(book => book.meta.id === bookmark.bookId))
        : currentBookmarks;
    const bookmarks = mergeByKey(preservedBookmarks, importedBookmarks, bookmark => `${bookmark.createdAt}:${bookmark.bookName}:${bookmark.bookAuthor}`);
    const currentRecords = storeRecords(current, 'readingRecords');
    const baseRecords = mode === 'overwrite'
        ? currentRecords.filter(record => localBooks.some(book => book.meta.id === record.bookId))
        : currentRecords;
    const readingRecords = fromAndroidReadRecords(data.readingRecords, finalBooks, baseRecords);
    const bookSources = mode === 'merge'
        ? mergeByKey(storeRecords(current, 'bookSources'), data.bookSources, source => String(source.bookSourceUrl || ''))
        : data.bookSources;
    const currentHighlights = storeRecords(current, 'highlights');
    const convertedHighlights = data.highlights.map(item => fromAndroidHighlight(item, finalBooks, currentContents));
    const importedHighlights = convertedHighlights.filter((item) => Boolean(item));
    const preservedHighlights = mode === 'overwrite'
        ? currentHighlights.filter(highlight => localBooks.some(book => book.meta.id === highlight.bookId))
        : currentHighlights;
    const highlights = mergeByKey(preservedHighlights, importedHighlights, item => item.id);
    const currentReplaceRules = storeRecords(current, 'replaceRules');
    const replaceRules = mode === 'merge'
        ? mergeByKey(currentReplaceRules, data.replaceRules, rule => String(rule.id))
        : data.replaceRules;
    return {
        snapshot: {
            books: finalBooks,
            bookmarks,
            readingRecords,
            bookSources,
            highlights,
            replaceRules,
        },
        clearStores: [
            'books',
            'bookmarks',
            'readingRecords',
            'bookSources',
            'highlights',
            'replaceRules',
        ],
        skippedLocal: data.books.length - importedBooks.length,
        skippedHighlights: data.highlights.length - importedHighlights.length,
    };
}
function captureLocalStorage() {
    return Object.fromEntries(BACKED_UP_LOCAL_STORAGE_KEYS.map(key => [key, localStorage.getItem(key)]));
}
function applyLocalStorage(values) {
    for (const key of BACKED_UP_LOCAL_STORAGE_KEYS) {
        if (!(key in values))
            continue;
        const value = values[key];
        if (value === null || value === undefined)
            localStorage.removeItem(key);
        else
            localStorage.setItem(key, value);
    }
}
export async function restoreParsedBackup(parsed, mode) {
    const originalDatabase = await exportDatabaseSnapshot();
    const originalLocalStorage = captureLocalStorage();
    let target;
    let clearStores;
    let skippedLocalAndroidBooks = 0;
    let skippedAndroidHighlights = 0;
    let targetLocalStorage;
    if (parsed.preview.canRestoreTauriData && parsed.tauriData) {
        const restored = hydrateTauriSnapshot(parsed);
        target = mode === 'merge' ? mergeSnapshots(originalDatabase, restored) : restored;
        clearStores = [...DATABASE_STORE_NAMES];
        targetLocalStorage = parsed.tauriData.localStorage;
    }
    else {
        const android = buildAndroidSnapshot(parsed.preview.androidData, originalDatabase, mode);
        target = android.snapshot;
        clearStores = android.clearStores;
        skippedLocalAndroidBooks = android.skippedLocal;
        skippedAndroidHighlights = android.skippedHighlights;
    }
    try {
        await importDatabaseSnapshot(target, clearStores);
        if (targetLocalStorage)
            applyLocalStorage(targetLocalStorage);
    }
    catch (error) {
        try {
            await importDatabaseSnapshot(originalDatabase, clearStores);
            applyLocalStorage(originalLocalStorage);
        }
        catch (rollbackError) {
            console.error('恢复失败后的回滚也失败', rollbackError);
        }
        throw error;
    }
    return {
        mode,
        restored: parsed.preview.counts,
        skippedLocalAndroidBooks,
        positionFallbacks: 0,
        warnings: [
            ...parsed.preview.warnings,
            ...(skippedLocalAndroidBooks > 0
                ? [`安卓备份中的 ${skippedLocalAndroidBooks} 本本地书籍没有可移植正文，已跳过。`]
                : []),
            ...(skippedAndroidHighlights > 0
                ? [`安卓备份中的 ${skippedAndroidHighlights} 条标注无法匹配书籍，已跳过。`]
                : []),
        ],
    };
}
