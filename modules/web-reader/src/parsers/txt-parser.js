/**
 * Chapter detection regex patterns ported from Legado's txtTocRule.json.
 * Only enabled rules are included. Order matters - first match wins.
 */
const CHAPTER_PATTERNS = [
    // 目录(去空白): 第X章/节/卷/集 preceded by whitespace
    /(?<=[\u3000\s])(?:序章|楔子|正文(?!完|结)|终章|后记|尾声|番外|第\s{0,4}[\d〇零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]+?\s{0,4}(?:章|节(?!课)|卷|集(?![合和]))).{0,30}$/m,
    // 目录: standard chapter heading
    /^[ \u3000\t]{0,4}(?:序章|楔子|正文(?!完|结)|终章|后记|尾声|番外|第\s{0,4}[\d〇零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]+?\s{0,4}(?:章|节(?!课)|卷|集(?![合和])|部(?![分赛游])|篇(?!张))).{0,30}$/m,
    // 数字 分隔符 标题名称
    /^[ \u3000\t]{0,4}\d{1,5}[:：,.，\s、_—\-].{1,30}$/m,
    // 大写数字 分隔符 标题名称
    /^[ \u3000\t]{0,4}(?:序章|楔子|正文(?!完|结)|终章|后记|尾声|番外|[零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]{1,8}章?)[ 、_—\-].{1,30}$/m,
    // 正文 标题/序号
    /^[ \u3000\t]{0,4}正文[ \u3000]{1,4}.{0,20}$/m,
    // Chapter/Section/Part/Episode
    /^[ \u3000\t]{0,4}(?:[Cc]hapter|[Ss]ection|[Pp]art|ＰＡＲＴ|[Nn][oO][.、]|[Ee]pisode|(?:内容|文章)?简介|文案|前言|序章|楔子|正文(?!完|结)|终章|后记|尾声|番外)\s{0,4}\d{1,4}.{0,30}$/m,
    // 特殊符号 序号 标题
    /(?<=[\s\u3000])[【〔〖「『〈［\[](?:第|[Cc]hapter)[\d零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]{1,10}[章节].{0,20}$/m,
    // 特殊符号 标题(单个)
    /(?<=[\s\u3000]{0,4})(?:[☆★✦✧].{1,30}|(?:内容|文章)?简介|文案|前言|序章|楔子|正文(?!完|结)|终章|后记|尾声|番外)[ \u3000]{0,4}$/m,
    // 章/卷 序号 标题
    /^[ \t\u3000]{0,4}(?:(?:内容|文章)?简介|文案|前言|序章|楔子|正文(?!完|结)|终章|后记|尾声|番外|[卷章][\d零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]{1,8})[ \u3000]{0,4}.{0,30}$/m,
    // 书名 括号 序号
    /^[\u4e00-\u9fff]{1,20}[ \u3000\t]{0,4}[(（][\d〇零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]{1,8}[)）][ \u3000\t]{0,4}$/m,
    // 书名 序号
    /^[\u4e00-\u9fff]{1,20}[ \u3000\t]{0,4}[\d〇零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]{1,8}[ \u3000\t]{0,4}$/m,
    // 字数分割 分节阅读
    /(?<=[ \u3000\t]{0,4})(?:.{0,15}分[页节章段]阅读[-_ ]|第\s{0,4}[\d零一二两三四五六七八九十百千万]{1,6}\s{0,4}[页节]).{0,30}$/m,
];
/**
 * Fallback: split into chunks of ~5000 chars if no chapter pattern matches.
 */
const FALLBACK_CHUNK_SIZE = 5000;
/**
 * Detect text encoding from a byte array.
 * Tries BOM first, then UTF-8 validation, then falls back to GBK.
 */
function detectEncoding(buffer) {
    const bytes = new Uint8Array(buffer);
    // Check BOM
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
        return 'utf-8';
    }
    if (bytes.length >= 2) {
        if (bytes[0] === 0xFF && bytes[1] === 0xFE)
            return 'utf-16le';
        if (bytes[0] === 0xFE && bytes[1] === 0xFF)
            return 'utf-16be';
    }
    // Try UTF-8: validate a sample of the file
    const sampleSize = Math.min(bytes.length, 8192);
    if (isValidUtf8(bytes, sampleSize)) {
        return 'utf-8';
    }
    // Fallback to GBK (covers GB2312, GB18030)
    return 'gbk';
}
function isValidUtf8(bytes, length) {
    let i = 0;
    while (i < length) {
        const b = bytes[i];
        if (b <= 0x7F) {
            i++;
        }
        else if (b >= 0xC2 && b <= 0xDF) {
            if (i + 1 >= length || (bytes[i + 1] & 0xC0) !== 0x80)
                return false;
            i += 2;
        }
        else if (b >= 0xE0 && b <= 0xEF) {
            if (i + 2 >= length || (bytes[i + 1] & 0xC0) !== 0x80 || (bytes[i + 2] & 0xC0) !== 0x80)
                return false;
            i += 3;
        }
        else if (b >= 0xF0 && b <= 0xF4) {
            if (i + 3 >= length || (bytes[i + 1] & 0xC0) !== 0x80 || (bytes[i + 2] & 0xC0) !== 0x80 || (bytes[i + 3] & 0xC0) !== 0x80)
                return false;
            i += 4;
        }
        else {
            return false;
        }
    }
    return true;
}
/**
 * Try each chapter pattern against a sample of text.
 * Returns the first pattern that finds at least 2 matches.
 */
function detectChapterPattern(text) {
    // Use first ~100KB for detection
    const sample = text.slice(0, 100000);
    for (const pattern of CHAPTER_PATTERNS) {
        const globalPattern = new RegExp(pattern.source, 'gm');
        const matches = sample.match(globalPattern);
        if (matches && matches.length >= 2) {
            return pattern;
        }
    }
    return null;
}
/**
 * Parse a TXT file into chapters.
 */
export async function parseTxt(file) {
    const buffer = await file.arrayBuffer();
    const encoding = detectEncoding(buffer);
    const decoder = new TextDecoder(encoding);
    const text = decoder.decode(buffer);
    const chapters = splitIntoChapters(text);
    const nameAuthor = parseNameAuthor(file.name);
    const id = generateId();
    const meta = {
        id,
        name: nameAuthor.name,
        author: nameAuthor.author,
        format: 'txt',
        totalChapters: chapters.length,
        currentChapter: 0,
        currentProgress: 0,
        lastReadTime: Date.now(),
        durChapterTitle: chapters[0]?.title || '',
        latestChapterTitle: chapters[chapters.length - 1]?.title || '',
    };
    return { meta, chapters };
}
function splitIntoChapters(text) {
    const pattern = detectChapterPattern(text);
    if (pattern) {
        return splitByPattern(text, pattern);
    }
    // Fallback: split by empty lines or fixed size
    return splitBySize(text);
}
function splitByPattern(text, pattern) {
    const globalPattern = new RegExp(pattern.source, 'gm');
    const chapters = [];
    const matches = [];
    let match;
    while ((match = globalPattern.exec(text)) !== null) {
        matches.push({ index: match.index, title: match[0].trim() });
    }
    if (matches.length === 0) {
        return splitBySize(text);
    }
    // If there's content before the first chapter, add as "序"
    if (matches[0].index > 100) {
        chapters.push({
            index: 0,
            title: '开头',
            startOffset: 0,
            endOffset: matches[0].index,
        });
    }
    for (let i = 0; i < matches.length; i++) {
        const start = matches[i].index;
        const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
        chapters.push({
            index: chapters.length,
            title: matches[i].title,
            startOffset: start,
            endOffset: end,
        });
    }
    return chapters;
}
function splitBySize(text) {
    const chapters = [];
    const lines = text.split(/\n/);
    let currentStart = 0;
    let currentCharCount = 0;
    let chapterNum = 1;
    for (let i = 0; i < lines.length; i++) {
        currentCharCount += lines[i].length + 1;
        if (currentCharCount >= FALLBACK_CHUNK_SIZE) {
            const endOffset = currentStart + currentCharCount;
            chapters.push({
                index: chapters.length,
                title: `第${chapterNum}节`,
                startOffset: currentStart,
                endOffset: Math.min(endOffset, text.length),
            });
            currentStart = endOffset;
            currentCharCount = 0;
            chapterNum++;
        }
    }
    // Last chunk
    if (currentCharCount > 0) {
        chapters.push({
            index: chapters.length,
            title: chapters.length === 0 ? '全文' : `第${chapterNum}节`,
            startOffset: currentStart,
            endOffset: text.length,
        });
    }
    return chapters;
}
// Cache decoded text using WeakMap to avoid repeated decoding of large files
const textCache = new WeakMap();
/**
 * Get chapter content from the stored file data.
 */
export function getTxtChapterContent(fileData, chapter) {
    let text = textCache.get(fileData);
    if (!text) {
        const encoding = detectEncoding(fileData);
        const decoder = new TextDecoder(encoding);
        text = decoder.decode(fileData);
        textCache.set(fileData, text);
    }
    return text.slice(chapter.startOffset ?? 0, chapter.endOffset ?? text.length);
}
/**
 * Parse book name and author from filename.
 * Patterns ported from Legado's LocalBook.kt.
 */
function parseNameAuthor(fileName) {
    const baseName = fileName.replace(/\.[^.]+$/, '');
    const patterns = [
        /(.*)《([^《》]+)》.*?作者：(.*)/,
        /(.*)《([^《》]+)》(.*)/,
        /^(.*)(.+)\s+作者：(.+)$/,
        /^(.*)(.+)\s+by\s+(.+)$/i,
    ];
    for (const pattern of patterns) {
        const match = baseName.match(pattern);
        if (match) {
            const name = match[2].trim();
            const author = (match[1] + match[3]).trim();
            return { name: name || baseName, author };
        }
    }
    return { name: baseName, author: '' };
}
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
