import { getTransport } from '@/source/transport';
import { parseSearchResults } from './SearchParser';
import { parseBookInfo } from './BookInfoParser';
import { parseToc } from './TocParser';
import { parseContent } from './ContentParser';
import { parseString, resolveAbsoluteUrl } from './RuleParser';
export function decodeResponse(body, charset = 'utf-8') {
    try {
        const decoder = new TextDecoder(charset);
        return decoder.decode(body);
    }
    catch {
        const decoder = new TextDecoder('utf-8');
        return decoder.decode(body);
    }
}
export function parseSearchUrl(searchUrl, keyword, sourceOrBaseUrl, page = 1) {
    let rawUrl = searchUrl.trim();
    let postConfig = null;
    const bookSourceUrl = typeof sourceOrBaseUrl === 'string' ? sourceOrBaseUrl : (sourceOrBaseUrl?.bookSourceUrl || '');
    const bookSourceName = typeof sourceOrBaseUrl === 'string' ? '' : (sourceOrBaseUrl?.bookSourceName || '');
    const replacePlaceholders = (text) => {
        return text
            .replace(/\{\{key\}\}/g, encodeURIComponent(keyword))
            .replace(/\{\{keyword\}\}/g, encodeURIComponent(keyword))
            .replace(/\{\{page\}\}/g, String(page))
            .replace(/\{\{source\.bookSourceUrl\}\}/g, bookSourceUrl)
            .replace(/\{\{source\.baseUrl\}\}/g, bookSourceUrl)
            .replace(/\{\{baseUrl\}\}/g, bookSourceUrl)
            .replace(/\{\{sourceUrl\}\}/g, bookSourceUrl)
            .replace(/\{\{source\.bookSourceName\}\}/g, bookSourceName);
    };
    // 检查是否有逗号分隔的请求参数，例如: http://example.com/search,{"method":"POST", ...}
    const commaIdx = rawUrl.indexOf(',{');
    if (commaIdx !== -1) {
        const jsonStr = rawUrl.substring(commaIdx + 1);
        rawUrl = rawUrl.substring(0, commaIdx);
        try {
            postConfig = JSON.parse(replacePlaceholders(jsonStr));
        }
        catch {
            // 容错忽略
        }
    }
    // 替换 URL 中的占位符
    let finalUrl = replacePlaceholders(rawUrl);
    // 确保相对 URL（如 /bsearch?q=...）与基准源地址合成完整的 HTTP/HTTPS 绝对 URL
    finalUrl = resolveAbsoluteUrl(finalUrl, bookSourceUrl);
    let method = 'GET';
    let body = undefined;
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    };
    let charset = undefined;
    if (postConfig) {
        if (postConfig.method?.toUpperCase() === 'POST') {
            method = 'POST';
        }
        if (postConfig.body) {
            body = replacePlaceholders(String(postConfig.body));
        }
        if (postConfig.headers) {
            Object.assign(headers, postConfig.headers);
        }
        if (postConfig.charset) {
            charset = postConfig.charset;
        }
    }
    return {
        url: finalUrl,
        method,
        body,
        headers,
        charset,
    };
}
export class SourceEngine {
    async search(source, keyword, onProgress) {
        if (!source.searchUrl || !source.ruleSearch) {
            return [];
        }
        const searchReq = parseSearchUrl(source.searchUrl, keyword, source);
        const transport = await getTransport();
        const response = await transport.request({
            sourceId: source.bookSourceUrl,
            url: searchReq.url,
            method: searchReq.method,
            body: searchReq.body,
            headers: searchReq.headers,
            charset: searchReq.charset,
            timeout: 25000,
        });
        if (onProgress) {
            onProgress({
                status: response.status,
                finalUrl: response.finalUrl || searchReq.url,
                bodyLength: response.body.length,
            });
        }
        if (response.status >= 400) {
            throw new Error(`目标网站返回 HTTP ${response.status} 错误 (URL: ${response.finalUrl || searchReq.url})`);
        }
        const html = decodeResponse(response.body, response.charset || searchReq.charset || 'utf-8');
        const effectiveBaseUrl = response.finalUrl || searchReq.url || source.bookSourceUrl;
        const results = parseSearchResults(html, source.ruleSearch, effectiveBaseUrl, source);
        // 兜底：如果列表解析为空，但页面直接是单本书籍详情页（搜索词与页面中的书籍一致）
        if (results.length === 0 && (source.ruleBookInfo || html.includes('<h1'))) {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const bookName = parseString(doc, source.ruleBookInfo?.name || '') ||
                parseString(doc, 'h1') ||
                parseString(doc, '.title');
            if (bookName && (bookName.includes(keyword) || keyword.includes(bookName))) {
                const author = parseString(doc, source.ruleBookInfo?.author || '') || parseString(doc, '.author');
                const rawCover = parseString(doc, source.ruleBookInfo?.coverUrl || '') || parseString(doc, 'img@src');
                const coverUrl = resolveAbsoluteUrl(rawCover, effectiveBaseUrl);
                const intro = parseString(doc, source.ruleBookInfo?.intro || '') || parseString(doc, '.intro');
                results.push({
                    name: bookName,
                    author,
                    bookUrl: effectiveBaseUrl,
                    coverUrl,
                    intro,
                    sourceName: source.bookSourceName,
                    sourceUrl: source.bookSourceUrl,
                });
            }
        }
        return results;
    }
    async getBookInfo(source, bookUrl) {
        if (!source.ruleBookInfo) {
            throw new Error('书源未配置 ruleBookInfo');
        }
        const targetUrl = resolveAbsoluteUrl(bookUrl, source.bookSourceUrl);
        const transport = await getTransport();
        const response = await transport.request({
            sourceId: source.bookSourceUrl,
            url: targetUrl,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
        });
        if (response.status >= 400) {
            throw new Error(`请求详情页失败 (HTTP ${response.status})`);
        }
        const html = decodeResponse(response.body, response.charset || 'utf-8');
        const effectiveBaseUrl = response.finalUrl || targetUrl;
        return parseBookInfo(html, source.ruleBookInfo, effectiveBaseUrl);
    }
    async getToc(source, tocUrl) {
        if (!source.ruleToc) {
            throw new Error('书源未配置 ruleToc');
        }
        const targetUrl = resolveAbsoluteUrl(tocUrl, source.bookSourceUrl);
        const transport = await getTransport();
        const response = await transport.request({
            sourceId: source.bookSourceUrl,
            url: targetUrl,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
        });
        if (response.status >= 400) {
            throw new Error(`请求目录页失败 (HTTP ${response.status})`);
        }
        const html = decodeResponse(response.body, response.charset || 'utf-8');
        const effectiveBaseUrl = response.finalUrl || targetUrl;
        return parseToc(html, source.ruleToc, effectiveBaseUrl);
    }
    async getContent(source, contentUrl) {
        if (!source.ruleContent) {
            throw new Error('书源未配置 ruleContent');
        }
        const transport = await getTransport();
        let url = resolveAbsoluteUrl(contentUrl, source.bookSourceUrl);
        let fullContent = '';
        while (url) {
            const response = await transport.request({
                sourceId: source.bookSourceUrl,
                url,
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                },
            });
            if (response.status >= 400) {
                throw new Error(`请求正文页失败 (HTTP ${response.status})`);
            }
            const html = decodeResponse(response.body, response.charset || 'utf-8');
            const effectiveBaseUrl = response.finalUrl || url;
            const result = parseContent(html, source.ruleContent, effectiveBaseUrl);
            fullContent += result.content + '\n';
            url = result.nextUrl ? resolveAbsoluteUrl(result.nextUrl, effectiveBaseUrl) : '';
        }
        return fullContent.trim();
    }
}
