mod app_files;
mod cookie_store;
mod source_http;
mod source_policy;
pub mod storage;
mod webdav;

use app_files::open_app_data_dir;
use source_http::{
    check_cf_clearance, close_source_auth_window, exit_fullscreen, get_source_cookies,
    open_source_auth_window, set_source_cookies, source_request, sync_webview_cookies,
    toggle_fullscreen, webview_fetch, AppState,
};
use storage::backup_session::*;
use storage::commands::*;
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

            let storage_result: Result<std::sync::Arc<storage::StorageDb>, String> = (|| {
                let app_data_dir = app
                    .path()
                    .app_data_dir()
                    .map_err(|e| format!("无法确定应用数据目录: {e}"))?;
                std::fs::create_dir_all(&app_data_dir)
                    .map_err(|e| format!("无法创建应用数据目录: {e}"))?;

                let db_filename = if cfg!(debug_assertions) {
                    "legado_reader.dev.db"
                } else {
                    "legado_reader.db"
                };
                let db_path = app_data_dir.join(db_filename);
                let storage_db = storage::StorageDb::open(&db_path)
                    .map_err(|e| format!("数据库初始化失败: {e}"))?;
                Ok(std::sync::Arc::new(storage_db))
            })();

            let storage_init_state = storage::models::StorageInitState {
                result: std::sync::Arc::new(storage_result.clone()),
            };
            app.manage(storage_init_state);

            if let Ok(db) = storage_result {
                app.manage(db);
            }
            app.manage(std::sync::Arc::new(storage::backup_session::BackupSessionManager::new()));

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
            download_webdav_backup,
            // SQLite Storage Commands
            storage_init_check,
            storage_save_book,
            storage_get_book_record,
            storage_get_book_file,
            storage_get_all_book_metas,
            storage_update_book_meta,
            storage_delete_book,
            storage_get_all_stored_book_files,
            storage_save_bookmark,
            storage_get_bookmark_at,
            storage_get_all_bookmarks,
            storage_get_bookmarks_by_book_id,
            storage_delete_bookmark,
            storage_save_highlight,
            storage_get_highlights_by_book_id,
            storage_get_highlights_by_chapter,
            storage_delete_highlight,
            storage_save_replace_rule,
            storage_get_all_replace_rules,
            storage_delete_replace_rule,
            storage_add_reading_time,
            storage_get_all_reading_records,
            storage_delete_reading_record,
            storage_clear_reading_records,
            storage_save_chapter_content,
            storage_get_chapter_content,
            storage_get_book_chapter_contents,
            storage_get_chapter_cache_summaries,
            storage_delete_book_chapter_contents,
            storage_clear_chapter_contents,
            storage_save_settings,
            storage_load_settings,
            storage_save_book_source,
            storage_get_all_book_sources,
            storage_delete_book_source,
            storage_import_book_sources,
            storage_save_preference,
            storage_delete_preference,
            storage_get_preference,
            storage_get_all_preferences,
            // Backup Session & Staging Commands
            storage_backup_export_begin,
            storage_backup_export_read_store,
            storage_backup_export_read_book_file,
            storage_backup_export_read_app_preferences,
            storage_backup_export_end,
            storage_staging_create,
            storage_staging_write_store,
            storage_staging_write_book_file,
            storage_staging_commit,
            storage_staging_abort
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
