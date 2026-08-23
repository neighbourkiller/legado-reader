import { parseString, resolveAbsoluteUrl } from './RuleParser';
export function parseBookInfo(html, rule, baseUrl) {
    const isJson = html.trim().startsWith('{') || html.trim().startsWith('[');
    const context = isJson ? JSON.parse(html) : new DOMParser().parseFromString(html, 'text/html');
    const rawTocUrl = parseString(context, rule.tocUrl || '');
    const finalTocUrl = resolveAbsoluteUrl(rawTocUrl, baseUrl);
    const rawCoverUrl = parseString(context, rule.coverUrl || '');
    const finalCoverUrl = resolveAbsoluteUrl(rawCoverUrl, baseUrl);
    return {
        name: parseString(context, rule.name || ''),
        author: parseString(context, rule.author || ''),
        coverUrl: finalCoverUrl,
        intro: parseString(context, rule.intro || ''),
        tocUrl: finalTocUrl,
    };
}
