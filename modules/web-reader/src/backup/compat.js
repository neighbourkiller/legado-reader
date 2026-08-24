import { generateBookId } from '@/source/engine/RuleParser';
import { aggregateReadingDevices, normalizeReadingRecord } from '@/storage/db';
const ANDROID_LOCAL_ORIGIN = 'LOCAL';
function asText(value) {
    return typeof value === 'string' ? value : '';
}
function clampInteger(value, minimum = 0) {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed))
        return minimum;
    return Math.max(minimum, Math.trunc(parsed));
}
function normalizeParagraphs(content) {
    return content
        .split(/\n+/)
        .map(item => item.trim())
        .filter(Boolean);
}
export function paragraphIndexToCharacterOffset(content, paragraphIndex) {
    const paragraphs = normalizeParagraphs(content);
    const target = Math.min(clampInteger(paragraphIndex), paragraphs.length);
    let offset = 0;
    for (let index = 0; index < target; index += 1) {
        offset += (paragraphs[index]?.length || 0) + 1;
    }
    return offset;
}
export function characterOffsetToParagraphIndex(content, characterOffset, anchor = '') {
    const paragraphs = normalizeParagraphs(content);
    if (paragraphs.length === 0)
        return 0;
    const trimmedAnchor = anchor.trim();
    if (trimmedAnchor) {
        const exact = paragraphs.findIndex(item => item.includes(trimmedAnchor));
        if (exact >= 0)
            return exact;
        const shortAnchor = trimmedAnchor.slice(0, 24);
        if (shortAnchor) {
            const partial = paragraphs.findIndex(item => item.includes(shortAnchor));
            if (partial >= 0)
                return partial;
        }
    }
    let offset = 0;
    for (let index = 0; index < paragraphs.length; index += 1) {
        const nextOffset = offset + (paragraphs[index]?.length || 0) + 1;
        if (characterOffset < nextOffset)
            return index;
        offset = nextOffset;
    }
    return paragraphs.length - 1;
}
function chapterContentFor(bookId, chapterIndex, contents) {
    return contents.find(item => item.bookId === bookId && item.chapterIndex === chapterIndex)?.content;
}
function contentWithoutRepeatedTitle(record) {
    if (!record)
        return undefined;
    const paragraphs = normalizeParagraphs(record.content);
    if (paragraphs[0] &&
        (paragraphs[0] === record.title.trim() ||
            paragraphs[0].replace(/\s+/g, '') === record.title.replace(/\s+/g, ''))) {
        paragraphs.shift();
    }
    return paragraphs.join('\n');
}
export function toAndroidBook(stored, chapterContents) {
    const meta = stored.meta;
    if (meta.format !== 'online' || !meta.bookUrl || !meta.sourceUrl)
        return null;
    const chapterRecord = chapterContents.find(item => item.bookId === meta.id && item.chapterIndex === meta.currentChapter);
    const chapterContent = contentWithoutRepeatedTitle(chapterRecord);
    const hasParagraphPosition = Number.isInteger(meta.currentChapterPos);
    const chapterPosition = chapterContent && hasParagraphPosition
        ? paragraphIndexToCharacterOffset(chapterContent, meta.currentChapterPos || 0)
        : 0;
    return {
        positionFallback: hasParagraphPosition && !chapterContent,
        book: {
            bookUrl: meta.bookUrl,
            tocUrl: meta.tocUrl || meta.bookUrl,
            origin: meta.sourceUrl,
            originName: meta.sourceName || '',
            name: meta.name,
            author: meta.author,
            kind: meta.kind || null,
            coverUrl: meta.coverUrl || null,
            intro: meta.intro || null,
            type: 0,
            latestChapterTitle: meta.latestChapterTitle || null,
            latestChapterTime: meta.lastReadTime || Date.now(),
            lastCheckTime: meta.lastReadTime || Date.now(),
            totalChapterNum: meta.totalChapters,
            durChapterTitle: meta.durChapterTitle || stored.chapters[meta.currentChapter]?.title || null,
            durChapterIndex: clampInteger(meta.currentChapter),
            durChapterPos: chapterPosition,
            durChapterTime: meta.lastReadTime || Date.now(),
            canUpdate: true,
            order: 0,
            originOrder: 0,
            syncTime: 0,
        },
    };
}
export function fromAndroidBook(book, existing) {
    const bookUrl = asText(book.bookUrl).trim();
    const origin = asText(book.origin).trim();
    const name = asText(book.name).trim();
    if (!bookUrl || !origin || !name || origin.toUpperCase() === ANDROID_LOCAL_ORIGIN)
        return null;
    const author = asText(book.author);
    const id = existing?.meta.id || generateBookId(name, author, origin);
    const currentChapter = clampInteger(book.durChapterIndex);
    const totalChapters = clampInteger(book.totalChapterNum);
    const existingChapters = existing?.chapters || [];
    return {
        meta: {
            ...(existing?.meta || {}),
            id,
            name,
            author,
            format: 'online',
            totalChapters: Math.max(totalChapters, existingChapters.length),
            currentChapter,
            currentProgress: totalChapters > 0
                ? Math.round(((currentChapter + 1) / totalChapters) * 100)
                : 0,
            currentChapterPos: undefined,
            legacyChapterCharPos: clampInteger(book.durChapterPos),
            lastReadTime: clampInteger(book.durChapterTime) || Date.now(),
            coverUrl: asText(book.coverUrl) || undefined,
            durChapterTitle: asText(book.durChapterTitle) || undefined,
            latestChapterTitle: asText(book.latestChapterTitle) || undefined,
            sourceUrl: origin,
            sourceName: asText(book.originName) || undefined,
            bookUrl,
            tocUrl: asText(book.tocUrl) || bookUrl,
            intro: asText(book.intro) || undefined,
            kind: asText(book.kind) || undefined,
        },
        chapters: existingChapters,
        fileData: existing?.fileData || null,
    };
}
export function toAndroidBookmark(bookmark, chapterContents) {
    const chapterRecord = chapterContents.find(item => item.bookId === bookmark.bookId && item.chapterIndex === bookmark.chapterIndex);
    const chapterContent = contentWithoutRepeatedTitle(chapterRecord);
    const anchoredPosition = chapterContent && bookmark.content
        ? chapterContent.indexOf(bookmark.content.trim())
        : -1;
    const chapterPos = chapterContent
        ? anchoredPosition >= 0
            ? anchoredPosition
            : paragraphIndexToCharacterOffset(chapterContent, bookmark.chapterPos)
        : bookmark.androidChapterPos || 0;
    return {
        time: bookmark.createdAt,
        bookName: bookmark.bookName,
        bookAuthor: bookmark.bookAuthor,
        chapterIndex: bookmark.chapterIndex,
        chapterPos,
        chapterName: bookmark.chapterTitle,
        bookText: bookmark.content,
        content: bookmark.note || '',
    };
}
export function fromAndroidBookmark(bookmark, books, chapterContents) {
    const book = books.find(item => item.meta.name === bookmark.bookName &&
        (!bookmark.bookAuthor || item.meta.author === bookmark.bookAuthor));
    if (!book)
        return null;
    const chapterIndex = clampInteger(bookmark.chapterIndex);
    const chapterContent = chapterContentFor(book.meta.id, chapterIndex, chapterContents);
    const chapterPos = chapterContent
        ? characterOffsetToParagraphIndex(chapterContent, bookmark.chapterPos, bookmark.bookText)
        : 0;
    return {
        id: `android-${clampInteger(bookmark.time)}-${book.meta.id}`,
        bookId: book.meta.id,
        bookName: bookmark.bookName,
        bookAuthor: bookmark.bookAuthor || '',
        chapterIndex,
        chapterPos,
        chapterTitle: bookmark.chapterName || '',
        content: bookmark.bookText || '',
        note: bookmark.content || undefined,
        androidChapterPos: clampInteger(bookmark.chapterPos),
        createdAt: clampInteger(bookmark.time) || Date.now(),
    };
}
export function toAndroidReadRecords(records) {
    const grouped = new Map();
    for (const rawRecord of records) {
        const record = normalizeReadingRecord(rawRecord);
        for (const [deviceId, contribution] of Object.entries(record.devices || {})) {
            const key = `${deviceId}\u0000${record.bookName}`;
            const current = grouped.get(key) || {
                deviceId,
                bookName: record.bookName,
                readTime: 0,
                lastRead: 0,
                authors: new Set(),
            };
            current.readTime += Math.max(0, contribution.readTime || 0);
            current.lastRead = Math.max(current.lastRead, contribution.lastRead || 0);
            const author = contribution.author || record.bookAuthor;
            if (author)
                current.authors.add(author);
            grouped.set(key, current);
        }
    }
    return [...grouped.values()].map(({ authors, ...record }) => ({
        ...record,
        author: authors.size <= 1
            ? [...authors][0] || ''
            : `\u001Eauthors:${JSON.stringify([...authors].sort())}`,
    }));
}
export function fromAndroidReadRecords(androidRecords, books, existingRecords = []) {
    const records = new Map(existingRecords.map(item => [item.bookId, normalizeReadingRecord(item)]));
    for (const item of androidRecords) {
        const acceptedAuthors = decodeAndroidAuthors(item.author || '');
        const book = books.find(candidate => candidate.meta.name === item.bookName &&
            (acceptedAuthors.size === 0 || acceptedAuthors.has(candidate.meta.author)));
        if (!book || !item.deviceId)
            continue;
        const current = records.get(book.meta.id);
        const devices = {
            ...(current?.devices || {}),
            [item.deviceId]: {
                readTime: Math.max(0, clampInteger(item.readTime)),
                lastRead: Math.max(0, clampInteger(item.lastRead)),
                author: item.author || book.meta.author,
            },
        };
        const aggregate = aggregateReadingDevices(devices);
        records.set(book.meta.id, {
            bookId: book.meta.id,
            bookName: book.meta.name,
            bookAuthor: book.meta.author,
            readTime: aggregate.readTime,
            lastRead: aggregate.lastRead,
            devices,
        });
    }
    return [...records.values()];
}
function decodeAndroidAuthors(author) {
    const prefix = '\u001Eauthors:';
    if (!author)
        return new Set();
    if (!author.startsWith(prefix))
        return new Set([author]);
    try {
        const parsed = JSON.parse(author.slice(prefix.length));
        return new Set(Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : []);
    }
    catch {
        return new Set();
    }
}
export function createAndroidBackupData(context) {
    const onlineBooks = [];
    let positionFallbacks = 0;
    for (const stored of context.books) {
        const converted = toAndroidBook(stored, context.chapterContents);
        if (!converted)
            continue;
        onlineBooks.push(converted.book);
        if (converted.positionFallback)
            positionFallbacks += 1;
    }
    const onlineBookIds = new Set(context.books.filter(book => book.meta.format === 'online').map(book => book.meta.id));
    return {
        positionFallbacks,
        data: {
            bookSources: [],
            books: onlineBooks,
            bookmarks: context.bookmarks
                .filter(bookmark => onlineBookIds.has(bookmark.bookId))
                .map(bookmark => toAndroidBookmark(bookmark, context.chapterContents)),
            readingRecords: toAndroidReadRecords(context.readingRecords.filter(record => onlineBookIds.has(record.bookId))),
        },
    };
}
export function placeholderChapters(book) {
    const count = clampInteger(book.totalChapterNum);
    if (count === 0)
        return [];
    const currentIndex = Math.min(clampInteger(book.durChapterIndex), count - 1);
    return Array.from({ length: count }, (_, index) => ({
        index,
        title: index === currentIndex && book.durChapterTitle
            ? String(book.durChapterTitle)
            : `第 ${index + 1} 章`,
    }));
}
