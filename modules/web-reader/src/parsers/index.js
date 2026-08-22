import { parseTxt } from './txt-parser';
import { parseEpub } from './epub-parser';
export { getTxtChapterContent } from './txt-parser';
export { getEpubChapterContent } from './epub-parser';
export { DEFAULT_READ_SETTINGS } from './types';
/**
 * Parse a book file based on its extension.
 */
export async function parseBook(file) {
    const ext = file.name.split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'txt':
            return parseTxt(file);
        case 'epub':
            return parseEpub(file);
        default:
            throw new Error(`不支持的文件格式: .${ext}\n目前支持: .txt, .epub`);
    }
}
