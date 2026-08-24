export async function openExternalUrl(url) {
    if (import.meta.env.VITE_APP_TARGET === 'desktop') {
        const { openUrl } = await import('@tauri-apps/plugin-opener');
        await openUrl(url);
        return;
    }
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened)
        throw new Error('浏览器阻止了新窗口');
}
