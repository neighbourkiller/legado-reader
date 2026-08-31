use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

use crate::storage::models::*;
use crate::storage::schema::initialize_schema;

pub struct StorageDb {
    conn: Mutex<Connection>,
}

impl StorageDb {
    pub fn open(path: &Path) -> Result<Self, StorageErrorPayload> {
        let mut conn = Connection::open(path)
            .map_err(|e| StorageErrorPayload::new("IO", "open_db", e.to_string()))?;
        initialize_schema(&mut conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    #[cfg(test)]
    pub fn open_in_memory() -> Result<Self, StorageErrorPayload> {
        let mut conn = Connection::open_in_memory()
            .map_err(|e| StorageErrorPayload::new("IO", "open_in_memory", e.to_string()))?;
        initialize_schema(&mut conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn lock(&self) -> Result<std::sync::MutexGuard<'_, Connection>, StorageErrorPayload> {
        self.conn.lock().map_err(|e| {
            StorageErrorPayload::new(
                "TRANSACTION",
                "acquire_lock",
                format!("数据库互斥锁中毒: {e}"),
            )
        })
    }

    // --- Books ---

    pub fn save_book(
        &self,
        meta_json: &Value,
        chapters_json: &Value,
        file_data: Option<&[u8]>,
    ) -> Result<(), StorageErrorPayload> {
        let id = meta_json["id"]
            .as_str()
            .ok_or_else(|| StorageErrorPayload::new("INVALID_DATA", "save_book", "缺少书籍 id"))?;
        let name = meta_json["name"].as_str().unwrap_or("");
        let author = meta_json["author"].as_str().unwrap_or("");
        let format = meta_json["format"].as_str().unwrap_or("txt");
        let cover = meta_json["cover"].as_str();
        let total_chapters = meta_json["totalChapters"].as_i64().unwrap_or(0);
        let current_chapter = meta_json["currentChapter"].as_i64().unwrap_or(0);
        let current_progress = meta_json["currentProgress"].as_f64().unwrap_or(0.0);
        let last_read_time = meta_json["lastReadTime"].as_i64().unwrap_or(0);
        let file_size = file_data.map(|d| d.len()).unwrap_or(0);

        let meta_str = serde_json::to_string(meta_json).map_err(|e| {
            StorageErrorPayload::new("INVALID_DATA", "serialize_meta", e.to_string())
        })?;
        let chapters_str = serde_json::to_string(chapters_json).map_err(|e| {
            StorageErrorPayload::new("INVALID_DATA", "serialize_chapters", e.to_string())
        })?;

        let conn = self.lock()?;
        conn.execute(
            "INSERT OR REPLACE INTO books (
                id, name, author, format, cover, total_chapters, current_chapter,
                current_progress, last_read_time, file_size, meta_json, chapters_json, file_data
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                id,
                name,
                author,
                format,
                cover,
                total_chapters,
                current_chapter,
                current_progress,
                last_read_time,
                file_size,
                meta_str,
                chapters_str,
                file_data,
            ],
        )
        .map_err(|e| StorageErrorPayload::new("IO", "insert_book", e.to_string()))?;

        Ok(())
    }

    pub fn get_book_record(
        &self,
        id: &str,
    ) -> Result<Option<StoredBookRecord>, StorageErrorPayload> {
        let conn = self.lock()?;
        let mut stmt = conn
            .prepare(
                "SELECT meta_json, chapters_json, (file_data IS NOT NULL) AS has_file_data, file_size
                 FROM books WHERE id = ?1",
            )
            .map_err(|e| StorageErrorPayload::new("IO", "prepare_get_book", e.to_string()))?;

        let record = stmt
            .query_row(params![id], |row| {
                let meta_str: String = row.get(0)?;
                let chapters_str: String = row.get(1)?;
                let has_file_data: bool = row.get(2)?;
                let file_size: usize = row.get(3)?;
                Ok((meta_str, chapters_str, has_file_data, file_size))
            })
            .optional()
            .map_err(|e| StorageErrorPayload::new("IO", "query_book", e.to_string()))?;

        if let Some((meta_str, chapters_str, has_file_data, file_size)) = record {
            let meta: Value = serde_json::from_str(&meta_str).map_err(|e| {
                StorageErrorPayload::new("INVALID_DATA", "parse_meta", e.to_string())
            })?;
            let chapters: Value = serde_json::from_str(&chapters_str).map_err(|e| {
                StorageErrorPayload::new("INVALID_DATA", "parse_chapters", e.to_string())
            })?;
            Ok(Some(StoredBookRecord {
                meta,
                chapters,
                has_file_data,
                file_size,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn get_book_file(&self, id: &str) -> Result<Option<Vec<u8>>, StorageErrorPayload> {
        let conn = self.lock()?;
        let mut stmt = conn
            .prepare("SELECT file_data FROM books WHERE id = ?1")
            .map_err(|e| StorageErrorPayload::new("IO", "prepare_get_book_file", e.to_string()))?;

        let file_data: Option<Option<Vec<u8>>> = stmt
            .query_row(params![id], |row| row.get(0))
            .optional()
            .map_err(|e| StorageErrorPayload::new("IO", "query_book_file", e.to_string()))?;

        Ok(file_data.flatten())
    }

    pub fn get_all_book_metas(&self) -> Result<Vec<Value>, StorageErrorPayload> {
        let conn = self.lock()?;
        let mut stmt = conn
            .prepare("SELECT meta_json FROM books ORDER BY last_read_time DESC")
            .map_err(|e| StorageErrorPayload::new("IO", "prepare_get_all_metas", e.to_string()))?;

        let rows = stmt
            .query_map([], |row| {
                let s: String = row.get(0)?;
                Ok(s)
            })
            .map_err(|e| StorageErrorPayload::new("IO", "query_all_metas", e.to_string()))?;

        let mut metas = Vec::new();
        for item in rows {
            let s =
                item.map_err(|e| StorageErrorPayload::new("IO", "read_meta_row", e.to_string()))?;
            let v: Value = serde_json::from_str(&s).map_err(|e| {
                StorageErrorPayload::new("INVALID_DATA", "parse_meta_row", e.to_string())
            })?;
            metas.push(v);
        }
        Ok(metas)
    }

    pub fn update_book_meta(&self, id: &str, updates: &Value) -> Result<(), StorageErrorPayload> {
        let conn = self.lock()?;
        let meta_str: Option<String> = conn
            .query_row(
                "SELECT meta_json FROM books WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| {
                StorageErrorPayload::new("IO", "get_book_meta_for_update", e.to_string())
            })?;

        let meta_str = match meta_str {
            Some(s) => s,
            None => return Ok(()),
        };

        let mut meta_val: Value = serde_json::from_str(&meta_str).map_err(|e| {
            StorageErrorPayload::new("INVALID_DATA", "parse_existing_meta", e.to_string())
        })?;

        if let (Some(base), Some(upd)) = (meta_val.as_object_mut(), updates.as_object()) {
            for (k, v) in upd {
                base.insert(k.clone(), v.clone());
            }
        }

        let name = meta_val["name"].as_str().unwrap_or("");
        let author = meta_val["author"].as_str().unwrap_or("");
        let format = meta_val["format"].as_str().unwrap_or("txt");
        let cover = meta_val["cover"].as_str();
        let total_chapters = meta_val["totalChapters"].as_i64().unwrap_or(0);
        let current_chapter = meta_val["currentChapter"].as_i64().unwrap_or(0);
        let current_progress = meta_val["currentProgress"].as_f64().unwrap_or(0.0);
        let last_read_time = meta_val["lastReadTime"].as_i64().unwrap_or(0);

        let new_meta_str = serde_json::to_string(&meta_val).map_err(|e| {
            StorageErrorPayload::new("INVALID_DATA", "serialize_updated_meta", e.to_string())
        })?;

        conn.execute(
            "UPDATE books SET
                name = ?1, author = ?2, format = ?3, cover = ?4, total_chapters = ?5,
                current_chapter = ?6, current_progress = ?7, last_read_time = ?8, meta_json = ?9
             WHERE id = ?10",
            params![
                name,
                author,
                format,
                cover,
                total_chapters,
                current_chapter,
                current_progress,
                last_read_time,
                new_meta_str,
                id,
            ],
        )
        .map_err(|e| StorageErrorPayload::new("IO", "update_book_row", e.to_string()))?;

        Ok(())
    }

    pub fn delete_book(&self, id: &str) -> Result<(), StorageErrorPayload> {
        let mut conn = self.lock()?;
        let tx = conn.transaction().map_err(|e| {
            StorageErrorPayload::new("TRANSACTION", "begin_delete_book", e.to_string())
        })?;

        tx.execute("DELETE FROM books WHERE id = ?1", params![id])
            .map_err(|e| StorageErrorPayload::new("IO", "delete_book_record", e.to_string()))?;

        // 显式删除该书章节缓存，但保留书签、高亮和阅读记录
        tx.execute(
            "DELETE FROM chapter_contents WHERE book_id = ?1",
            params![id],
        )
        .map_err(|e| StorageErrorPayload::new("IO", "delete_book_chapters", e.to_string()))?;
        tx.execute(
            "DELETE FROM chapter_image_cache WHERE book_id = ?1",
            params![id],
        )
        .map_err(|e| StorageErrorPayload::new("IO", "delete_book_images", e.to_string()))?;

        tx.commit().map_err(|e| {
            StorageErrorPayload::new("TRANSACTION", "commit_delete_book", e.to_string())
        })?;

        Ok(())
    }

    pub fn get_all_stored_book_files(
        &self,
    ) -> Result<Vec<StoredBookFileInfo>, StorageErrorPayload> {
        let conn = self.lock()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, name, author, format, file_size, total_chapters, last_read_time
                 FROM books
                 WHERE format != 'online' AND file_data IS NOT NULL
                 ORDER BY name COLLATE NOCASE ASC",
            )
            .map_err(|e| {
                StorageErrorPayload::new("IO", "prepare_get_stored_files", e.to_string())
            })?;

        let rows = stmt
            .query_map([], |row| {
                Ok(StoredBookFileInfo {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    author: row.get(2)?,
                    format: row.get(3)?,
                    size: row.get(4)?,
                    total_chapters: row.get(5)?,
                    last_read_time: row.get(6)?,
                })
            })
            .map_err(|e| StorageErrorPayload::new("IO", "query_stored_files", e.to_string()))?;

        let mut files = Vec::new();
        for f in rows {
            files.push(
                f.map_err(|e| StorageErrorPayload::new("IO", "read_stored_file", e.to_string()))?,
            );
        }
        Ok(files)
    }

    // --- Bookmarks ---

    pub fn save_bookmark(&self, bookmark: &BookmarkRecord) -> Result<(), StorageErrorPayload> {
        let conn = self.lock()?;
        conn.execute(
            "INSERT OR REPLACE INTO bookmarks (
                id, book_id, book_name, book_author, chapter_index, chapter_pos,
                start_offset, end_offset, chapter_title, content, note, android_chapter_pos, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                bookmark.id,
                bookmark.book_id,
                bookmark.book_name,
                bookmark.book_author,
                bookmark.chapter_index,
                bookmark.chapter_pos,
                bookmark.start_offset,
                bookmark.end_offset,
                bookmark.chapter_title,
                bookmark.content,
                bookmark.note,
                bookmark.android_chapter_pos,
                bookmark.created_at,
            ],
        )
        .map_err(|e| StorageErrorPayload::new("IO", "save_bookmark", e.to_string()))?;
        Ok(())
    }

    pub fn get_bookmark_at(
        &self,
        book_id: &str,
        chapter_index: i64,
        chapter_pos: i64,
        start_offset: i64,
    ) -> Result<Option<BookmarkRecord>, StorageErrorPayload> {
        let conn = self.lock()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, book_id, book_name, book_author, chapter_index, chapter_pos,
                        start_offset, end_offset, chapter_title, content, note, android_chapter_pos, created_at
                 FROM bookmarks
                 WHERE book_id = ?1 AND chapter_index = ?2 AND chapter_pos = ?3 AND start_offset = ?4
                 LIMIT 1",
            )
            .map_err(|e| StorageErrorPayload::new("IO", "prepare_get_bookmark_at", e.to_string()))?;

        let res = stmt
            .query_row(
                params![book_id, chapter_index, chapter_pos, start_offset],
                |row| {
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
                },
            )
            .optional()
            .map_err(|e| StorageErrorPayload::new("IO", "query_bookmark_at", e.to_string()))?;

        Ok(res)
    }

    pub fn get_all_bookmarks(&self) -> Result<Vec<BookmarkRecord>, StorageErrorPayload> {
        let conn = self.lock()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, book_id, book_name, book_author, chapter_index, chapter_pos,
                        start_offset, end_offset, chapter_title, content, note, android_chapter_pos, created_at
                 FROM bookmarks ORDER BY created_at DESC",
            )
            .map_err(|e| StorageErrorPayload::new("IO", "prepare_get_all_bookmarks", e.to_string()))?;

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
            .map_err(|e| StorageErrorPayload::new("IO", "query_all_bookmarks", e.to_string()))?;

        let mut bookmarks = Vec::new();
        for b in rows {
            bookmarks.push(
                b.map_err(|e| StorageErrorPayload::new("IO", "read_bookmark", e.to_string()))?,
            );
        }
        Ok(bookmarks)
    }

    pub fn get_bookmarks_by_book_id(
        &self,
        book_id: &str,
    ) -> Result<Vec<BookmarkRecord>, StorageErrorPayload> {
        let conn = self.lock()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, book_id, book_name, book_author, chapter_index, chapter_pos,
                        start_offset, end_offset, chapter_title, content, note, android_chapter_pos, created_at
                 FROM bookmarks
                 WHERE book_id = ?1
                 ORDER BY chapter_index ASC, chapter_pos ASC, start_offset ASC, created_at ASC",
            )
            .map_err(|e| StorageErrorPayload::new("IO", "prepare_get_book_bookmarks", e.to_string()))?;

        let rows = stmt
            .query_map(params![book_id], |row| {
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
            .map_err(|e| StorageErrorPayload::new("IO", "query_book_bookmarks", e.to_string()))?;

        let mut bookmarks = Vec::new();
        for b in rows {
            bookmarks.push(b.map_err(|e| {
                StorageErrorPayload::new("IO", "read_book_bookmark", e.to_string())
            })?);
        }
        Ok(bookmarks)
    }

    pub fn delete_bookmark(&self, id: &str) -> Result<(), StorageErrorPayload> {
        let conn = self.lock()?;
        conn.execute("DELETE FROM bookmarks WHERE id = ?1", params![id])
            .map_err(|e| StorageErrorPayload::new("IO", "delete_bookmark", e.to_string()))?;
        Ok(())
    }

    // --- Highlights ---

    pub fn save_highlight(&self, highlight: &HighlightRecord) -> Result<(), StorageErrorPayload> {
        let conn = self.lock()?;
        let style_str = serde_json::to_string(&highlight.style).map_err(|e| {
            StorageErrorPayload::new("INVALID_DATA", "serialize_highlight_style", e.to_string())
        })?;

        conn.execute(
            "INSERT OR REPLACE INTO highlights (
                id, book_id, book_name, book_author, book_url, chapter_url, chapter_index,
                chapter_title, start_offset, end_offset, start_paragraph, end_paragraph,
                text, style_json, note, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
            params![
                highlight.id,
                highlight.book_id,
                highlight.book_name,
                highlight.book_author,
                highlight.book_url,
                highlight.chapter_url,
                highlight.chapter_index,
                highlight.chapter_title,
                highlight.start_offset,
                highlight.end_offset,
                highlight.start_paragraph,
                highlight.end_paragraph,
                highlight.text,
                style_str,
                highlight.note,
                highlight.created_at,
            ],
        )
        .map_err(|e| StorageErrorPayload::new("IO", "save_highlight", e.to_string()))?;
        Ok(())
    }

    pub fn get_highlights_by_book_id(
        &self,
        book_id: &str,
    ) -> Result<Vec<HighlightRecord>, StorageErrorPayload> {
        let conn = self.lock()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, book_id, book_name, book_author, book_url, chapter_url, chapter_index,
                        chapter_title, start_offset, end_offset, start_paragraph, end_paragraph,
                        text, style_json, note, created_at
                 FROM highlights
                 WHERE book_id = ?1
                 ORDER BY chapter_index ASC, start_offset ASC, created_at ASC",
            )
            .map_err(|e| {
                StorageErrorPayload::new("IO", "prepare_get_book_highlights", e.to_string())
            })?;

        let rows = stmt
            .query_map(params![book_id], |row| {
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
            .map_err(|e| StorageErrorPayload::new("IO", "query_book_highlights", e.to_string()))?;

        let mut list = Vec::new();
        for h in rows {
            list.push(
                h.map_err(|e| StorageErrorPayload::new("IO", "read_highlight", e.to_string()))?,
            );
        }
        Ok(list)
    }

    pub fn get_highlights_by_chapter(
        &self,
        book_id: &str,
        chapter_index: i64,
    ) -> Result<Vec<HighlightRecord>, StorageErrorPayload> {
        let conn = self.lock()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, book_id, book_name, book_author, book_url, chapter_url, chapter_index,
                        chapter_title, start_offset, end_offset, start_paragraph, end_paragraph,
                        text, style_json, note, created_at
                 FROM highlights
                 WHERE book_id = ?1 AND chapter_index = ?2
                 ORDER BY start_offset ASC, created_at ASC",
            )
            .map_err(|e| {
                StorageErrorPayload::new("IO", "prepare_get_chapter_highlights", e.to_string())
            })?;

        let rows = stmt
            .query_map(params![book_id, chapter_index], |row| {
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
            .map_err(|e| {
                StorageErrorPayload::new("IO", "query_chapter_highlights", e.to_string())
            })?;

        let mut list = Vec::new();
        for h in rows {
            list.push(h.map_err(|e| {
                StorageErrorPayload::new("IO", "read_chapter_highlight", e.to_string())
            })?);
        }
        Ok(list)
    }

    pub fn delete_highlight(&self, id: &str) -> Result<(), StorageErrorPayload> {
        let conn = self.lock()?;
        conn.execute("DELETE FROM highlights WHERE id = ?1", params![id])
            .map_err(|e| StorageErrorPayload::new("IO", "delete_highlight", e.to_string()))?;
        Ok(())
    }

    // --- Replace Rules ---

    pub fn save_replace_rule(&self, rule: &ReplaceRuleRecord) -> Result<(), StorageErrorPayload> {
        let conn = self.lock()?;
        conn.execute(
            "INSERT OR REPLACE INTO replace_rules (
                id, name, rule_group, pattern, replacement, scope, scope_title,
                scope_source, scope_content, exclude_scope, is_enabled, is_regex,
                timeout_ms, rule_order
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                rule.id,
                rule.name,
                rule.group,
                rule.pattern,
                rule.replacement,
                rule.scope,
                rule.scope_title as i64,
                rule.scope_source as i64,
                rule.scope_content as i64,
                rule.exclude_scope,
                rule.is_enabled as i64,
                rule.is_regex as i64,
                rule.timeout_millisecond,
                rule.order,
            ],
        )
        .map_err(|e| StorageErrorPayload::new("IO", "save_replace_rule", e.to_string()))?;
        Ok(())
    }

    pub fn get_all_replace_rules(&self) -> Result<Vec<ReplaceRuleRecord>, StorageErrorPayload> {
        let conn = self.lock()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, name, rule_group, pattern, replacement, scope, scope_title,
                        scope_source, scope_content, exclude_scope, is_enabled, is_regex,
                        timeout_ms, rule_order
                 FROM replace_rules ORDER BY rule_order ASC, id ASC",
            )
            .map_err(|e| {
                StorageErrorPayload::new("IO", "prepare_get_replace_rules", e.to_string())
            })?;

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

        let mut list = Vec::new();
        for r in rows {
            list.push(
                r.map_err(|e| StorageErrorPayload::new("IO", "read_replace_rule", e.to_string()))?,
            );
        }
        Ok(list)
    }

    pub fn delete_replace_rule(&self, id: i64) -> Result<(), StorageErrorPayload> {
        let conn = self.lock()?;
        conn.execute("DELETE FROM replace_rules WHERE id = ?1", params![id])
            .map_err(|e| StorageErrorPayload::new("IO", "delete_replace_rule", e.to_string()))?;
        Ok(())
    }

    // --- Reading Records ---

    pub fn add_reading_time(
        &self,
        book_id: &str,
        book_name: &str,
        book_author: &str,
        seconds: i64,
        timestamp: i64,
        device_id: &str,
    ) -> Result<(), StorageErrorPayload> {
        let conn = self.lock()?;
        let existing: Option<(i64, i64, String)> = conn
            .query_row(
                "SELECT read_time, last_read, devices_json FROM reading_records WHERE book_id = ?1",
                params![book_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()
            .map_err(|e| {
                StorageErrorPayload::new("IO", "query_existing_reading_record", e.to_string())
            })?;

        let mut devices: HashMap<String, ReadingDeviceContribution> =
            if let Some((_, _, dev_str)) = &existing {
                serde_json::from_str(dev_str).unwrap_or_default()
            } else {
                HashMap::new()
            };

        let current_dev =
            devices
                .entry(device_id.to_string())
                .or_insert_with(|| ReadingDeviceContribution {
                    read_time: 0,
                    last_read: timestamp,
                    author: book_author.to_string(),
                });

        current_dev.read_time = current_dev.read_time.max(0) + seconds.max(0);
        current_dev.last_read = timestamp;
        current_dev.author = book_author.to_string();

        let total_read_time: i64 = devices.values().map(|d| d.read_time.max(0)).sum();
        let max_last_read: i64 = devices
            .values()
            .map(|d| d.last_read)
            .max()
            .unwrap_or(timestamp);

        let dev_json_str = serde_json::to_string(&devices).map_err(|e| {
            StorageErrorPayload::new("INVALID_DATA", "serialize_devices", e.to_string())
        })?;

        conn.execute(
            "INSERT OR REPLACE INTO reading_records (
                book_id, book_name, book_author, read_time, last_read, devices_json
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                book_id,
                book_name,
                book_author,
                total_read_time,
                max_last_read,
                dev_json_str,
            ],
        )
        .map_err(|e| StorageErrorPayload::new("IO", "save_reading_record", e.to_string()))?;

        Ok(())
    }

    pub fn get_all_reading_records(&self) -> Result<Vec<ReadingRecord>, StorageErrorPayload> {
        let conn = self.lock()?;
        let mut stmt = conn
            .prepare(
                "SELECT book_id, book_name, book_author, read_time, last_read, devices_json
                 FROM reading_records ORDER BY last_read DESC",
            )
            .map_err(|e| {
                StorageErrorPayload::new("IO", "prepare_get_reading_records", e.to_string())
            })?;

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
            .map_err(|e| StorageErrorPayload::new("IO", "query_reading_records", e.to_string()))?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r.map_err(|e| {
                StorageErrorPayload::new("IO", "read_reading_record", e.to_string())
            })?);
        }
        Ok(list)
    }

    pub fn delete_reading_record(&self, book_id: &str) -> Result<(), StorageErrorPayload> {
        let conn = self.lock()?;
        conn.execute(
            "DELETE FROM reading_records WHERE book_id = ?1",
            params![book_id],
        )
        .map_err(|e| StorageErrorPayload::new("IO", "delete_reading_record", e.to_string()))?;
        Ok(())
    }

    pub fn clear_reading_records(&self) -> Result<(), StorageErrorPayload> {
        let conn = self.lock()?;
        conn.execute("DELETE FROM reading_records", [])
            .map_err(|e| StorageErrorPayload::new("IO", "clear_reading_records", e.to_string()))?;
        Ok(())
    }

    // --- Chapter Contents ---

    pub fn save_chapter_content(
        &self,
        content: &StoredChapterContent,
    ) -> Result<(), StorageErrorPayload> {
        let conn = self.lock()?;
        // 计算 UTF-8 JSON 字节数，保持与 TextEncoder(JSON.stringify(record)) 完全一致的统计口径
        let record_bytes = serde_json::to_vec(content).map_err(|e| {
            StorageErrorPayload::new("INVALID_DATA", "serialize_chapter_content", e.to_string())
        })?;
        let size_bytes = record_bytes.len();

        conn.execute(
            "INSERT OR REPLACE INTO chapter_contents (
                key, book_id, chapter_index, title, content, source_url, chapter_url, downloaded_at, size_bytes
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                content.key,
                content.book_id,
                content.chapter_index,
                content.title,
                content.content,
                content.source_url,
                content.chapter_url,
                content.downloaded_at,
                size_bytes,
            ],
        )
        .map_err(|e| StorageErrorPayload::new("IO", "save_chapter_content", e.to_string()))?;
        Ok(())
    }

    pub fn get_chapter_content(
        &self,
        book_id: &str,
        chapter_index: i64,
        source_url: Option<&str>,
        chapter_url: Option<&str>,
    ) -> Result<Option<String>, StorageErrorPayload> {
        let conn = self.lock()?;
        let key = format!("{book_id}:{chapter_index}");
        let mut stmt = conn
            .prepare("SELECT content, source_url, chapter_url FROM chapter_contents WHERE key = ?1")
            .map_err(|e| {
                StorageErrorPayload::new("IO", "prepare_get_chapter_content", e.to_string())
            })?;

        let res: Option<(String, Option<String>, Option<String>)> = stmt
            .query_row(params![key], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })
            .optional()
            .map_err(|e| StorageErrorPayload::new("IO", "query_chapter_content", e.to_string()))?;

        if let Some((content, s_url, c_url)) = res {
            if let Some(expected_source) = source_url {
                if let Some(actual_source) = s_url {
                    if actual_source != expected_source {
                        return Ok(None);
                    }
                }
            }
            if let Some(expected_chapter) = chapter_url {
                if let Some(actual_chapter) = c_url {
                    if actual_chapter != expected_chapter {
                        return Ok(None);
                    }
                }
            }
            Ok(Some(content))
        } else {
            Ok(None)
        }
    }

    pub fn get_book_chapter_contents(
        &self,
        book_id: &str,
    ) -> Result<Vec<StoredChapterContent>, StorageErrorPayload> {
        let conn = self.lock()?;
        let mut stmt = conn
            .prepare(
                "SELECT key, book_id, chapter_index, title, content, source_url, chapter_url, downloaded_at
                 FROM chapter_contents WHERE book_id = ?1 ORDER BY chapter_index ASC",
            )
            .map_err(|e| StorageErrorPayload::new("IO", "prepare_get_book_chapters", e.to_string()))?;

        let rows = stmt
            .query_map(params![book_id], |row| {
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
            .map_err(|e| StorageErrorPayload::new("IO", "query_book_chapters", e.to_string()))?;

        let mut list = Vec::new();
        for c in rows {
            list.push(
                c.map_err(|e| StorageErrorPayload::new("IO", "read_book_chapter", e.to_string()))?,
            );
        }
        Ok(list)
    }

    pub fn get_chapter_cache_summaries(
        &self,
    ) -> Result<Vec<ChapterCacheSummary>, StorageErrorPayload> {
        let conn = self.lock()?;
        let mut stmt = conn
            .prepare(
                "SELECT c.book_id, COUNT(*) AS chapter_count,
                        SUM(c.size_bytes) + COALESCE((SELECT SUM(i.size_bytes) FROM chapter_image_cache i WHERE i.book_id = c.book_id), 0) AS total_size,
                        COALESCE(b.name, '') AS book_name, COALESCE(b.author, '') AS book_author,
                        COALESCE((SELECT COUNT(*) FROM chapter_image_cache i WHERE i.book_id = c.book_id), 0) AS image_count,
                        COALESCE((SELECT SUM(i.size_bytes) FROM chapter_image_cache i WHERE i.book_id = c.book_id), 0) AS image_size
                 FROM chapter_contents c
                 LEFT JOIN books b ON c.book_id = b.id
                 GROUP BY c.book_id
                 ORDER BY COALESCE(b.name, c.book_id) COLLATE NOCASE ASC",
            )
            .map_err(|e| StorageErrorPayload::new("IO", "prepare_cache_summaries", e.to_string()))?;

        let rows = stmt
            .query_map([], |row| {
                let count: i64 = row.get(1)?;
                let size: i64 = row.get(2)?;
                let image_count: i64 = row.get(5)?;
                let image_size: i64 = row.get(6)?;
                Ok(ChapterCacheSummary {
                    book_id: row.get(0)?,
                    chapter_count: count.max(0) as usize,
                    size: size.max(0) as usize,
                    book_name: row.get(3)?,
                    book_author: row.get(4)?,
                    image_count: Some(image_count.max(0) as usize),
                    image_size: Some(image_size.max(0) as usize),
                })
            })
            .map_err(|e| StorageErrorPayload::new("IO", "query_cache_summaries", e.to_string()))?;

        let mut summaries = Vec::new();
        for s in rows {
            summaries.push(s.map_err(|e| {
                StorageErrorPayload::new("IO", "read_cache_summary", e.to_string())
            })?);
        }
        Ok(summaries)
    }

    pub fn delete_book_chapter_contents(&self, book_id: &str) -> Result<(), StorageErrorPayload> {
        let mut conn = self.lock()?;
        let tx = conn.transaction().map_err(|e| {
            StorageErrorPayload::new("TRANSACTION", "begin_delete_book_cache", e.to_string())
        })?;
        tx.execute(
            "DELETE FROM chapter_contents WHERE book_id = ?1",
            params![book_id],
        )
        .map_err(|e| StorageErrorPayload::new("IO", "delete_book_chapters", e.to_string()))?;
        tx.execute(
            "DELETE FROM chapter_image_cache WHERE book_id = ?1",
            params![book_id],
        )
        .map_err(|e| StorageErrorPayload::new("IO", "delete_book_images", e.to_string()))?;
        tx.commit().map_err(|e| {
            StorageErrorPayload::new("TRANSACTION", "commit_delete_book_cache", e.to_string())
        })?;
        Ok(())
    }

    pub fn clear_chapter_contents(&self) -> Result<(), StorageErrorPayload> {
        let mut conn = self.lock()?;
        let tx = conn.transaction().map_err(|e| {
            StorageErrorPayload::new("TRANSACTION", "begin_clear_chapter_cache", e.to_string())
        })?;
        tx.execute("DELETE FROM chapter_contents", [])
            .map_err(|e| StorageErrorPayload::new("IO", "clear_chapter_contents", e.to_string()))?;
        tx.execute("DELETE FROM chapter_image_cache", [])
            .map_err(|e| {
                StorageErrorPayload::new("IO", "clear_chapter_image_cache", e.to_string())
            })?;
        tx.commit().map_err(|e| {
            StorageErrorPayload::new("TRANSACTION", "commit_clear_chapter_cache", e.to_string())
        })?;
        Ok(())
    }

    pub fn clear_chapter_image_cache(
        &self,
        book_id: Option<&str>,
    ) -> Result<(), StorageErrorPayload> {
        let conn = self.lock()?;
        if let Some(id) = book_id {
            conn.execute(
                "DELETE FROM chapter_image_cache WHERE book_id = ?1",
                params![id],
            )
            .map_err(|e| {
                StorageErrorPayload::new("IO", "delete_book_chapter_images", e.to_string())
            })?;
        } else {
            conn.execute("DELETE FROM chapter_image_cache", [])
                .map_err(|e| {
                    StorageErrorPayload::new("IO", "clear_all_chapter_images", e.to_string())
                })?;
        }
        Ok(())
    }

    pub fn replace_chapter_images(
        &self,
        images: &[ChapterImageCacheRecord],
    ) -> Result<(), StorageErrorPayload> {
        let first = images.first().ok_or_else(|| {
            StorageErrorPayload::new("INVALID_DATA", "replace_chapter_images", "图片列表不能为空")
        })?;
        if images
            .iter()
            .any(|item| item.book_id != first.book_id || item.chapter_index != first.chapter_index)
        {
            return Err(StorageErrorPayload::new(
                "INVALID_DATA",
                "replace_chapter_images",
                "一次事务只能写入同一章节",
            ));
        }
        let mut conn = self.lock()?;
        let tx = conn.transaction().map_err(|e| {
            StorageErrorPayload::new("TRANSACTION", "begin_replace_chapter_images", e.to_string())
        })?;
        tx.execute(
            "DELETE FROM chapter_image_cache WHERE book_id = ?1 AND chapter_index = ?2",
            params![first.book_id, first.chapter_index],
        )
        .map_err(|e| StorageErrorPayload::new("IO", "delete_old_chapter_images", e.to_string()))?;
        for image in images {
            tx.execute(
                "INSERT INTO chapter_image_cache (
                    book_id, chapter_index, image_index, source_url, mime, content_hash, size_bytes, data
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![image.book_id, image.chapter_index, image.image_index, image.source_url,
                    image.mime, image.content_hash, image.data.len(), image.data],
            ).map_err(|e| StorageErrorPayload::new("IO", "insert_chapter_image", e.to_string()))?;
        }
        tx.commit().map_err(|e| {
            StorageErrorPayload::new(
                "TRANSACTION",
                "commit_replace_chapter_images",
                e.to_string(),
            )
        })?;
        Ok(())
    }

    pub fn get_chapter_images(
        &self,
        book_id: &str,
        chapter_index: i64,
    ) -> Result<Vec<ChapterImageCacheRecord>, StorageErrorPayload> {
        let conn = self.lock()?;
        let mut stmt = conn.prepare(
            "SELECT book_id, chapter_index, image_index, source_url, mime, content_hash, data
             FROM chapter_image_cache WHERE book_id = ?1 AND chapter_index = ?2 ORDER BY image_index ASC"
        ).map_err(|e| StorageErrorPayload::new("IO", "prepare_get_chapter_images", e.to_string()))?;
        let rows = stmt
            .query_map(params![book_id, chapter_index], |row| {
                Ok(ChapterImageCacheRecord {
                    book_id: row.get(0)?,
                    chapter_index: row.get(1)?,
                    image_index: row.get(2)?,
                    source_url: row.get(3)?,
                    mime: row.get(4)?,
                    content_hash: row.get(5)?,
                    data: row.get(6)?,
                })
            })
            .map_err(|e| StorageErrorPayload::new("IO", "query_chapter_images", e.to_string()))?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row.map_err(|e| {
                StorageErrorPayload::new("IO", "read_chapter_image", e.to_string())
            })?);
        }
        Ok(result)
    }

    // --- Settings ---

    pub fn save_settings(&self, key: &str, value: &str) -> Result<(), StorageErrorPayload> {
        let conn = self.lock()?;
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )
        .map_err(|e| StorageErrorPayload::new("IO", "save_settings", e.to_string()))?;
        Ok(())
    }

    pub fn load_settings(&self, key: &str) -> Result<Option<String>, StorageErrorPayload> {
        let conn = self.lock()?;
        let res: Option<String> = conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![key],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| StorageErrorPayload::new("IO", "load_settings", e.to_string()))?;
        Ok(res)
    }

    // --- Book Sources ---

    pub fn save_book_source(&self, source: &Value) -> Result<(), StorageErrorPayload> {
        let url = source["bookSourceUrl"].as_str().ok_or_else(|| {
            StorageErrorPayload::new("INVALID_DATA", "save_book_source", "缺少 bookSourceUrl")
        })?;
        let name = source["bookSourceName"].as_str().unwrap_or("");
        let group = source["bookSourceGroup"].as_str();
        let enabled = source["enabled"].as_bool().unwrap_or(true);
        let custom_order = source["customOrder"].as_i64().unwrap_or(0);
        let data_str = serde_json::to_string(source).map_err(|e| {
            StorageErrorPayload::new("INVALID_DATA", "serialize_book_source", e.to_string())
        })?;

        let conn = self.lock()?;
        conn.execute(
            "INSERT OR REPLACE INTO book_sources (
                book_source_url, name, rule_group, enabled, custom_order, data_json
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![url, name, group, enabled as i64, custom_order, data_str,],
        )
        .map_err(|e| StorageErrorPayload::new("IO", "save_book_source_row", e.to_string()))?;

        Ok(())
    }

    pub fn get_all_book_sources(&self) -> Result<Vec<Value>, StorageErrorPayload> {
        let conn = self.lock()?;
        let mut stmt = conn
            .prepare("SELECT data_json FROM book_sources ORDER BY custom_order ASC")
            .map_err(|e| {
                StorageErrorPayload::new("IO", "prepare_get_book_sources", e.to_string())
            })?;

        let rows = stmt
            .query_map([], |row| {
                let s: String = row.get(0)?;
                Ok(s)
            })
            .map_err(|e| StorageErrorPayload::new("IO", "query_book_sources", e.to_string()))?;

        let mut list = Vec::new();
        for item in rows {
            let s =
                item.map_err(|e| StorageErrorPayload::new("IO", "read_source_row", e.to_string()))?;
            let v: Value = serde_json::from_str(&s).map_err(|e| {
                StorageErrorPayload::new("INVALID_DATA", "parse_source_row", e.to_string())
            })?;
            list.push(v);
        }
        Ok(list)
    }

    pub fn delete_book_source(&self, book_source_url: &str) -> Result<(), StorageErrorPayload> {
        let conn = self.lock()?;
        conn.execute(
            "DELETE FROM book_sources WHERE book_source_url = ?1",
            params![book_source_url],
        )
        .map_err(|e| StorageErrorPayload::new("IO", "delete_book_source", e.to_string()))?;
        Ok(())
    }

    pub fn import_book_sources(&self, sources: &[Value]) -> Result<usize, StorageErrorPayload> {
        let mut conn = self.lock()?;
        let tx = conn.transaction().map_err(|e| {
            StorageErrorPayload::new("TRANSACTION", "begin_import_sources", e.to_string())
        })?;

        let mut count = 0;
        {
            let mut stmt = tx
                .prepare(
                    "INSERT OR REPLACE INTO book_sources (
                        book_source_url, name, rule_group, enabled, custom_order, data_json
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                )
                .map_err(|e| {
                    StorageErrorPayload::new("IO", "prepare_import_source", e.to_string())
                })?;

            for source in sources {
                if let Some(url) = source["bookSourceUrl"].as_str() {
                    let name = source["bookSourceName"].as_str().unwrap_or("");
                    let group = source["bookSourceGroup"].as_str();
                    let enabled = source["enabled"].as_bool().unwrap_or(true);
                    let custom_order = source["customOrder"].as_i64().unwrap_or(0);
                    let data_str = serde_json::to_string(source).unwrap_or_default();

                    stmt.execute(params![
                        url,
                        name,
                        group,
                        enabled as i64,
                        custom_order,
                        data_str,
                    ])
                    .map_err(|e| {
                        StorageErrorPayload::new("IO", "exec_import_source", e.to_string())
                    })?;
                    count += 1;
                }
            }
        }

        tx.commit().map_err(|e| {
            StorageErrorPayload::new("TRANSACTION", "commit_import_sources", e.to_string())
        })?;

        Ok(count)
    }

    // --- Remote Books ---

    pub fn save_remote_book(&self, id: &str, data: &Value) -> Result<(), StorageErrorPayload> {
        let data_str = serde_json::to_string(data).map_err(|e| {
            StorageErrorPayload::new("INVALID_DATA", "serialize_remote_book", e.to_string())
        })?;
        let conn = self.lock()?;
        conn.execute(
            "INSERT OR REPLACE INTO remote_books (id, data_json) VALUES (?1, ?2)",
            params![id, data_str],
        )
        .map_err(|e| StorageErrorPayload::new("IO", "save_remote_book", e.to_string()))?;
        Ok(())
    }

    pub fn get_all_remote_books(&self) -> Result<Vec<Value>, StorageErrorPayload> {
        let conn = self.lock()?;
        let mut stmt = conn
            .prepare("SELECT data_json FROM remote_books")
            .map_err(|e| {
                StorageErrorPayload::new("IO", "prepare_get_remote_books", e.to_string())
            })?;

        let rows = stmt
            .query_map([], |row| {
                let s: String = row.get(0)?;
                Ok(s)
            })
            .map_err(|e| StorageErrorPayload::new("IO", "query_remote_books", e.to_string()))?;

        let mut list = Vec::new();
        for item in rows {
            let s = item.map_err(|e| {
                StorageErrorPayload::new("IO", "read_remote_book_row", e.to_string())
            })?;
            let v: Value = serde_json::from_str(&s).map_err(|e| {
                StorageErrorPayload::new("INVALID_DATA", "parse_remote_book_row", e.to_string())
            })?;
            list.push(v);
        }
        Ok(list)
    }

    // --- App Preferences ---

    pub fn save_preference(&self, key: &str, value: &str) -> Result<(), StorageErrorPayload> {
        let conn = self.lock()?;
        conn.execute(
            "INSERT OR REPLACE INTO app_preferences (key, value) VALUES (?1, ?2)",
            params![key, value],
        )
        .map_err(|e| StorageErrorPayload::new("IO", "save_preference", e.to_string()))?;
        Ok(())
    }

    pub fn delete_preference(&self, key: &str) -> Result<(), StorageErrorPayload> {
        let conn = self.lock()?;
        conn.execute("DELETE FROM app_preferences WHERE key = ?1", params![key])
            .map_err(|e| StorageErrorPayload::new("IO", "delete_preference", e.to_string()))?;
        Ok(())
    }

    pub fn get_preference(&self, key: &str) -> Result<Option<String>, StorageErrorPayload> {
        let conn = self.lock()?;
        let res: Option<String> = conn
            .query_row(
                "SELECT value FROM app_preferences WHERE key = ?1",
                params![key],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| StorageErrorPayload::new("IO", "get_preference", e.to_string()))?;
        Ok(res)
    }

    pub fn get_all_preferences(&self) -> Result<HashMap<String, String>, StorageErrorPayload> {
        let conn = self.lock()?;
        let mut stmt = conn
            .prepare("SELECT key, value FROM app_preferences")
            .map_err(|e| StorageErrorPayload::new("IO", "prepare_get_all_prefs", e.to_string()))?;

        let rows = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|e| StorageErrorPayload::new("IO", "query_all_prefs", e.to_string()))?;

        let mut map = HashMap::new();
        for item in rows {
            let (k, v) =
                item.map_err(|e| StorageErrorPayload::new("IO", "read_pref_row", e.to_string()))?;
            map.insert(k, v);
        }
        Ok(map)
    }
}
