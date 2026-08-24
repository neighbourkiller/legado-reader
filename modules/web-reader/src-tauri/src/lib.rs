mod app_files;
mod cookie_store;
mod source_http;
mod source_policy;
mod webdav;

use app_files::open_app_data_dir;
use source_http::{
    check_cf_clearance, close_source_auth_window, exit_fullscreen, get_source_cookies,
    open_source_auth_window, set_source_cookies, source_request, sync_webview_cookies,
    toggle_fullscreen, webview_fetch, AppState,
};
use tauri::Manager;
use webdav::{
    download_webdav_backup, get_webdav_config, list_webdav_backups, save_webdav_config,
    test_webdav_connection, upload_webdav_backup,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            app.manage(AppState::new());

            // 认证 WebView 被隐藏后仍然是一个存活窗口。关闭主窗口时显式退出应用，
            // 避免进程因隐藏的认证窗口继续驻留后台。
            if let Some(main_window) = app.get_webview_window("main") {
                let app_handle = app.handle().clone();
                main_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { .. } = event {
                        for (label, window) in app_handle.webview_windows() {
                            if label.starts_with("auth_") {
                                let _ = window.destroy();
                            }
                        }
                        app_handle.exit(0);
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            source_request,
            set_source_cookies,
            get_source_cookies,
            open_source_auth_window,
            close_source_auth_window,
            sync_webview_cookies,
            check_cf_clearance,
            webview_fetch,
            toggle_fullscreen,
            exit_fullscreen,
            open_app_data_dir,
            get_webdav_config,
            save_webdav_config,
            test_webdav_connection,
            list_webdav_backups,
            upload_webdav_backup,
            download_webdav_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
