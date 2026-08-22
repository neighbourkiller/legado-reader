import { defineStore } from 'pinia';
import { ref } from 'vue';
import { parseBook } from '@/parsers';
import { saveBook, getAllBookMetas, deleteBookFromDB, updateBookMeta, } from '@/storage/db';
export const useBookshelfStore = defineStore('bookshelf', () => {
    const books = ref([]);
    const isLoading = ref(false);
    async function loadBooks() {
        isLoading.value = true;
        try {
            books.value = await getAllBookMetas();
            // Sort by last read time, most recent first
            books.value.sort((a, b) => b.lastReadTime - a.lastReadTime);
        }
        finally {
            isLoading.value = false;
        }
    }
    async function parseAndImportBook(file) {
        const parsed = await parseBook(file);
        const fileData = await file.arrayBuffer();
        const storedBook = {
            meta: parsed.meta,
            chapters: parsed.chapters,
            fileData,
        };
        await saveBook(storedBook);
        await loadBooks();
        return parsed.meta.id;
    }
    async function updateBook(id, updates) {
        await updateBookMeta(id, updates);
        const idx = books.value.findIndex(b => b.id === id);
        if (idx !== -1) {
            books.value[idx] = { ...books.value[idx], ...updates };
        }
    }
    async function deleteBook(id) {
        await deleteBookFromDB(id);
        books.value = books.value.filter(b => b.id !== id);
    }
    return {
        books,
        isLoading,
        loadBooks,
        parseAndImportBook,
        updateBook,
        deleteBook,
    };
});
