mod cookie_store;
mod source_http;
mod source_policy;

use source_http::{
    check_cf_clearance, close_source_auth_window, exit_fullscreen, get_source_cookies,
    open_source_auth_window, set_source_cookies, source_request, sync_webview_cookies,
    toggle_fullscreen, webview_fetch, AppState,
};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            app.manage(AppState::new());
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
            exit_fullscreen
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
