mod cookie_store;
mod source_http;
mod source_policy;

use tauri::Manager;
use source_http::{source_request, AppState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            app.manage(AppState::new());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![source_request])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
