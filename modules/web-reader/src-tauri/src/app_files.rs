use std::fs;
use tauri::{AppHandle, Manager};
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub fn open_app_data_dir(app: AppHandle) -> Result<String, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("无法确定应用数据目录: {error}"))?;

    fs::create_dir_all(&directory).map_err(|error| format!("无法创建应用数据目录: {error}"))?;

    let display_path = directory.to_string_lossy().into_owned();
    app.opener()
        .open_path(&display_path, None::<&str>)
        .map_err(|error| format!("无法打开应用数据目录: {error}"))?;

    Ok(display_path)
}
