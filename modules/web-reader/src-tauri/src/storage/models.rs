use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Clone)]
pub struct StorageInitState {
    pub result: Arc<Result<Arc<crate::storage::db::StorageDb>, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageErrorPayload {
    pub code: String,
    pub operation: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub entity: Option<String>,
}

impl std::fmt::Display for StorageErrorPayload {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}: {}", self.code, self.operation, self.message)
    }
}

impl std::error::Error for StorageErrorPayload {}

impl StorageErrorPayload {
    pub fn new(code: &str, operation: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            operation: operation.to_string(),
            message: message.into(),
            entity: None,
        }
    }

    pub fn with_entity(mut self, entity: impl Into<String>) -> Self {
        self.entity = Some(entity.into());
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredBookRecord {
    pub meta: serde_json::Value,
    pub chapters: serde_json::Value,
    pub has_file_data: bool,
    pub file_size: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredBookFileInfo {
    pub id: String,
    pub name: String,
    pub author: String,
    pub format: String,
    pub size: usize,
    pub total_chapters: usize,
    pub last_read_time: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookmarkRecord {
    pub id: String,
    pub book_id: String,
    pub book_name: String,
    pub book_author: String,
    pub chapter_index: i64,
    pub chapter_pos: i64,
    #[serde(default)]
    pub start_offset: i64,
    #[serde(default)]
    pub end_offset: i64,
    pub chapter_title: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub android_chapter_pos: Option<i64>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HighlightRecord {
    pub id: String,
    pub book_id: String,
    pub book_name: String,
    pub book_author: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub book_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chapter_url: Option<String>,
    pub chapter_index: i64,
    pub chapter_title: String,
    pub start_offset: i64,
    pub end_offset: i64,
    pub start_paragraph: i64,
    pub end_paragraph: i64,
    pub text: String,
    pub style: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceRuleRecord {
    pub id: i64,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group: Option<String>,
    pub pattern: String,
    pub replacement: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
    #[serde(default)]
    pub scope_title: bool,
    #[serde(default)]
    pub scope_source: bool,
    #[serde(default = "default_true")]
    pub scope_content: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exclude_scope: Option<String>,
    #[serde(default = "default_true")]
    pub is_enabled: bool,
    #[serde(default)]
    pub is_regex: bool,
    #[serde(default = "default_timeout")]
    pub timeout_millisecond: i64,
    #[serde(default)]
    pub order: i64,
}

fn default_true() -> bool {
    true
}

fn default_timeout() -> i64 {
    3000
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingDeviceContribution {
    pub read_time: i64,
    pub last_read: i64,
    pub author: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingRecord {
    pub book_id: String,
    pub book_name: String,
    pub book_author: String,
    pub read_time: i64,
    pub last_read: i64,
    #[serde(default)]
    pub devices: HashMap<String, ReadingDeviceContribution>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredChapterContent {
    pub key: String,
    pub book_id: String,
    pub chapter_index: i64,
    pub title: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chapter_url: Option<String>,
    pub downloaded_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapterCacheSummary {
    pub book_id: String,
    pub book_name: String,
    pub book_author: String,
    pub chapter_count: usize,
    pub size: usize,
}
