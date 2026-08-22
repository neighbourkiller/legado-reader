import { DEFAULT_READ_SETTINGS } from '@/parsers/types';
const DB_NAME = 'legado-web-reader';
const DB_VERSION = 1;
const STORE_BOOKS = 'books';
const STORE_SETTINGS = 'settings';
let dbPromise = null;
function openDB() {
    if (dbPromise)
        return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_BOOKS)) {
                db.createObjectStore(STORE_BOOKS, { keyPath: 'meta.id' });
            }
            if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
                db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
            dbPromise = null;
            reject(request.error);
        };
    });
    return dbPromise;
}
// --- Book Storage ---
export async function saveBook(book) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_BOOKS, 'readwrite');
        tx.objectStore(STORE_BOOKS).put(book);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}
export async function getBook(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_BOOKS, 'readonly');
        const request = tx.objectStore(STORE_BOOKS).get(id);
        request.onsuccess = () => resolve(request.result ?? undefined);
        request.onerror = () => reject(request.error);
    });
}
export async function getAllBookMetas() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_BOOKS, 'readonly');
        const request = tx.objectStore(STORE_BOOKS).getAll();
        request.onsuccess = () => {
            const books = request.result;
            resolve(books.map(b => b.meta));
        };
        request.onerror = () => reject(request.error);
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
        const tx = db.transaction(STORE_BOOKS, 'readwrite');
        tx.objectStore(STORE_BOOKS).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}
// --- Settings Storage ---
export async function saveSettings(settings) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_SETTINGS, 'readwrite');
        tx.objectStore(STORE_SETTINGS).put({ key: 'readSettings', ...settings });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}
export async function loadSettings() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_SETTINGS, 'readonly');
        const request = tx.objectStore(STORE_SETTINGS).get('readSettings');
        request.onsuccess = () => {
            if (request.result) {
                const { key, ...settings } = request.result;
                resolve({ ...DEFAULT_READ_SETTINGS, ...settings });
            }
            else {
                resolve({ ...DEFAULT_READ_SETTINGS });
            }
        };
        request.onerror = () => reject(request.error);
    });
}
