export class TauriTransport {
    async request(req) {
        const { invoke } = await import('@tauri-apps/api/core');
        const res = await invoke('source_request', { request: req });
        return {
            ...res,
            body: new Uint8Array(res.body)
        };
    }
}
