use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Instant;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::State;

use crate::storage::db::StorageDb;
use crate::storage::models::*;
use crate::storage::schema::initialize_schema;

pub struct ExportSession {
    pub token: String,
    pub temp_path: PathBuf,
    pub conn: Mutex<Option<Connection>>,
    pub created_at: Instant,
}

pub struct StagingSession {
    pub token: String,
    pub temp_path: PathBuf,
    pub conn: Mutex<Option<Connection>>,
    pub created_at: Instant,
}

#[derive(Default)]
pub struct BackupSessionManager {
    export_sessions: Mutex<HashMap<String, Arc<ExportSession>>>,
    staging_sessions: Mutex<HashMap<String, Arc<StagingSession>>>,
}

impl BackupSessionManager {
    pub fn new() -> Self {
        Self::default()
    }
}

fn lock_session<'a, T>(
    mutex: &'a Mutex<T>,
    stage: &'static str,
) -> Result<MutexGuard<'a, T>, StorageErrorPayload> {
    mutex.lock().map_err(|_| {
        StorageErrorPayload::new("TRANSACTION", stage, "备份会话锁已损坏，请重新开始操作")
    })
}

const PRIMARY_KEY_CHECKS: &[(&str, &str)] = &[
    ("books", "id"),
    ("settings", "key"),
    ("book_sources", "book_source_url"),
    ("remote_books", "id"),
    ("chapter_contents", "(book_id || ':' || chapter_index)"),
    ("bookmarks", "id"),
    ("reading_records", "book_id"),
    ("highlights", "id"),
    ("replace_rules", "id"),
];

fn validate_primary_key_uniqueness(
    conn: &Connection,
    database: &str,
) -> Result<(), StorageErrorPayload> {
    for &(table, key_expression) in PRIMARY_KEY_CHECKS {
        let sql =
            format!("SELECT COUNT(*), COUNT(DISTINCT {key_expression}) FROM {database}.{table};");
        let (total, distinct): (i64, i64) = conn
            .query_row(&sql, [], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|e| StorageErrorPayload::new("IO", "staging_pk_check", e.to_string()))?;
        if total != distinct {
            return Err(StorageErrorPayload::new(
                "CONSTRAINT",
                "staging_pk_check",
                format!("暂存表 {table} 存在重复主键或冲突 (总数: {total}, 唯一: {distinct})"),
            ));
        }
    }

    Ok(())
}

// --- 导出命令 ---

#[tauri::command]
pub async fn storage_backup_export_begin(
    app: tauri::AppHandle,
    state: State<'_, Arc<StorageDb>>,
    sessions: State<'_, Arc<BackupSessionManager>>,
) -> Result<String, StorageErrorPayload> {
    use tauri::Manager;

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| StorageErrorPayload::new("IO", "export_begin", e.to_string()))?;

    let token = format!("exp_{}_{}", std::process::id(), fastrand_suffix());
    let temp_path = app_data_dir.join(format!("{token}.tmp.db"));

    let live_db = state.inner().clone();
    let token_clone = token.clone();
    let temp_path_clone = temp_path.clone();

    tokio::task::spawn_blocking(move || {
        let src_conn = live_db.lock()?;
        let mut dest_conn = Connection::open(&temp_path_clone)
            .map_err(|e| StorageErrorPayload::new("IO", "open_export_snapshot", e.to_string()))?;

        // 使用 SQLite Online Backup API 进行一致性快照复制
        let backup = rusqlite::backup::Backup::new(&src_conn, &mut dest_conn)
            .map_err(|e| StorageErrorPayload::new("IO", "init_backup", e.to_string()))?;

        backup
            .run_to_completion(500, std::time::Duration::from_millis(10), None)
            .map_err(|e| StorageErrorPayload::new("IO", "run_backup", e.to_string()))?;

        Ok::<_, StorageErrorPayload>(())
    })
    .await
    .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))??;

    let dest_conn = Connection::open(&temp_path)
        .map_err(|e| StorageErrorPayload::new("IO", "reopen_snapshot", e.to_string()))?;

    let session = Arc::new(ExportSession {
        token: token.clone(),
        temp_path,
        conn: Mutex::new(Some(dest_conn)),
        created_at: Instant::now(),
    });

    lock_session(&sessions.export_sessions, "export_begin")?.insert(token.clone(), session);

    Ok(token_clone)
}

#[tauri::command]
pub async fn storage_backup_export_read_store(
    token: String,
    store_name: String,
    offset: Option<usize>,
    limit: Option<usize>,
    sessions: State<'_, Arc<BackupSessionManager>>,
) -> Result<Vec<Value>, StorageErrorPayload> {
    let session = {
        let map = lock_session(&sessions.export_sessions, "export_read_store")?;
        map.get(&token).cloned().ok_or_else(|| {
            StorageErrorPayload::new("NOT_FOUND", "export_read_store", "会话不存在或已过期")
        })?
    };

    tokio::task::spawn_blocking(move || {
        let guard = lock_session(&session.conn, "export_read_store")?;
        let conn = guard.as_ref().ok_or_else(|| {
            StorageErrorPayload::new("INVALID_DATA", "export_read_store", "会话数据库已关闭")
        })?;
        let mut records = Vec::new();

        let limit_clause = match (limit, offset) {
            (Some(l), Some(o)) => format!(" LIMIT {l} OFFSET {o}"),
            (Some(l), None) => format!(" LIMIT {l}"),
            (None, Some(o)) => format!(" LIMIT -1 OFFSET {o}"),
            (None, None) => String::new(),
        };

        match store_name.as_str() {
            "books" => {
                let sql = format!("SELECT meta_json, chapters_json FROM books ORDER BY rowid{limit_clause}");
                let mut stmt = conn
                    .prepare(&sql)
                    .map_err(|e| StorageErrorPayload::new("IO", "read_books", e.to_string()))?;
                let rows = stmt
                    .query_map([], |row| {
                        let m: String = row.get(0)?;
                        let c: String = row.get(1)?;
                        Ok((m, c))
                    })
                    .map_err(|e| StorageErrorPayload::new("IO", "query_books", e.to_string()))?;
                for item in rows {
                    let (m_str, c_str) = item.map_err(|e| StorageErrorPayload::new("IO", "read_book", e.to_string()))?;
                    let meta: Value = serde_json::from_str(&m_str).unwrap_or(Value::Null);
                    let chapters: Value = serde_json::from_str(&c_str).unwrap_or(Value::Null);
                    records.push(serde_json::json!({
                        "meta": meta,
                        "chapters": chapters
                    }));
                }
            }
            "settings" => {
                let sql = format!("SELECT value FROM settings ORDER BY rowid{limit_clause}");
                let mut stmt = conn
                    .prepare(&sql)
                    .map_err(|e| StorageErrorPayload::new("IO", "read_settings", e.to_string()))?;
                let rows = stmt
                    .query_map([], |row| row.get::<_, String>(0))
                    .map_err(|e| StorageErrorPayload::new("IO", "query_settings", e.to_string()))?;
                for item in rows {
                    let s = item.map_err(|e| StorageErrorPayload::new("IO", "read_setting", e.to_string()))?;
                    if let Ok(v) = serde_json::from_str::<Value>(&s) {
                        records.push(v);
                    }
                }
            }
            "bookSources" => {
                let sql = format!("SELECT data_json FROM book_sources ORDER BY custom_order ASC, rowid ASC{limit_clause}");
                let mut stmt = conn
                    .prepare(&sql)
                    .map_err(|e| StorageErrorPayload::new("IO", "read_sources", e.to_string()))?;
                let rows = stmt
                    .query_map([], |row| row.get::<_, String>(0))
                    .map_err(|e| StorageErrorPayload::new("IO", "query_sources", e.to_string()))?;
                for item in rows {
                    let s = item.map_err(|e| StorageErrorPayload::new("IO", "read_source", e.to_string()))?;
                    if let Ok(v) = serde_json::from_str::<Value>(&s) {
                        records.push(v);
                    }
                }
            }
            "remoteBooks" => {
                let sql = format!("SELECT data_json FROM remote_books ORDER BY rowid{limit_clause}");
                let mut stmt = conn
                    .prepare(&sql)
                    .map_err(|e| StorageErrorPayload::new("IO", "read_remote", e.to_string()))?;
                let rows = stmt
                    .query_map([], |row| row.get::<_, String>(0))
                    .map_err(|e| StorageErrorPayload::new("IO", "query_remote", e.to_string()))?;
                for item in rows {
                    let s = item.map_err(|e| StorageErrorPayload::new("IO", "read_remote", e.to_string()))?;
                    if let Ok(v) = serde_json::from_str::<Value>(&s) {
                        records.push(v);
                    }
                }
            }
            "chapterContents" => {
                let sql = format!("SELECT key, book_id, chapter_index, title, content, source_url, chapter_url, downloaded_at FROM chapter_contents ORDER BY rowid{limit_clause}");
                let mut stmt = conn
                    .prepare(&sql)
                    .map_err(|e| StorageErrorPayload::new("IO", "read_chapters", e.to_string()))?;
                let rows = stmt
                    .query_map([], |row| {
                        Ok(StoredChapterContent {
                            key: row.get(0)?,
                            book_id: row.get(1)?,
                            chapter_index: row.get(2)?,
                            title: row.get(3)?,
                            content: row.get(4)?,
                            source_url: row.get(5)?,
                            chapter_url: row.get(6)?,
                            downloaded_at: row.get(7)?,
                        })
                    })
                    .map_err(|e| StorageErrorPayload::new("IO", "query_chapters", e.to_string()))?;
                for item in rows {
                    let c = item.map_err(|e| StorageErrorPayload::new("IO", "read_chapter", e.to_string()))?;
                    records.push(serde_json::to_value(c).unwrap_or(Value::Null));
                }
            }
            "bookmarks" => {
                let sql = format!("SELECT id, book_id, book_name, book_author, chapter_index, chapter_pos, start_offset, end_offset, chapter_title, content, note, android_chapter_pos, created_at FROM bookmarks ORDER BY rowid{limit_clause}");
                let mut stmt = conn
                    .prepare(&sql)
                    .map_err(|e| StorageErrorPayload::new("IO", "read_bookmarks", e.to_string()))?;
                let rows = stmt
                    .query_map([], |row| {
                        Ok(BookmarkRecord {
                            id: row.get(0)?,
                            book_id: row.get(1)?,
                            book_name: row.get(2)?,
                            book_author: row.get(3)?,
                            chapter_index: row.get(4)?,
                            chapter_pos: row.get(5)?,
                            start_offset: row.get(6)?,
                            end_offset: row.get(7)?,
                            chapter_title: row.get(8)?,
                            content: row.get(9)?,
                            note: row.get(10)?,
                            android_chapter_pos: row.get(11)?,
                            created_at: row.get(12)?,
                        })
                    })
                    .map_err(|e| StorageErrorPayload::new("IO", "query_bookmarks", e.to_string()))?;
                for item in rows {
                    let b = item.map_err(|e| StorageErrorPayload::new("IO", "read_bookmark", e.to_string()))?;
                    records.push(serde_json::to_value(b).unwrap_or(Value::Null));
                }
            }
            "readingRecords" => {
                let sql = format!("SELECT book_id, book_name, book_author, read_time, last_read, devices_json FROM reading_records ORDER BY rowid{limit_clause}");
                let mut stmt = conn
                    .prepare(&sql)
                    .map_err(|e| StorageErrorPayload::new("IO", "read_records", e.to_string()))?;
                let rows = stmt
                    .query_map([], |row| {
                        let dev_str: String = row.get(5)?;
                        let devices: HashMap<String, ReadingDeviceContribution> =
                            serde_json::from_str(&dev_str).unwrap_or_default();
                        Ok(ReadingRecord {
                            book_id: row.get(0)?,
                            book_name: row.get(1)?,
                            book_author: row.get(2)?,
                            read_time: row.get(3)?,
                            last_read: row.get(4)?,
                            devices,
                        })
                    })
                    .map_err(|e| StorageErrorPayload::new("IO", "query_records", e.to_string()))?;
                for item in rows {
                    let r = item.map_err(|e| StorageErrorPayload::new("IO", "read_record", e.to_string()))?;
                    records.push(serde_json::to_value(r).unwrap_or(Value::Null));
                }
            }
            "highlights" => {
                let sql = format!("SELECT id, book_id, book_name, book_author, book_url, chapter_url, chapter_index, chapter_title, start_offset, end_offset, start_paragraph, end_paragraph, text, style_json, note, created_at FROM highlights ORDER BY rowid{limit_clause}");
                let mut stmt = conn
                    .prepare(&sql)
                    .map_err(|e| StorageErrorPayload::new("IO", "read_highlights", e.to_string()))?;
                let rows = stmt
                    .query_map([], |row| {
                        let style_str: String = row.get(13)?;
                        let style: Value = serde_json::from_str(&style_str).unwrap_or(Value::Null);
                        Ok(HighlightRecord {
                            id: row.get(0)?,
                            book_id: row.get(1)?,
                            book_name: row.get(2)?,
                            book_author: row.get(3)?,
                            book_url: row.get(4)?,
                            chapter_url: row.get(5)?,
                            chapter_index: row.get(6)?,
                            chapter_title: row.get(7)?,
                            start_offset: row.get(8)?,
                            end_offset: row.get(9)?,
                            start_paragraph: row.get(10)?,
                            end_paragraph: row.get(11)?,
                            text: row.get(12)?,
                            style,
                            note: row.get(14)?,
                            created_at: row.get(15)?,
                        })
                    })
                    .map_err(|e| StorageErrorPayload::new("IO", "query_highlights", e.to_string()))?;
                for item in rows {
                    let h = item.map_err(|e| StorageErrorPayload::new("IO", "read_highlight", e.to_string()))?;
                    records.push(serde_json::to_value(h).unwrap_or(Value::Null));
                }
            }
            "replaceRules" => {
                let sql = format!("SELECT id, name, rule_group, pattern, replacement, scope, scope_title, scope_source, scope_content, exclude_scope, is_enabled, is_regex, timeout_ms, rule_order FROM replace_rules ORDER BY rule_order ASC, rowid ASC{limit_clause}");
                let mut stmt = conn
                    .prepare(&sql)
                    .map_err(|e| StorageErrorPayload::new("IO", "read_replace_rules", e.to_string()))?;
                let rows = stmt
                    .query_map([], |row| {
                        let scope_title: i64 = row.get(6)?;
                        let scope_source: i64 = row.get(7)?;
                        let scope_content: i64 = row.get(8)?;
                        let is_enabled: i64 = row.get(10)?;
                        let is_regex: i64 = row.get(11)?;
                        Ok(ReplaceRuleRecord {
                            id: row.get(0)?,
                            name: row.get(1)?,
                            group: row.get(2)?,
                            pattern: row.get(3)?,
                            replacement: row.get(4)?,
                            scope: row.get(5)?,
                            scope_title: scope_title != 0,
                            scope_source: scope_source != 0,
                            scope_content: scope_content != 0,
                            exclude_scope: row.get(9)?,
                            is_enabled: is_enabled != 0,
                            is_regex: is_regex != 0,
                            timeout_millisecond: row.get(12)?,
                            order: row.get(13)?,
                        })
                    })
                    .map_err(|e| StorageErrorPayload::new("IO", "query_replace_rules", e.to_string()))?;
                for item in rows {
                    let r = item.map_err(|e| StorageErrorPayload::new("IO", "read_replace_rule", e.to_string()))?;
                    records.push(serde_json::to_value(r).unwrap_or(Value::Null));
                }
            }
            _ => {}
        }

        Ok(records)
    })
    .await
    .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

#[tauri::command]
pub async fn storage_backup_export_read_book_file(
    token: String,
    book_id: String,
    sessions: State<'_, Arc<BackupSessionManager>>,
) -> Result<Response, StorageErrorPayload> {
    let session = {
        let map = lock_session(&sessions.export_sessions, "export_read_book_file")?;
        map.get(&token).cloned().ok_or_else(|| {
            StorageErrorPayload::new("NOT_FOUND", "export_read_book_file", "会话不存在或已过期")
        })?
    };

    let bytes_opt = tokio::task::spawn_blocking(move || {
        let guard = lock_session(&session.conn, "export_read_book_file")?;
        let conn = guard.as_ref().ok_or_else(|| {
            StorageErrorPayload::new("INVALID_DATA", "export_read_book_file", "会话数据库已关闭")
        })?;
        let mut stmt = conn
            .prepare("SELECT file_data FROM books WHERE id = ?1")
            .map_err(|e| StorageErrorPayload::new("IO", "prepare_read_book_file", e.to_string()))?;

        let res: Option<Option<Vec<u8>>> = stmt
            .query_row(params![book_id], |row| row.get(0))
            .optional()
            .map_err(|e| StorageErrorPayload::new("IO", "query_book_file", e.to_string()))?;

        Ok::<_, StorageErrorPayload>(res.flatten())
    })
    .await
    .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))??;

    match bytes_opt {
        Some(bytes) => Ok(Response::new(bytes)),
        None => Err(StorageErrorPayload::new(
            "NOT_FOUND",
            "export_read_book_file",
            "书籍无文件或不存在",
        )),
    }
}

#[tauri::command]
pub async fn storage_backup_export_read_app_preferences(
    token: String,
    sessions: State<'_, Arc<BackupSessionManager>>,
) -> Result<HashMap<String, String>, StorageErrorPayload> {
    let session = {
        let map = lock_session(&sessions.export_sessions, "export_read_prefs")?;
        map.get(&token).cloned().ok_or_else(|| {
            StorageErrorPayload::new("NOT_FOUND", "export_read_prefs", "会话不存在或已过期")
        })?
    };

    tokio::task::spawn_blocking(move || {
        let guard = lock_session(&session.conn, "export_read_prefs")?;
        let conn = guard.as_ref().ok_or_else(|| {
            StorageErrorPayload::new("INVALID_DATA", "export_read_prefs", "会话数据库已关闭")
        })?;
        let mut stmt = conn
            .prepare("SELECT key, value FROM app_preferences")
            .map_err(|e| StorageErrorPayload::new("IO", "prepare_read_prefs", e.to_string()))?;

        let rows = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|e| StorageErrorPayload::new("IO", "query_prefs", e.to_string()))?;

        let mut prefs = HashMap::new();
        for item in rows {
            let (k, v): (String, String) =
                item.map_err(|e| StorageErrorPayload::new("IO", "read_pref", e.to_string()))?;
            // 排除设备 ID 和 WebDAV 配置，绝不进入备份！
            if k != "legado_tauri_device_id" && k != "legado_webdav_config" {
                prefs.insert(k, v);
            }
        }
        Ok(prefs)
    })
    .await
    .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

#[tauri::command]
pub async fn storage_backup_export_end(
    token: String,
    sessions: State<'_, Arc<BackupSessionManager>>,
) -> Result<(), StorageErrorPayload> {
    let session_opt = {
        let mut map = lock_session(&sessions.export_sessions, "export_end")?;
        map.remove(&token)
    };

    if let Some(session) = session_opt {
        lock_session(&session.conn, "export_end")?.take();
        let _ = fs::remove_file(&session.temp_path);
    }
    Ok(())
}

// --- 恢复暂存命令 ---

#[tauri::command]
pub async fn storage_staging_create(
    app: tauri::AppHandle,
    sessions: State<'_, Arc<BackupSessionManager>>,
) -> Result<String, StorageErrorPayload> {
    use tauri::Manager;

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| StorageErrorPayload::new("IO", "staging_create", e.to_string()))?;

    let token = format!("stg_{}_{}", std::process::id(), fastrand_suffix());
    let temp_path = app_data_dir.join(format!("{token}.tmp.db"));

    let mut dest_conn = Connection::open(&temp_path)
        .map_err(|e| StorageErrorPayload::new("IO", "open_staging_db", e.to_string()))?;

    initialize_schema(&mut dest_conn)?;

    let session = Arc::new(StagingSession {
        token: token.clone(),
        temp_path,
        conn: Mutex::new(Some(dest_conn)),
        created_at: Instant::now(),
    });

    lock_session(&sessions.staging_sessions, "staging_create")?.insert(token.clone(), session);

    Ok(token)
}

#[tauri::command]
pub async fn storage_staging_write_store(
    token: String,
    store_name: String,
    records: Vec<Value>,
    sessions: State<'_, Arc<BackupSessionManager>>,
) -> Result<(), StorageErrorPayload> {
    let session = {
        let map = lock_session(&sessions.staging_sessions, "staging_write_store")?;
        map.get(&token).cloned().ok_or_else(|| {
            StorageErrorPayload::new("NOT_FOUND", "staging_write_store", "暂存会话不存在")
        })?
    };

    tokio::task::spawn_blocking(move || {
        let mut guard = lock_session(&session.conn, "staging_write_store")?;
        let conn = guard.as_mut().ok_or_else(|| {
            StorageErrorPayload::new("INVALID_DATA", "staging_write_store", "暂存会话已关闭")
        })?;
        let tx = conn
            .transaction()
            .map_err(|e| StorageErrorPayload::new("TRANSACTION", "begin_staging_write", e.to_string()))?;

        match store_name.as_str() {
            "books" => {
                let mut stmt = tx
                    .prepare(
                        "INSERT OR REPLACE INTO books (
                            id, name, author, format, cover, total_chapters, current_chapter,
                            current_progress, last_read_time, file_size, meta_json, chapters_json
                        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                    )
                    .map_err(|e| StorageErrorPayload::new("IO", "prepare_insert_book", e.to_string()))?;

                for rec in records {
                    let meta = &rec["meta"];
                    let chapters = &rec["chapters"];
                    if let Some(id) = meta["id"].as_str() {
                        let name = meta["name"].as_str().unwrap_or("");
                        let author = meta["author"].as_str().unwrap_or("");
                        let format = meta["format"].as_str().unwrap_or("txt");
                        let cover = meta["cover"].as_str();
                        let total_chapters = meta["totalChapters"].as_i64().unwrap_or(0);
                        let current_chapter = meta["currentChapter"].as_i64().unwrap_or(0);
                        let current_progress = meta["currentProgress"].as_f64().unwrap_or(0.0);
                        let last_read_time = meta["lastReadTime"].as_i64().unwrap_or(0);
                        let meta_str = serde_json::to_string(meta).unwrap_or_default();
                        let chapters_str = serde_json::to_string(chapters).unwrap_or_default();

                        stmt.execute(params![
                            id,
                            name,
                            author,
                            format,
                            cover,
                            total_chapters,
                            current_chapter,
                            current_progress,
                            last_read_time,
                            0,
                            meta_str,
                            chapters_str,
                        ])
                        .map_err(|e| StorageErrorPayload::new("IO", "insert_staging_book", e.to_string()))?;
                    }
                }
            }
            "settings" => {
                let mut stmt = tx
                    .prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)")
                    .map_err(|e| StorageErrorPayload::new("IO", "prepare_insert_setting", e.to_string()))?;
                for rec in records {
                    let key = rec["key"].as_str().unwrap_or("readSettings");
                    let s = serde_json::to_string(&rec).unwrap_or_default();
                    stmt.execute(params![key, s])
                        .map_err(|e| StorageErrorPayload::new("IO", "insert_staging_setting", e.to_string()))?;
                }
            }
            "bookSources" => {
                let mut stmt = tx
                    .prepare(
                        "INSERT OR REPLACE INTO book_sources (
                            book_source_url, name, rule_group, enabled, custom_order, data_json
                        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    )
                    .map_err(|e| StorageErrorPayload::new("IO", "prepare_insert_source", e.to_string()))?;
                for rec in records {
                    if let Some(url) = rec["bookSourceUrl"].as_str() {
                        let name = rec["bookSourceName"].as_str().unwrap_or("");
                        let group = rec["bookSourceGroup"].as_str();
                        let enabled = rec["enabled"].as_bool().unwrap_or(true);
                        let custom_order = rec["customOrder"].as_i64().unwrap_or(0);
                        let data_str = serde_json::to_string(&rec).unwrap_or_default();
                        stmt.execute(params![url, name, group, enabled as i64, custom_order, data_str])
                            .map_err(|e| StorageErrorPayload::new("IO", "insert_staging_source", e.to_string()))?;
                    }
                }
            }
            "remoteBooks" => {
                let mut stmt = tx
                    .prepare("INSERT OR REPLACE INTO remote_books (id, data_json) VALUES (?1, ?2)")
                    .map_err(|e| StorageErrorPayload::new("IO", "prepare_insert_remote", e.to_string()))?;
                for rec in records {
                    if let Some(id) = rec["id"].as_str() {
                        let s = serde_json::to_string(&rec).unwrap_or_default();
                        stmt.execute(params![id, s])
                            .map_err(|e| StorageErrorPayload::new("IO", "insert_staging_remote", e.to_string()))?;
                    }
                }
            }
            "chapterContents" => {
                let mut stmt = tx
                    .prepare(
                        "INSERT OR REPLACE INTO chapter_contents (
                            key, book_id, chapter_index, title, content, source_url, chapter_url, downloaded_at, size_bytes
                        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                    )
                    .map_err(|e| StorageErrorPayload::new("IO", "prepare_insert_chapter", e.to_string()))?;
                for rec in records {
                    let key = rec["key"].as_str().unwrap_or("");
                    let book_id = rec["bookId"].as_str().unwrap_or("");
                    let chapter_index = rec["chapterIndex"].as_i64().unwrap_or(0);
                    let title = rec["title"].as_str().unwrap_or("");
                    let content = rec["content"].as_str().unwrap_or("");
                    let source_url = rec["sourceUrl"].as_str();
                    let chapter_url = rec["chapterUrl"].as_str();
                    let downloaded_at = rec["downloadedAt"].as_i64().unwrap_or(0);
                    let size_bytes = serde_json::to_vec(&rec).unwrap_or_default().len();

                    stmt.execute(params![
                        key,
                        book_id,
                        chapter_index,
                        title,
                        content,
                        source_url,
                        chapter_url,
                        downloaded_at,
                        size_bytes,
                    ])
                    .map_err(|e| StorageErrorPayload::new("IO", "insert_staging_chapter", e.to_string()))?;
                }
            }
            "bookmarks" => {
                let mut stmt = tx
                    .prepare(
                        "INSERT OR REPLACE INTO bookmarks (
                            id, book_id, book_name, book_author, chapter_index, chapter_pos,
                            start_offset, end_offset, chapter_title, content, note, android_chapter_pos, created_at
                        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
                    )
                    .map_err(|e| StorageErrorPayload::new("IO", "prepare_insert_bookmark", e.to_string()))?;
                for rec in records {
                    if let Some(id) = rec["id"].as_str() {
                        let book_id = rec["bookId"].as_str().unwrap_or("");
                        let book_name = rec["bookName"].as_str().unwrap_or("");
                        let book_author = rec["bookAuthor"].as_str().unwrap_or("");
                        let chapter_index = rec["chapterIndex"].as_i64().unwrap_or(0);
                        let chapter_pos = rec["chapterPos"].as_i64().unwrap_or(0);
                        let start_offset = rec["startOffset"].as_i64().unwrap_or(0);
                        let end_offset = rec["endOffset"].as_i64().unwrap_or(start_offset);
                        let chapter_title = rec["chapterTitle"].as_str().unwrap_or("");
                        let content = rec["content"].as_str().unwrap_or("");
                        let note = rec["note"].as_str();
                        let android_chapter_pos = rec["androidChapterPos"].as_i64();
                        let created_at = rec["createdAt"].as_i64().unwrap_or(0);

                        stmt.execute(params![
                            id,
                            book_id,
                            book_name,
                            book_author,
                            chapter_index,
                            chapter_pos,
                            start_offset,
                            end_offset,
                            chapter_title,
                            content,
                            note,
                            android_chapter_pos,
                            created_at,
                        ])
                        .map_err(|e| StorageErrorPayload::new("IO", "insert_staging_bookmark", e.to_string()))?;
                    }
                }
            }
            "readingRecords" => {
                let mut stmt = tx
                    .prepare(
                        "INSERT OR REPLACE INTO reading_records (
                            book_id, book_name, book_author, read_time, last_read, devices_json
                        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    )
                    .map_err(|e| StorageErrorPayload::new("IO", "prepare_insert_reading", e.to_string()))?;
                for rec in records {
                    if let Some(book_id) = rec["bookId"].as_str() {
                        let book_name = rec["bookName"].as_str().unwrap_or("");
                        let book_author = rec["bookAuthor"].as_str().unwrap_or("");
                        let read_time = rec["readTime"].as_i64().unwrap_or(0);
                        let last_read = rec["lastRead"].as_i64().unwrap_or(0);
                        let devices_str = serde_json::to_string(&rec["devices"]).unwrap_or_else(|_| "{}".to_string());

                        stmt.execute(params![
                            book_id,
                            book_name,
                            book_author,
                            read_time,
                            last_read,
                            devices_str,
                        ])
                        .map_err(|e| StorageErrorPayload::new("IO", "insert_staging_reading", e.to_string()))?;
                    }
                }
            }
            "highlights" => {
                let mut stmt = tx
                    .prepare(
                        "INSERT OR REPLACE INTO highlights (
                            id, book_id, book_name, book_author, book_url, chapter_url,
                            chapter_index, chapter_title, start_offset, end_offset,
                            start_paragraph, end_paragraph, text, style_json, note, created_at
                        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
                    )
                    .map_err(|e| StorageErrorPayload::new("IO", "prepare_insert_highlight", e.to_string()))?;
                for rec in records {
                    if let Some(id) = rec["id"].as_str() {
                        let book_id = rec["bookId"].as_str().unwrap_or("");
                        let book_name = rec["bookName"].as_str().unwrap_or("");
                        let book_author = rec["bookAuthor"].as_str().unwrap_or("");
                        let book_url = rec["bookUrl"].as_str();
                        let chapter_url = rec["chapterUrl"].as_str();
                        let chapter_index = rec["chapterIndex"].as_i64().unwrap_or(0);
                        let chapter_title = rec["chapterTitle"].as_str().unwrap_or("");
                        let start_offset = rec["startOffset"].as_i64().unwrap_or(0);
                        let end_offset = rec["endOffset"].as_i64().unwrap_or(0);
                        let start_paragraph = rec["startParagraph"].as_i64().unwrap_or(0);
                        let end_paragraph = rec["endParagraph"].as_i64().unwrap_or(0);
                        let text = rec["text"].as_str().unwrap_or("");
                        let style_str = serde_json::to_string(&rec["style"]).unwrap_or_default();
                        let note = rec["note"].as_str();
                        let created_at = rec["createdAt"].as_i64().unwrap_or(0);

                        stmt.execute(params![
                            id,
                            book_id,
                            book_name,
                            book_author,
                            book_url,
                            chapter_url,
                            chapter_index,
                            chapter_title,
                            start_offset,
                            end_offset,
                            start_paragraph,
                            end_paragraph,
                            text,
                            style_str,
                            note,
                            created_at,
                        ])
                        .map_err(|e| StorageErrorPayload::new("IO", "insert_staging_highlight", e.to_string()))?;
                    }
                }
            }
            "replaceRules" => {
                let mut stmt = tx
                    .prepare(
                        "INSERT OR REPLACE INTO replace_rules (
                            id, name, rule_group, pattern, replacement, scope, scope_title,
                            scope_source, scope_content, exclude_scope, is_enabled, is_regex,
                            timeout_ms, rule_order
                        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
                    )
                    .map_err(|e| StorageErrorPayload::new("IO", "prepare_insert_replace", e.to_string()))?;
                for rec in records {
                    if let Some(id) = rec["id"].as_i64() {
                        let name = rec["name"].as_str().unwrap_or("");
                        let group = rec["group"].as_str();
                        let pattern = rec["pattern"].as_str().unwrap_or("");
                        let replacement = rec["replacement"].as_str().unwrap_or("");
                        let scope = rec["scope"].as_str();
                        let scope_title = rec["scopeTitle"].as_bool().unwrap_or(false) as i64;
                        let scope_source = rec["scopeSource"].as_bool().unwrap_or(false) as i64;
                        let scope_content = rec["scopeContent"].as_bool().unwrap_or(true) as i64;
                        let exclude_scope = rec["excludeScope"].as_str();
                        let is_enabled = rec["isEnabled"].as_bool().unwrap_or(true) as i64;
                        let is_regex = rec["isRegex"].as_bool().unwrap_or(false) as i64;
                        let timeout_ms = rec["timeoutMillisecond"].as_i64().unwrap_or(3000);
                        let order = rec["order"].as_i64().unwrap_or(0);

                        stmt.execute(params![
                            id,
                            name,
                            group,
                            pattern,
                            replacement,
                            scope,
                            scope_title,
                            scope_source,
                            scope_content,
                            exclude_scope,
                            is_enabled,
                            is_regex,
                            timeout_ms,
                            order,
                        ])
                        .map_err(|e| StorageErrorPayload::new("IO", "insert_staging_replace", e.to_string()))?;
                    }
                }
            }
            _ => {}
        }

        tx.commit()
            .map_err(|e| StorageErrorPayload::new("TRANSACTION", "commit_staging_write", e.to_string()))?;

        Ok(())
    })
    .await
    .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

#[tauri::command]
pub async fn storage_staging_write_book_file(
    request: Request<'_>,
    sessions: State<'_, Arc<BackupSessionManager>>,
) -> Result<(), StorageErrorPayload> {
    let body = match request.body() {
        InvokeBody::Raw(bytes) => bytes.clone(),
        _ => {
            return Err(StorageErrorPayload::new(
                "INVALID_DATA",
                "staging_write_file",
                "请求体必须为二进制",
            ))
        }
    };

    if body.len() < 8 {
        return Err(StorageErrorPayload::new(
            "INVALID_DATA",
            "staging_write_file",
            "协议头过短",
        ));
    }

    let token_len = u32::from_le_bytes([body[0], body[1], body[2], body[3]]) as usize;
    if body.len() < 4 + token_len + 4 {
        return Err(StorageErrorPayload::new(
            "INVALID_DATA",
            "staging_write_file",
            "token 数据截断",
        ));
    }
    let token = String::from_utf8(body[4..4 + token_len].to_vec()).map_err(|e| {
        StorageErrorPayload::new("INVALID_DATA", "staging_write_file", e.to_string())
    })?;

    let offset = 4 + token_len;
    let id_len = u32::from_le_bytes([
        body[offset],
        body[offset + 1],
        body[offset + 2],
        body[offset + 3],
    ]) as usize;
    if body.len() < offset + 4 + id_len {
        return Err(StorageErrorPayload::new(
            "INVALID_DATA",
            "staging_write_file",
            "book_id 数据截断",
        ));
    }
    let book_id =
        String::from_utf8(body[offset + 4..offset + 4 + id_len].to_vec()).map_err(|e| {
            StorageErrorPayload::new("INVALID_DATA", "staging_write_file", e.to_string())
        })?;

    let file_bytes = body[offset + 4 + id_len..].to_vec();

    let session = {
        let map = lock_session(&sessions.staging_sessions, "staging_write_file")?;
        map.get(&token).cloned().ok_or_else(|| {
            StorageErrorPayload::new("NOT_FOUND", "staging_write_file", "暂存会话不存在")
        })?
    };

    tokio::task::spawn_blocking(move || {
        let mut guard = lock_session(&session.conn, "staging_write_file")?;
        let conn = guard.as_mut().ok_or_else(|| {
            StorageErrorPayload::new("INVALID_DATA", "staging_write_file", "暂存会话已关闭")
        })?;
        let file_size = file_bytes.len();
        conn.execute(
            "UPDATE books SET file_data = ?1, file_size = ?2 WHERE id = ?3",
            params![file_bytes, file_size, book_id],
        )
        .map_err(|e| StorageErrorPayload::new("IO", "update_staging_book_file", e.to_string()))?;
        Ok(())
    })
    .await
    .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

#[tauri::command]
pub async fn storage_staging_commit(
    token: String,
    clear_stores: Vec<String>,
    app_preferences: HashMap<String, String>,
    expected_counts: Option<HashMap<String, usize>>,
    expected_book_checksums: Option<HashMap<String, String>>,
    state: State<'_, Arc<StorageDb>>,
    sessions: State<'_, Arc<BackupSessionManager>>,
) -> Result<(), StorageErrorPayload> {
    let session = {
        let mut map = lock_session(&sessions.staging_sessions, "staging_commit")?;
        map.remove(&token).ok_or_else(|| {
            StorageErrorPayload::new("NOT_FOUND", "staging_commit", "暂存会话不存在")
        })?
    };

    let live_db = state.inner().clone();
    let temp_path = session.temp_path.clone();

    tokio::task::spawn_blocking(move || {
        // 关闭 staging 连接以释放句柄
        lock_session(&session.conn, "staging_commit")?.take();

        let mut live_conn = live_db.lock()?;
        let temp_path_str = temp_path.to_string_lossy();

        // 1. 事务外执行 ATTACH
        live_conn
            .execute("ATTACH DATABASE ?1 AS staging;", params![temp_path_str])
            .map_err(|e| StorageErrorPayload::new("IO", "attach_staging", e.to_string()))?;

        // 1.5. staging 完整校验：quick_check、主键唯一性、记录数与书籍文件摘要
        let validation_res = (|| -> Result<(), StorageErrorPayload> {
            // (a) PRAGMA staging.quick_check
            let check: String = live_conn
                .query_row("PRAGMA staging.quick_check;", [], |r| r.get(0))
                .map_err(|e| StorageErrorPayload::new("INVALID_DATA", "staging_quick_check", e.to_string()))?;
            if !check.eq_ignore_ascii_case("ok") {
                return Err(StorageErrorPayload::new(
                    "INVALID_DATA",
                    "staging_quick_check",
                    format!("暂存数据库完整性校验失败: {check}"),
                ));
            }

            // (b) 主键唯一性检验
            validate_primary_key_uniqueness(&live_conn, "staging")?;

            // (c) 记录数校验
            if let Some(counts) = &expected_counts {
                for (store, &expected) in counts {
                    let table = match store.as_str() {
                        "books" => "books",
                        "settings" => "settings",
                        "bookSources" => "book_sources",
                        "remoteBooks" => "remote_books",
                        "chapterContents" => "chapter_contents",
                        "bookmarks" => "bookmarks",
                        "readingRecords" => "reading_records",
                        "highlights" => "highlights",
                        "replaceRules" => "replace_rules",
                        _ => continue,
                    };
                    let actual: i64 = live_conn
                        .query_row(
                            &format!("SELECT COUNT(*) FROM staging.{table};"),
                            [],
                            |r| r.get(0),
                        )
                        .map_err(|e| StorageErrorPayload::new("IO", "staging_count_check", e.to_string()))?;
                    if actual as usize != expected {
                        return Err(StorageErrorPayload::new(
                            "CONSTRAINT",
                            "staging_count_check",
                            format!("暂存表 {store} 记录数校验不匹配: 期望 {expected}，实际 {actual}"),
                        ));
                    }
                }
            }

            // (d) 书籍文件 SHA-256 摘要校验
            if let Some(checksums) = &expected_book_checksums {
                for (book_id, expected_hash) in checksums {
                    let file_data_opt: Option<Vec<u8>> = live_conn
                        .query_row(
                            "SELECT file_data FROM staging.books WHERE id = ?1;",
                            params![book_id],
                            |r| r.get(0),
                        )
                        .optional()
                        .map_err(|e| StorageErrorPayload::new("IO", "staging_checksum_query", e.to_string()))?
                        .flatten();

                    match file_data_opt {
                        Some(bytes) => {
                            use sha2::{Digest, Sha256};
                            let mut hasher = Sha256::new();
                            hasher.update(&bytes);
                            let actual_hash = format!("{:x}", hasher.finalize());
                            if actual_hash != expected_hash.to_ascii_lowercase() {
                                return Err(StorageErrorPayload::new(
                                    "CONSTRAINT",
                                    "staging_checksum_check",
                                    format!("书籍 {book_id} 文件 SHA-256 摘要不匹配: 期望 {expected_hash}，实际 {actual_hash}"),
                                ));
                            }
                        }
                        None => {
                            return Err(StorageErrorPayload::new(
                                "NOT_FOUND",
                                "staging_checksum_check",
                                format!("暂存库中缺少书籍 {book_id} 的文件数据以进行摘要校验"),
                            ));
                        }
                    }
                }
            }

            Ok(())
        })();

        if let Err(e) = validation_res {
            let _ = live_conn.execute("DETACH DATABASE staging;", []);
            let _ = fs::remove_file(&temp_path);
            return Err(e);
        }

        // 2. 开启事务
        let tx_result = (|| -> Result<(), StorageErrorPayload> {
            let tx = live_conn
                .transaction()
                .map_err(|e| StorageErrorPayload::new("TRANSACTION", "begin_live_commit", e.to_string()))?;

            // 关键保护：若要清空 books，先暂存 live 库现有的本地书文件！
            if clear_stores.iter().any(|s| s == "books") {
                tx.execute(
                    "CREATE TEMP TABLE IF NOT EXISTS _preserved_book_files AS
                     SELECT id, file_data, file_size FROM main.books WHERE file_data IS NOT NULL;",
                    [],
                )
                .map_err(|e| StorageErrorPayload::new("IO", "preserve_books", e.to_string()))?;

                tx.execute("DELETE FROM main.books;", [])
                    .map_err(|e| StorageErrorPayload::new("IO", "clear_books", e.to_string()))?;
            }
            if clear_stores.iter().any(|s| s == "settings") {
                tx.execute("DELETE FROM main.settings;", [])
                    .map_err(|e| StorageErrorPayload::new("IO", "clear_settings", e.to_string()))?;
            }
            if clear_stores.iter().any(|s| s == "bookSources") {
                tx.execute("DELETE FROM main.book_sources;", [])
                    .map_err(|e| StorageErrorPayload::new("IO", "clear_sources", e.to_string()))?;
            }
            if clear_stores.iter().any(|s| s == "remoteBooks") {
                tx.execute("DELETE FROM main.remote_books;", [])
                    .map_err(|e| StorageErrorPayload::new("IO", "clear_remote", e.to_string()))?;
            }
            if clear_stores.iter().any(|s| s == "chapterContents") {
                tx.execute("DELETE FROM main.chapter_contents;", [])
                    .map_err(|e| StorageErrorPayload::new("IO", "clear_chapters", e.to_string()))?;
            }
            if clear_stores.iter().any(|s| s == "bookmarks") {
                tx.execute("DELETE FROM main.bookmarks;", [])
                    .map_err(|e| StorageErrorPayload::new("IO", "clear_bookmarks", e.to_string()))?;
            }
            if clear_stores.iter().any(|s| s == "readingRecords") {
                tx.execute("DELETE FROM main.reading_records;", [])
                    .map_err(|e| StorageErrorPayload::new("IO", "clear_reading", e.to_string()))?;
            }
            if clear_stores.iter().any(|s| s == "highlights") {
                tx.execute("DELETE FROM main.highlights;", [])
                    .map_err(|e| StorageErrorPayload::new("IO", "clear_highlights", e.to_string()))?;
            }
            if clear_stores.iter().any(|s| s == "replaceRules") {
                tx.execute("DELETE FROM main.replace_rules;", [])
                    .map_err(|e| StorageErrorPayload::new("IO", "clear_replace", e.to_string()))?;
            }

            // 从 staging 注入数据
            tx.execute("INSERT OR REPLACE INTO main.books SELECT * FROM staging.books;", [])
                .map_err(|e| StorageErrorPayload::new("IO", "transfer_books", e.to_string()))?;

            // 关键保护：若暂存书籍未提供新文件（如 Android 恢复或合并恢复现有书），用 live 原有文件恢复
            if clear_stores.iter().any(|s| s == "books") {
                tx.execute(
                    "UPDATE main.books
                     SET file_data = (SELECT file_data FROM _preserved_book_files WHERE _preserved_book_files.id = main.books.id),
                         file_size = (SELECT file_size FROM _preserved_book_files WHERE _preserved_book_files.id = main.books.id)
                     WHERE main.books.file_data IS NULL
                       AND main.books.id IN (SELECT id FROM _preserved_book_files);",
                    [],
                )
                .map_err(|e| StorageErrorPayload::new("IO", "restore_preserved_books", e.to_string()))?;

                let _ = tx.execute("DROP TABLE IF EXISTS _preserved_book_files;", []);
            }

            tx.execute("INSERT OR REPLACE INTO main.settings SELECT * FROM staging.settings;", [])
                .map_err(|e| StorageErrorPayload::new("IO", "transfer_settings", e.to_string()))?;

            tx.execute("INSERT OR REPLACE INTO main.book_sources SELECT * FROM staging.book_sources;", [])
                .map_err(|e| StorageErrorPayload::new("IO", "transfer_sources", e.to_string()))?;

            tx.execute("INSERT OR REPLACE INTO main.remote_books SELECT * FROM staging.remote_books;", [])
                .map_err(|e| StorageErrorPayload::new("IO", "transfer_remote", e.to_string()))?;

            tx.execute("INSERT OR REPLACE INTO main.chapter_contents SELECT * FROM staging.chapter_contents;", [])
                .map_err(|e| StorageErrorPayload::new("IO", "transfer_chapters", e.to_string()))?;

            tx.execute("INSERT OR REPLACE INTO main.bookmarks SELECT * FROM staging.bookmarks;", [])
                .map_err(|e| StorageErrorPayload::new("IO", "transfer_bookmarks", e.to_string()))?;

            tx.execute("INSERT OR REPLACE INTO main.reading_records SELECT * FROM staging.reading_records;", [])
                .map_err(|e| StorageErrorPayload::new("IO", "transfer_reading", e.to_string()))?;

            tx.execute("INSERT OR REPLACE INTO main.highlights SELECT * FROM staging.highlights;", [])
                .map_err(|e| StorageErrorPayload::new("IO", "transfer_highlights", e.to_string()))?;

            tx.execute("INSERT OR REPLACE INTO main.replace_rules SELECT * FROM staging.replace_rules;", [])
                .map_err(|e| StorageErrorPayload::new("IO", "transfer_replace", e.to_string()))?;

            // 导入偏好设置（排除设备 ID 和 WebDAV 配置）
            for (k, v) in app_preferences {
                if k != "legado_tauri_device_id" && k != "legado_webdav_config" {
                    tx.execute(
                        "INSERT OR REPLACE INTO main.app_preferences (key, value) VALUES (?1, ?2);",
                        params![k, v],
                    )
                    .map_err(|e| StorageErrorPayload::new("IO", "transfer_pref", e.to_string()))?;
                }
            }

            tx.commit()
                .map_err(|e| StorageErrorPayload::new("TRANSACTION", "commit_restore", e.to_string()))?;

            Ok(())
        })();

        // 3. 事务已关闭，在连接上无锁执行 DETACH
        let detach_res = live_conn.execute("DETACH DATABASE staging;", []);
        let _ = fs::remove_file(&temp_path);

        tx_result?;
        detach_res.map_err(|e| StorageErrorPayload::new("IO", "detach_staging", e.to_string()))?;

        Ok(())
    })
    .await
    .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

#[tauri::command]
pub async fn storage_staging_abort(
    token: String,
    sessions: State<'_, Arc<BackupSessionManager>>,
) -> Result<(), StorageErrorPayload> {
    let session_opt = {
        let mut map = lock_session(&sessions.staging_sessions, "staging_abort")?;
        map.remove(&token)
    };

    if let Some(session) = session_opt {
        lock_session(&session.conn, "staging_abort")?.take();
        let _ = fs::remove_file(&session.temp_path);
    }
    Ok(())
}

fn fastrand_suffix() -> u64 {
    use std::time::SystemTime;
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(12345)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn poisoned_backup_lock_returns_a_structured_error() {
        let mutex = Arc::new(Mutex::new(()));
        let poisoned = mutex.clone();
        let _ = std::thread::spawn(move || {
            let _guard = poisoned.lock().expect("测试线程应先获得锁");
            panic!("poison test lock");
        })
        .join();

        let error = lock_session(&mutex, "poison_test").expect_err("损坏的锁应返回错误");
        assert_eq!(error.code, "TRANSACTION");
        assert_eq!(error.operation, "poison_test");
    }

    #[test]
    fn primary_key_checks_match_current_storage_schema() {
        let mut conn = Connection::open_in_memory().expect("打开内存数据库失败");
        initialize_schema(&mut conn).expect("初始化数据库结构失败");
        conn.execute(
            "INSERT INTO reading_records (
                book_id, book_name, book_author, read_time, last_read, devices_json
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params!["reading-book-1", "测试书", "测试作者", 60, 1000, "{}"],
        )
        .expect("写入阅读记录失败");

        validate_primary_key_uniqueness(&conn, "main")
            .expect("主键校验字段必须与当前数据库结构一致");
    }
}
