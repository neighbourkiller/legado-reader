import { platform } from './capabilities';
const ZIP_FILTERS = [{ name: 'Legado 备份', extensions: ['zip'] }];
export async function chooseBackupFile() {
    if (!platform.isDesktop)
        throw new Error('仅 Tauri 客户端支持选择备份文件');
    const [{ open }, { readFile }] = await Promise.all([
        import('@tauri-apps/plugin-dialog'),
        import('@tauri-apps/plugin-fs'),
    ]);
    const path = await open({ multiple: false, directory: false, filters: ZIP_FILTERS });
    if (!path)
        return null;
    return { path, bytes: await readFile(path) };
}
export async function saveBackupFile(bytes, defaultName) {
    if (!platform.isDesktop)
        throw new Error('仅 Tauri 客户端支持保存备份文件');
    const [{ save }, { writeFile }] = await Promise.all([
        import('@tauri-apps/plugin-dialog'),
        import('@tauri-apps/plugin-fs'),
    ]);
    const path = await save({ defaultPath: defaultName, filters: ZIP_FILTERS });
    if (!path)
        return null;
    await writeFile(path, bytes);
    return path;
}
