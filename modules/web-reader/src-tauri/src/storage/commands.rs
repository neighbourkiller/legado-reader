use std::sync::Arc;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::State;
use serde_json::Value;

use crate::storage::db::StorageDb;
use crate::storage::models::*;

pub type StorageState = Arc<StorageDb>;

#[tauri::command]
pub async fn storage_init_check(
    init_state: State<'_, StorageInitState>,
) -> Result<bool, StorageErrorPayload> {
    let result_arc = init_state.result.clone();
    tokio::task::spawn_blocking(move || match result_arc.as_ref() {
        Ok(db) => {
            let conn = db.lock()?;
            let version: i32 = conn
                .query_row("PRAGMA user_version;", [], |row| row.get(0))
                .map_err(|e| StorageErrorPayload::new("INIT_FAILED", "check_version", e.to_string()))?;
            if version == 1 {
                Ok(true)
            } else {
                Err(StorageErrorPayload::new(
                    "INIT_FAILED",
                    "check_version",
                    format!("不支持的数据库版本: {version}"),
                ))
            }
        }
        Err(err) => Err(StorageErrorPayload::new(
            "INIT_FAILED",
            "init_check",
            err.clone(),
        )),
    })
    .await
    .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

#[tauri::command]
pub async fn storage_save_book(
    request: Request<'_>,
    state: State<'_, StorageState>,
) -> Result<(), StorageErrorPayload> {
    let body = match request.body() {
        InvokeBody::Raw(bytes) => bytes.clone(),
        _ => {
            return Err(StorageErrorPayload::new(
                "INVALID_DATA",
                "storage_save_book",
                "请求体必须为二进制",
            ))
        }
    };

    if body.len() < 4 {
        return Err(StorageErrorPayload::new(
            "INVALID_DATA",
            "storage_save_book",
            "二进制协议头长度无效",
        ));
    }

    let json_len = u32::from_le_bytes([body[0], body[1], body[2], body[3]]) as usize;
    if body.len() < 4 + json_len {
        return Err(StorageErrorPayload::new(
            "INVALID_DATA",
            "storage_save_book",
            "JSON元数据长度溢出或截断",
        ));
    }

    let json_bytes = &body[4..4 + json_len];
    let file_blob = body[4 + json_len..].to_vec();

    let payload: Value = serde_json::from_slice(json_bytes)
        .map_err(|e| StorageErrorPayload::new("INVALID_DATA", "storage_save_book", format!("JSON解析失败: {e}")))?;

    let meta = payload.get("meta").cloned().ok_or_else(|| {
        StorageErrorPayload::new("INVALID_DATA", "storage_save_book", "缺少 meta 字段")
    })?;
    let chapters = payload.get("chapters").cloned().unwrap_or(Value::Array(Vec::new()));
    let has_file_data = payload.get("hasFileData").and_then(|v| v.as_bool()).unwrap_or(false);

    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let file_opt = if has_file_data && !file_blob.is_empty() {
            Some(file_blob.as_slice())
        } else {
            None
        };
        db.save_book(&meta, &chapters, file_opt)
    })
    .await
    .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

#[tauri::command]
pub async fn storage_get_book_record(
    id: String,
    state: State<'_, StorageState>,
) -> Result<Option<StoredBookRecord>, StorageErrorPayload> {
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || db.get_book_record(&id))
        .await
        .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

#[tauri::command]
pub async fn storage_get_book_file(
    id: String,
    state: State<'_, StorageState>,
) -> Result<Response, StorageErrorPayload> {
    let db = state.inner().clone();
    let target_id = id.clone();
    let bytes_opt = tokio::task::spawn_blocking(move || db.get_book_file(&target_id))
        .await
        .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))??;

    match bytes_opt {
        Some(bytes) => Ok(Response::new(bytes)),
        None => Err(StorageErrorPayload::new(
            "NOT_FOUND",
            "storage_get_book_file",
            format!("未找到书籍文件: {id}"),
        )),
    }
}

#[tauri::command]
pub async fn storage_get_all_book_metas(
    state: State<'_, StorageState>,
) -> Result<Vec<Value>, StorageErrorPayload> {
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || db.get_all_book_metas())
        .await
        .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

#[tauri::command]
pub async fn storage_update_book_meta(
    id: String,
    updates: Value,
    state: State<'_, StorageState>,
) -> Result<(), StorageErrorPayload> {
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || db.update_book_meta(&id, &updates))
        .await
        .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

#[tauri::command]
pub async fn storage_delete_book(
    id: String,
    state: State<'_, StorageState>,
) -> Result<(), StorageErrorPayload> {
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || db.delete_book(&id))
        .await
        .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

#[tauri::command]
pub async fn storage_get_all_stored_book_files(
    state: State<'_, StorageState>,
) -> Result<Vec<StoredBookFileInfo>, StorageErrorPayload> {
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || db.get_all_stored_book_files())
        .await
        .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

// --- Bookmarks ---

#[tauri::command]
pub async fn storage_save_bookmark(
    bookmark: BookmarkRecord,
    state: State<'_, StorageState>,
) -> Result<(), StorageErrorPayload> {
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || db.save_bookmark(&bookmark))
        .await
        .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

#[tauri::command]
pub async fn storage_get_bookmark_at(
    book_id: String,
    chapter_index: i64,
    chapter_pos: i64,
    start_offset: i64,
    state: State<'_, StorageState>,
) -> Result<Option<BookmarkRecord>, StorageErrorPayload> {
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || db.get_bookmark_at(&book_id, chapter_index, chapter_pos, start_offset))
        .await
        .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

#[tauri::command]
pub async fn storage_get_all_bookmarks(
    state: State<'_, StorageState>,
) -> Result<Vec<BookmarkRecord>, StorageErrorPayload> {
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || db.get_all_bookmarks())
        .await
        .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

#[tauri::command]
pub async fn storage_get_bookmarks_by_book_id(
    book_id: String,
    state: State<'_, StorageState>,
) -> Result<Vec<BookmarkRecord>, StorageErrorPayload> {
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || db.get_bookmarks_by_book_id(&book_id))
        .await
        .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

#[tauri::command]
pub async fn storage_delete_bookmark(
    id: String,
    state: State<'_, StorageState>,
) -> Result<(), StorageErrorPayload> {
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || db.delete_bookmark(&id))
        .await
        .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

// --- Highlights ---

#[tauri::command]
pub async fn storage_save_highlight(
    highlight: HighlightRecord,
    state: State<'_, StorageState>,
) -> Result<(), StorageErrorPayload> {
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || db.save_highlight(&highlight))
        .await
        .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

#[tauri::command]
pub async fn storage_get_highlights_by_book_id(
    book_id: String,
    state: State<'_, StorageState>,
) -> Result<Vec<HighlightRecord>, StorageErrorPayload> {
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || db.get_highlights_by_book_id(&book_id))
        .await
        .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

#[tauri::command]
pub async fn storage_get_highlights_by_chapter(
    book_id: String,
    chapter_index: i64,
    state: State<'_, StorageState>,
) -> Result<Vec<HighlightRecord>, StorageErrorPayload> {
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || db.get_highlights_by_chapter(&book_id, chapter_index))
        .await
        .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

#[tauri::command]
pub async fn storage_delete_highlight(
    id: String,
    state: State<'_, StorageState>,
) -> Result<(), StorageErrorPayload> {
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || db.delete_highlight(&id))
        .await
        .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

// --- Replace Rules ---

#[tauri::command]
pub async fn storage_save_replace_rule(
    rule: ReplaceRuleRecord,
    state: State<'_, StorageState>,
) -> Result<(), StorageErrorPayload> {
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || db.save_replace_rule(&rule))
        .await
        .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

#[tauri::command]
pub async fn storage_get_all_replace_rules(
    state: State<'_, StorageState>,
) -> Result<Vec<ReplaceRuleRecord>, StorageErrorPayload> {
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || db.get_all_replace_rules())
        .await
        .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

#[tauri::command]
pub async fn storage_delete_replace_rule(
    id: i64,
    state: State<'_, StorageState>,
) -> Result<(), StorageErrorPayload> {
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || db.delete_replace_rule(id))
        .await
        .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

// --- Reading Records ---

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddReadingTimeArgs {
    pub book_id: String,
    pub book_name: String,
    pub book_author: String,
    pub duration: i64,
    pub timestamp: i64,
    pub device_id: String,
}

#[tauri::command]
pub async fn storage_add_reading_time(
    args: AddReadingTimeArgs,
    state: State<'_, StorageState>,
) -> Result<(), StorageErrorPayload> {
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        db.add_reading_time(
            &args.book_id,
            &args.book_name,
            &args.book_author,
            args.duration,
            args.timestamp,
            &args.device_id,
        )
    })
    .await
    .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

#[tauri::command]
pub async fn storage_get_all_reading_records(
    state: State<'_, StorageState>,
) -> Result<Vec<ReadingRecord>, StorageErrorPayload> {
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || db.get_all_reading_records())
        .await
        .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

#[tauri::command]
pub async fn storage_delete_reading_record(
    book_id: String,
    state: State<'_, StorageState>,
) -> Result<(), StorageErrorPayload> {
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || db.delete_reading_record(&book_id))
        .await
        .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

#[tauri::command]
pub async fn storage_clear_reading_records(
    state: State<'_, StorageState>,
) -> Result<(), StorageErrorPayload> {
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || db.clear_reading_records())
        .await
        .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

// --- Chapter Contents ---

#[tauri::command]
pub async fn storage_save_chapter_content(
    content: StoredChapterContent,
    state: State<'_, StorageState>,
) -> Result<(), StorageErrorPayload> {
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || db.save_chapter_content(&content))
        .await
        .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

#[tauri::command]
pub async fn storage_get_chapter_content(
    book_id: String,
    chapter_index: i64,
    source_url: Option<String>,
    chapter_url: Option<String>,
    state: State<'_, StorageState>,
) -> Result<Option<String>, StorageErrorPayload> {
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        db.get_chapter_content(
            &book_id,
            chapter_index,
            source_url.as_deref(),
            chapter_url.as_deref(),
        )
    })
    .await
    .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

#[tauri::command]
pub async fn storage_get_book_chapter_contents(
    book_id: String,
    state: State<'_, StorageState>,
) -> Result<Vec<StoredChapterContent>, StorageErrorPayload> {
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || db.get_book_chapter_contents(&book_id))
        .await
        .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

#[tauri::command]
pub async fn storage_get_chapter_cache_summaries(
    state: State<'_, StorageState>,
) -> Result<Vec<ChapterCacheSummary>, StorageErrorPayload> {
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || db.get_chapter_cache_summaries())
        .await
        .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

#[tauri::command]
pub async fn storage_delete_book_chapter_contents(
    book_id: String,
    state: State<'_, StorageState>,
) -> Result<(), StorageErrorPayload> {
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || db.delete_book_chapter_contents(&book_id))
        .await
        .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

#[tauri::command]
pub async fn storage_clear_chapter_contents(
    state: State<'_, StorageState>,
) -> Result<(), StorageErrorPayload> {
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || db.clear_chapter_contents())
        .await
        .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

// --- Settings ---

#[tauri::command]
pub async fn storage_save_settings(
    settings: Value,
    state: State<'_, StorageState>,
) -> Result<(), StorageErrorPayload> {
    let s = serde_json::to_string(&settings)
        .map_err(|e| StorageErrorPayload::new("INVALID_DATA", "save_settings", e.to_string()))?;
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || db.save_settings("readSettings", &s))
        .await
        .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

#[tauri::command]
pub async fn storage_load_settings(
    state: State<'_, StorageState>,
) -> Result<Option<Value>, StorageErrorPayload> {
    let db = state.inner().clone();
    let s_opt = tokio::task::spawn_blocking(move || db.load_settings("readSettings"))
        .await
        .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))??;

    if let Some(s) = s_opt {
        let val: Value = serde_json::from_str(&s)
            .map_err(|e| StorageErrorPayload::new("INVALID_DATA", "load_settings", e.to_string()))?;
        Ok(Some(val))
    } else {
        Ok(None)
    }
}

// --- Book Sources ---

#[tauri::command]
pub async fn storage_save_book_source(
    source: Value,
    state: State<'_, StorageState>,
) -> Result<(), StorageErrorPayload> {
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || db.save_book_source(&source))
        .await
        .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

#[tauri::command]
pub async fn storage_get_all_book_sources(
    state: State<'_, StorageState>,
) -> Result<Vec<Value>, StorageErrorPayload> {
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || db.get_all_book_sources())
        .await
        .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

#[tauri::command]
pub async fn storage_delete_book_source(
    book_source_url: String,
    state: State<'_, StorageState>,
) -> Result<(), StorageErrorPayload> {
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || db.delete_book_source(&book_source_url))
        .await
        .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

#[tauri::command]
pub async fn storage_import_book_sources(
    sources: Vec<Value>,
    state: State<'_, StorageState>,
) -> Result<usize, StorageErrorPayload> {
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || db.import_book_sources(&sources))
        .await
        .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

// --- Preferences ---

#[tauri::command]
pub async fn storage_save_preference(
    key: String,
    value: String,
    state: State<'_, StorageState>,
) -> Result<(), StorageErrorPayload> {
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || db.save_preference(&key, &value))
        .await
        .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

#[tauri::command]
pub async fn storage_delete_preference(
    key: String,
    state: State<'_, StorageState>,
) -> Result<(), StorageErrorPayload> {
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || db.delete_preference(&key))
        .await
        .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

#[tauri::command]
pub async fn storage_get_preference(
    key: String,
    state: State<'_, StorageState>,
) -> Result<Option<String>, StorageErrorPayload> {
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || db.get_preference(&key))
        .await
        .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}

#[tauri::command]
pub async fn storage_get_all_preferences(
    state: State<'_, StorageState>,
) -> Result<std::collections::HashMap<String, String>, StorageErrorPayload> {
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || db.get_all_preferences())
        .await
        .map_err(|e| StorageErrorPayload::new("TRANSACTION", "spawn_blocking", e.to_string()))?
}
