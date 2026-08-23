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
/** 从响应中提取 Cloudflare 诊断信息 */
export function extractCfDiagnostics(response) {
    const getHeader = (name) => Object.entries(response.headers).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1];
    const server = getHeader('server');
    const cfRay = getHeader('cf-ray');
    const cfMitigated = getHeader('cf-mitigated');
    const isCloudflare = server?.toLowerCase().includes('cloudflare') ?? false;
    let isChallenge = false;
    if (response.status === 403 && isCloudflare) {
        const html = decodeResponse(response.body, response.charset || 'utf-8').toLowerCase();
        isChallenge = [
            'just a moment',
            'attention required',
            'sorry, you have been blocked',
            'cf-mitigated',
            '/cdn-cgi/challenge-platform/',
        ].some(marker => html.includes(marker));
    }
    return { isChallenge, cfRay, cfMitigated };
}
/** Cloudflare 验证挑战错误，携带诊断信息和原始响应 */
export class CloudflareChallengeError extends Error {
    constructor(message, response, diagnostics) {
        super(message);
        this.name = 'CloudflareChallengeError';
        this.diagnostics = diagnostics;
        this.response = response;
    }
}
function createHttpError(response, fallbackMessage) {
    const cfInfo = extractCfDiagnostics(response);
    if (cfInfo.isChallenge) {
        return new CloudflareChallengeError('目标网站触发 Cloudflare 浏览器访问验证（HTTP 403）。请启用 WebView 通道或先完成网页验证。', response, cfInfo);
    }
    return new Error(fallbackMessage);
}
export function getDefaultUserAgent() {
    if (typeof navigator !== 'undefined' && navigator.userAgent) {
        return navigator.userAgent;
    }
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
}
export function getSourceHeaders(source, refererUrl) {
    // 仅设置基础 headers，不伪装 Sec-CH-UA / Sec-Fetch-* 等浏览器特有头
    // 这些 Client Hints 和 Sec-Fetch 头应由真实浏览器生成，reqwest 冒充反而增加被检测为爬虫的风险
    const headers = {
        'User-Agent': getDefaultUserAgent(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': refererUrl || source.bookSourceUrl,
    };
    if (source.header) {
        try {
            const customHeader = typeof source.header === 'string' ? JSON.parse(source.header) : source.header;
            Object.assign(headers, customHeader);
        }
        catch { }
    }
    return headers;
}
export function parseSearchUrl(searchUrl, keyword, source, page = 1) {
    const bookSourceUrl = source.bookSourceUrl || '';
    let rawUrl = searchUrl.trim();
    let postConfig = null;
    const replacePlaceholders = (text) => {
        return text
            .replace(/\{\{key\}\}/g, encodeURIComponent(keyword))
            .replace(/\{\{keyword\}\}/g, encodeURIComponent(keyword))
            .replace(/\{\{page\}\}/g, String(page))
            .replace(/\{\{source\.bookSourceUrl\}\}/g, bookSourceUrl)
            .replace(/\{\{source\.baseUrl\}\}/g, bookSourceUrl)
            .replace(/\{\{baseUrl\}\}/g, bookSourceUrl)
            .replace(/\{\{sourceUrl\}\}/g, bookSourceUrl)
            .replace(/\{\{source\.bookSourceName\}\}/g, encodeURIComponent(source.bookSourceName || ''));
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
    const headers = getSourceHeaders(source, bookSourceUrl);
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
    /**
     * 统一请求方法：根据书源配置自动选择 reqwest 或 WebView 通道
     * - useWebView=true 的书源优先使用 WebView fetch（共享浏览器会话/指纹）
     * - 其余书源使用 reqwest 快速通道
     * - reqwest 通道遇到 Cloudflare challenge 时抛出 CloudflareChallengeError 提示用户
     */
    async executeRequest(source, url, method, headers, body, charset, timeout) {
        const transport = await getTransport();
        // WebView 通道：书源标记需要 WebView 且 transport 支持
        if (source.useWebView && transport.webviewFetch) {
            return transport.webviewFetch({
                sourceId: source.bookSourceUrl,
                url,
                method,
                headers,
                body,
                charset,
                timeout: timeout ?? 25000,
            });
        }
        // 默认 reqwest 快速通道
        const response = await transport.request({
            sourceId: source.bookSourceUrl,
            url,
            method,
            headers,
            body,
            charset,
            timeout: timeout ?? 25000,
        });
        // 自动检测 Cloudflare challenge，抛出带诊断信息的错误
        if (response.status === 403) {
            const cfInfo = extractCfDiagnostics(response);
            if (cfInfo.isChallenge) {
                throw new CloudflareChallengeError('检测到 Cloudflare 验证，请在书源设置中启用 WebView 通道或先完成网页验证。', response, cfInfo);
            }
        }
        return response;
    }
    async search(source, keyword, onProgress) {
        if (!source.searchUrl || !source.ruleSearch) {
            return [];
        }
        const searchReq = parseSearchUrl(source.searchUrl, keyword, source);
        const response = await this.executeRequest(source, searchReq.url, searchReq.method, searchReq.headers, searchReq.body, searchReq.charset, 25000);
        if (onProgress) {
            onProgress({
                status: response.status,
                finalUrl: response.finalUrl || searchReq.url,
                bodyLength: response.body.length,
                channel: response.channel,
            });
        }
        if (response.status >= 400) {
            throw createHttpError(response, `目标网站返回 HTTP ${response.status} 错误 (URL: ${response.finalUrl || searchReq.url})`);
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
        const response = await this.executeRequest(source, targetUrl, 'GET', getSourceHeaders(source, targetUrl));
        if (response.status >= 400) {
            throw createHttpError(response, `请求详情页失败 (HTTP ${response.status})`);
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
        const response = await this.executeRequest(source, targetUrl, 'GET', getSourceHeaders(source, targetUrl));
        if (response.status >= 400) {
            throw createHttpError(response, `请求目录页失败 (HTTP ${response.status})`);
        }
        const html = decodeResponse(response.body, response.charset || 'utf-8');
        const effectiveBaseUrl = response.finalUrl || targetUrl;
        return parseToc(html, source.ruleToc, effectiveBaseUrl);
    }
    async getContent(source, contentUrl) {
        if (!source.ruleContent) {
            throw new Error('书源未配置 ruleContent');
        }
        let url = resolveAbsoluteUrl(contentUrl, source.bookSourceUrl);
        let fullContent = '';
        while (url) {
            const response = await this.executeRequest(source, url, 'GET', getSourceHeaders(source, url));
            if (response.status >= 400) {
                throw createHttpError(response, `请求正文页失败 (HTTP ${response.status})`);
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
