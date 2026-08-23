import { DEFAULT_READ_SETTINGS } from '@/parsers/types';
const DB_NAME = 'legado-web-reader';
const DB_VERSION = 3;
const STORE_BOOKS = 'books';
const STORE_SETTINGS = 'settings';
const STORE_BOOK_SOURCES = 'bookSources';
const STORE_REMOTE_BOOKS = 'remoteBooks';
const STORE_CHAPTER_CONTENTS = 'chapterContents';
let cachedDb = null;
function openDB() {
    if (cachedDb) {
        try {
            // 检查连接是否可用
            cachedDb.transaction(STORE_SETTINGS, 'readonly');
            return Promise.resolve(cachedDb);
        }
        catch {
            // 连接已失效，重置并重新建立
            cachedDb = null;
        }
    }
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = request.result;
            const oldVersion = event.oldVersion;
            // v0 -> v1: 原有 Store
            if (oldVersion < 1) {
                if (!db.objectStoreNames.contains(STORE_BOOKS)) {
                    db.createObjectStore(STORE_BOOKS, { keyPath: 'meta.id' });
                }
                if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
                    db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
                }
            }
            // v1 -> v2: 新增书源和远程书籍 Store（Desktop 模式使用）
            if (oldVersion < 2) {
                if (!db.objectStoreNames.contains(STORE_BOOK_SOURCES)) {
                    db.createObjectStore(STORE_BOOK_SOURCES, { keyPath: 'bookSourceUrl' });
                }
                if (!db.objectStoreNames.contains(STORE_REMOTE_BOOKS)) {
                    db.createObjectStore(STORE_REMOTE_BOOKS, { keyPath: 'id' });
                }
            }
            // v2 -> v3: 网络书籍章节正文离线缓存
            if (oldVersion < 3 && !db.objectStoreNames.contains(STORE_CHAPTER_CONTENTS)) {
                const store = db.createObjectStore(STORE_CHAPTER_CONTENTS, { keyPath: 'key' });
                store.createIndex('bookId', 'bookId', { unique: false });
            }
        };
        request.onsuccess = () => {
            const db = request.result;
            cachedDb = db;
            db.onversionchange = () => {
                db.close();
                cachedDb = null;
            };
            db.onclose = () => {
                cachedDb = null;
            };
            db.onerror = () => {
                cachedDb = null;
            };
            resolve(db);
        };
        request.onerror = () => {
            cachedDb = null;
            reject(request.error);
        };
    });
}
// --- Book Storage ---
export async function saveBook(book) {
    const db = await openDB();
    const plainRecord = {
        meta: JSON.parse(JSON.stringify(book.meta)),
        chapters: JSON.parse(JSON.stringify(book.chapters)),
        fileData: book.fileData ?? null,
    };
    return new Promise((resolve, reject) => {
        try {
            const tx = db.transaction(STORE_BOOKS, 'readwrite');
            tx.objectStore(STORE_BOOKS).put(plainRecord);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        }
        catch (err) {
            cachedDb = null;
            reject(err);
        }
    });
}
export async function getBook(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        try {
            const tx = db.transaction(STORE_BOOKS, 'readonly');
            const request = tx.objectStore(STORE_BOOKS).get(id);
            request.onsuccess = () => resolve(request.result ?? undefined);
            request.onerror = () => reject(request.error);
        }
        catch (err) {
            cachedDb = null;
            reject(err);
        }
    });
}
export async function getAllBookMetas() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        try {
            const tx = db.transaction(STORE_BOOKS, 'readonly');
            const request = tx.objectStore(STORE_BOOKS).getAll();
            request.onsuccess = () => {
                const books = (request.result || []);
                resolve(books.map(b => b.meta).filter(Boolean));
            };
            request.onerror = () => reject(request.error);
        }
        catch (err) {
            cachedDb = null;
            reject(err);
        }
    });
}
export async function updateBookMeta(id, updates) {
    const book = await getBook(id);
    if (!book)
        return;
    book.meta = { ...book.meta, ...updates };
    await saveBook(book);
}
export async function deleteBookFromDB(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        try {
            const tx = db.transaction([STORE_BOOKS, STORE_CHAPTER_CONTENTS], 'readwrite');
            tx.objectStore(STORE_BOOKS).delete(id);
            const chapterStore = tx.objectStore(STORE_CHAPTER_CONTENTS);
            const chapterKeys = chapterStore.index('bookId').getAllKeys(id);
            chapterKeys.onsuccess = () => {
                chapterKeys.result.forEach(key => chapterStore.delete(key));
            };
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        }
        catch (err) {
            cachedDb = null;
            reject(err);
        }
    });
}
// --- Online Chapter Content Storage ---
function chapterContentKey(bookId, chapterIndex) {
    return `${bookId}:${chapterIndex}`;
}
export async function saveChapterContent(content) {
    const db = await openDB();
    const record = {
        ...JSON.parse(JSON.stringify(content)),
        key: chapterContentKey(content.bookId, content.chapterIndex),
        downloadedAt: Date.now(),
    };
    return new Promise((resolve, reject) => {
        try {
            const tx = db.transaction(STORE_CHAPTER_CONTENTS, 'readwrite');
            tx.objectStore(STORE_CHAPTER_CONTENTS).put(record);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        }
        catch (err) {
            cachedDb = null;
            reject(err);
        }
    });
}
export async function getChapterContent(bookId, chapterIndex, sourceUrl, chapterUrl) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        try {
            const tx = db.transaction(STORE_CHAPTER_CONTENTS, 'readonly');
            const request = tx.objectStore(STORE_CHAPTER_CONTENTS).get(chapterContentKey(bookId, chapterIndex));
            request.onsuccess = () => {
                const record = request.result;
                if (!record)
                    return resolve(undefined);
                if (sourceUrl && record.sourceUrl && record.sourceUrl !== sourceUrl) {
                    return resolve(undefined);
                }
                if (chapterUrl && record.chapterUrl && record.chapterUrl !== chapterUrl) {
                    return resolve(undefined);
                }
                resolve(record);
            };
            request.onerror = () => reject(request.error);
        }
        catch (err) {
            cachedDb = null;
            reject(err);
        }
    });
}
export async function getBookChapterContents(bookId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        try {
            const tx = db.transaction(STORE_CHAPTER_CONTENTS, 'readonly');
            const request = tx.objectStore(STORE_CHAPTER_CONTENTS).index('bookId').getAll(bookId);
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        }
        catch (err) {
            cachedDb = null;
            reject(err);
        }
    });
}
// --- Settings Storage ---
export async function saveSettings(settings) {
    const db = await openDB();
    const plainRecord = {
        key: 'readSettings',
        ...JSON.parse(JSON.stringify(settings)),
    };
    return new Promise((resolve, reject) => {
        try {
            const tx = db.transaction(STORE_SETTINGS, 'readwrite');
            tx.objectStore(STORE_SETTINGS).put(plainRecord);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        }
        catch (err) {
            cachedDb = null;
            reject(err);
        }
    });
}
export async function loadSettings() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        try {
            const tx = db.transaction(STORE_SETTINGS, 'readonly');
            const request = tx.objectStore(STORE_SETTINGS).get('readSettings');
            request.onsuccess = () => {
                if (request.result) {
                    const { key, ...settings } = request.result;
                    resolve({
                        ...DEFAULT_READ_SETTINGS,
                        ...settings,
                        spacing: {
                            ...DEFAULT_READ_SETTINGS.spacing,
                            ...(settings.spacing || {}),
                        },
                    });
                }
                else {
                    resolve({ ...DEFAULT_READ_SETTINGS });
                }
            };
            request.onerror = () => reject(request.error);
        }
        catch (err) {
            cachedDb = null;
            reject(err);
        }
    });
}
// --- Book Source Storage (Desktop) ---
export async function saveBookSource(source) {
    const db = await openDB();
    const plainSource = JSON.parse(JSON.stringify(source));
    return new Promise((resolve, reject) => {
        try {
            const tx = db.transaction(STORE_BOOK_SOURCES, 'readwrite');
            tx.objectStore(STORE_BOOK_SOURCES).put(plainSource);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        }
        catch (err) {
            cachedDb = null;
            reject(err);
        }
    });
}
export async function getAllBookSources() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        try {
            const tx = db.transaction(STORE_BOOK_SOURCES, 'readonly');
            const request = tx.objectStore(STORE_BOOK_SOURCES).getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        }
        catch (err) {
            cachedDb = null;
            reject(err);
        }
    });
}
export async function deleteBookSource(bookSourceUrl) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        try {
            const tx = db.transaction(STORE_BOOK_SOURCES, 'readwrite');
            tx.objectStore(STORE_BOOK_SOURCES).delete(bookSourceUrl);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        }
        catch (err) {
            cachedDb = null;
            reject(err);
        }
    });
}
export async function importBookSources(sources) {
    const db = await openDB();
    const plainSources = JSON.parse(JSON.stringify(sources));
    return new Promise((resolve, reject) => {
        try {
            const tx = db.transaction(STORE_BOOK_SOURCES, 'readwrite');
            const store = tx.objectStore(STORE_BOOK_SOURCES);
            const uniqueUrls = new Set();
            for (const source of plainSources) {
                store.put(source);
                if (source.bookSourceUrl) {
                    uniqueUrls.add(String(source.bookSourceUrl));
                }
            }
            tx.oncomplete = () => resolve(uniqueUrls.size);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        }
        catch (err) {
            cachedDb = null;
            reject(err);
        }
    });
}
