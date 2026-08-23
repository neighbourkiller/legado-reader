import { parseList, parseString, resolveAbsoluteUrl } from './RuleParser';
export function parseToc(html, rule, baseUrl) {
    if (!rule.chapterList)
        return [];
    const isJson = html.trim().startsWith('{') || html.trim().startsWith('[');
    const list = parseList(html, rule.chapterList, isJson);
    return list.map(item => {
        const rawUrl = parseString(item, rule.chapterUrl || '');
        const finalUrl = resolveAbsoluteUrl(rawUrl, baseUrl);
        return {
            name: parseString(item, rule.chapterName || ''),
            url: finalUrl,
        };
    });
}
