import { parseList, parseString, resolveAbsoluteUrl } from './RuleParser';
export function parseToc(html, rule, baseUrl) {
    if (!rule.chapterList)
        return [];
    const isJson = html.trim().startsWith('{') || html.trim().startsWith('[');
    const list = parseList(html, rule.chapterList, isJson);
    return list
        .map(item => {
        // 1. 提取章节链接
        let rawUrl = parseString(item, rule.chapterUrl || '');
        if (!rawUrl && typeof item === 'object' && item !== null) {
            if (typeof item.getAttribute === 'function') {
                const directHref = item.getAttribute('href');
                if (directHref) {
                    rawUrl = directHref;
                }
            }
            if (!rawUrl && typeof item.querySelector === 'function') {
                const aEl = item.querySelector('a') || item.querySelector('[href]');
                if (aEl) {
                    rawUrl = aEl.getAttribute('href') || '';
                }
            }
        }
        const finalUrl = resolveAbsoluteUrl(rawUrl, baseUrl);
        // 2. 提取章节名称
        let name = parseString(item, rule.chapterName || '');
        if (!name && typeof item === 'object' && item !== null) {
            if (typeof item.querySelector === 'function') {
                const aEl = item.querySelector('a');
                name = aEl?.textContent?.trim() || item.textContent?.trim() || '';
            }
            else if (item.textContent) {
                name = String(item.textContent).trim();
            }
        }
        return {
            name: name.trim(),
            url: finalUrl,
        };
    })
        .filter(item => Boolean(item.name && item.url));
}
