import { platform } from '@/platform/capabilities';
let transportInstance = null;
export async function getTransport() {
    if (transportInstance) {
        return transportInstance;
    }
    if (platform.isDesktop) {
        const { TauriTransport } = await import('./TauriTransport');
        transportInstance = new TauriTransport();
    }
    else {
        const { WebTransport } = await import('./WebTransport');
        transportInstance = new WebTransport();
    }
    return transportInstance;
}
