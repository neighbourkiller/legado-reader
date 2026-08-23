import { parseString, resolveAbsoluteUrl } from './RuleParser';
export function parseContent(html, rule, baseUrl) {
    const isJson = html.trim().startsWith('{') || html.trim().startsWith('[');
    const context = isJson ? JSON.parse(html) : new DOMParser().parseFromString(html, 'text/html');
    let content = parseString(context, rule.content || '');
    // 兜底：如果规则提取出来的正文为空或过短，尝试提取常见小说正文容器
    if (!content || content.length < 20) {
        if (!isJson && context instanceof Document) {
            const selectors = [
                '#content',
                '#chaptercontent',
                '.read-content',
                '.content-body',
                '.content',
                '#article',
                '.article-content',
                '#htmlContent',
                '.txtnav',
                '#BookText',
                '.chapter-content',
            ];
            for (const sel of selectors) {
                const el = context.querySelector(sel);
                if (el) {
                    // 移除广告、无用脚本和页面操作按钮
                    el.querySelectorAll('script, style, .ad, #user_ad, .page-ops, .chapter-control').forEach(ad => ad.remove());
                    const pList = Array.from(el.querySelectorAll('p'));
                    if (pList.length > 0) {
                        content = pList.map(p => p.textContent?.trim() || '').filter(Boolean).join('\n');
                    }
                    else {
                        content = el.textContent?.trim() || '';
                    }
                    if (content && content.length >= 20) {
                        break;
                    }
                }
            }
        }
    }
    let nextUrl = parseString(context, rule.nextContentUrl || '');
    if (nextUrl) {
        nextUrl = resolveAbsoluteUrl(nextUrl, baseUrl);
    }
    return {
        content: content.trim(),
        nextUrl: nextUrl || undefined,
    };
}
