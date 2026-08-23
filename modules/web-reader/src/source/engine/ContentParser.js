import { parseString } from './RuleParser';
export function parseContent(html, rule, baseUrl) {
    const isJson = html.trim().startsWith('{') || html.trim().startsWith('[');
    const context = isJson ? JSON.parse(html) : new DOMParser().parseFromString(html, 'text/html');
    const content = parseString(context, rule.content || '');
    let nextUrl = parseString(context, rule.nextContentUrl || '');
    if (nextUrl && !nextUrl.startsWith('http')) {
        try {
            nextUrl = new URL(nextUrl, baseUrl).href;
        }
        catch (e) {
            // Ignore URL parse error
        }
    }
    return {
        content,
        nextUrl: nextUrl || undefined
    };
}
