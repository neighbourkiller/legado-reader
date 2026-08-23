export class TauriTransport {
    async request(req) {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke('source_request', { request: req });
        return {
            ...res,
            body: new Uint8Array(res.body),
            channel: 'reqwest',
        };
    }
    async webviewFetch(req) {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke('webview_fetch', {
            sourceId: req.sourceId,
            url: req.url,
            method: req.method,
            headers: req.headers,
            body: req.body,
            timeoutMs: req.timeout,
        });
        return {
            ...res,
            body: new Uint8Array(res.body),
            channel: 'webview',
        };
    }
    async syncWebviewCookies(sourceId, url) {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke('sync_webview_cookies', { sourceId, url });
    }
    async checkCfClearance(sourceId, url) {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke('check_cf_clearance', { sourceId, url });
    }
    async setCookies(sourceId, url, cookieStr, userAgent) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('set_source_cookies', { sourceId, url, cookieStr, userAgent: userAgent || null });
    }
    async getCookies(sourceId, url) {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke('get_source_cookies', { sourceId, url });
    }
    async openAuthWindow(sourceId, url, title) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('open_source_auth_window', { sourceId, url, title });
    }
    async closeAuthWindow(sourceId) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('close_source_auth_window', { sourceId });
    }
}
