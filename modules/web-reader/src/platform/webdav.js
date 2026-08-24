import { invoke } from '@tauri-apps/api/core';
import { platform } from './capabilities';
function requireDesktop() {
    if (!platform.isDesktop)
        throw new Error('仅 Tauri 客户端支持 WebDAV 备份');
}
export async function getWebDavConfig() {
    requireDesktop();
    return invoke('get_webdav_config');
}
export async function saveWebDavConfig(config, password, clearPassword = false) {
    requireDesktop();
    return invoke('save_webdav_config', {
        config,
        password: password || null,
        clearPassword,
    });
}
export async function testWebDavConnection(config, password) {
    requireDesktop();
    return invoke('test_webdav_connection', { config, password: password || null });
}
export async function listWebDavBackups() {
    requireDesktop();
    return invoke('list_webdav_backups');
}
export async function uploadWebDavBackup(name, data) {
    requireDesktop();
    return invoke('upload_webdav_backup', { name, data: Array.from(data) });
}
export async function downloadWebDavBackup(name) {
    requireDesktop();
    const data = await invoke('download_webdav_backup', { name });
    return new Uint8Array(data);
}
