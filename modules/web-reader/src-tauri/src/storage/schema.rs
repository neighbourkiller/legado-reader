use rusqlite::Connection;
use crate::storage::models::StorageErrorPayload;

pub const CURRENT_DB_VERSION: i32 = 2;

pub fn initialize_schema(conn: &mut Connection) -> std::result::Result<(), StorageErrorPayload> {
    // 1. 设置 PRAGMA
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA foreign_keys = ON;
         PRAGMA busy_timeout = 5000;"
    )
    .map_err(|e| StorageErrorPayload::new("INIT_FAILED", "set_pragma", e.to_string()))?;

    // 2. 读取现有 user_version
    let existing_version: i32 = conn
        .query_row("PRAGMA user_version;", [], |row| row.get(0))
        .map_err(|e| StorageErrorPayload::new("INIT_FAILED", "get_user_version", e.to_string()))?;

    if existing_version > CURRENT_DB_VERSION {
        return Err(StorageErrorPayload::new(
            "INIT_FAILED",
            "schema_migration",
            format!(
                "数据库版本 ({existing_version}) 高于程序支持版本 ({CURRENT_DB_VERSION})"
            ),
        ));
    }

    if existing_version < 1 {
        let tx = conn
            .transaction()
            .map_err(|e| StorageErrorPayload::new("TRANSACTION", "begin_migration_v1", e.to_string()))?;

        tx.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS books (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                author TEXT NOT NULL DEFAULT '',
                format TEXT NOT NULL,
                cover TEXT,
                total_chapters INTEGER NOT NULL DEFAULT 0,
                current_chapter INTEGER NOT NULL DEFAULT 0,
                current_progress REAL NOT NULL DEFAULT 0.0,
                last_read_time INTEGER NOT NULL DEFAULT 0,
                file_size INTEGER NOT NULL DEFAULT 0,
                meta_json TEXT NOT NULL,
                chapters_json TEXT NOT NULL,
                file_data BLOB
            );
            CREATE INDEX IF NOT EXISTS idx_books_last_read ON books(last_read_time DESC);
            CREATE INDEX IF NOT EXISTS idx_books_name ON books(name COLLATE NOCASE);

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS book_sources (
                book_source_url TEXT PRIMARY KEY,
                name TEXT NOT NULL DEFAULT '',
                rule_group TEXT,
                enabled INTEGER NOT NULL DEFAULT 1,
                custom_order INTEGER NOT NULL DEFAULT 0,
                data_json TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_book_sources_order ON book_sources(custom_order ASC);

            CREATE TABLE IF NOT EXISTS remote_books (
                id TEXT PRIMARY KEY,
                data_json TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS chapter_contents (
                key TEXT PRIMARY KEY,
                book_id TEXT NOT NULL,
                chapter_index INTEGER NOT NULL,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                source_url TEXT,
                chapter_url TEXT,
                downloaded_at INTEGER NOT NULL,
                size_bytes INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_chapter_contents_book ON chapter_contents(book_id, chapter_index ASC);

            CREATE TABLE IF NOT EXISTS bookmarks (
                id TEXT PRIMARY KEY,
                book_id TEXT NOT NULL,
                book_name TEXT NOT NULL,
                book_author TEXT NOT NULL,
                chapter_index INTEGER NOT NULL,
                chapter_pos INTEGER NOT NULL,
                start_offset INTEGER NOT NULL DEFAULT 0,
                end_offset INTEGER NOT NULL DEFAULT 0,
                chapter_title TEXT NOT NULL,
                content TEXT NOT NULL,
                note TEXT,
                android_chapter_pos INTEGER,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_bookmarks_book ON bookmarks(book_id, chapter_index ASC, chapter_pos ASC, start_offset ASC);
            CREATE INDEX IF NOT EXISTS idx_bookmarks_created ON bookmarks(created_at DESC);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_bookmarks_anchor ON bookmarks(book_id, chapter_index, chapter_pos, start_offset);

            CREATE TABLE IF NOT EXISTS highlights (
                id TEXT PRIMARY KEY,
                book_id TEXT NOT NULL,
                book_name TEXT NOT NULL,
                book_author TEXT NOT NULL,
                book_url TEXT,
                chapter_url TEXT,
                chapter_index INTEGER NOT NULL,
                chapter_title TEXT NOT NULL,
                start_offset INTEGER NOT NULL,
                end_offset INTEGER NOT NULL,
                start_paragraph INTEGER NOT NULL,
                end_paragraph INTEGER NOT NULL,
                text TEXT NOT NULL,
                style_json TEXT NOT NULL,
                note TEXT,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_highlights_lookup ON highlights(book_id, chapter_index ASC, start_offset ASC);

            CREATE TABLE IF NOT EXISTS replace_rules (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                rule_group TEXT,
                pattern TEXT NOT NULL,
                replacement TEXT NOT NULL,
                scope TEXT,
                scope_title INTEGER NOT NULL DEFAULT 0,
                scope_source INTEGER NOT NULL DEFAULT 0,
                scope_content INTEGER NOT NULL DEFAULT 1,
                exclude_scope TEXT,
                is_enabled INTEGER NOT NULL DEFAULT 1,
                is_regex INTEGER NOT NULL DEFAULT 0,
                timeout_ms INTEGER NOT NULL DEFAULT 3000,
                rule_order INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_replace_rules_order ON replace_rules(rule_order ASC, id ASC);

            CREATE TABLE IF NOT EXISTS reading_records (
                book_id TEXT PRIMARY KEY,
                book_name TEXT NOT NULL,
                book_author TEXT NOT NULL,
                read_time INTEGER NOT NULL DEFAULT 0,
                last_read INTEGER NOT NULL DEFAULT 0,
                devices_json TEXT NOT NULL DEFAULT '{}'
            );
            CREATE INDEX IF NOT EXISTS idx_reading_records_last_read ON reading_records(last_read DESC);

            CREATE TABLE IF NOT EXISTS app_preferences (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            PRAGMA user_version = 1;
            "
        )
        .map_err(|e| StorageErrorPayload::new("INIT_FAILED", "apply_ddl_v1", e.to_string()))?;

        tx.commit()
            .map_err(|e| StorageErrorPayload::new("TRANSACTION", "commit_v1", e.to_string()))?;
    }

    if existing_version < 2 {
        let tx = conn.transaction()
            .map_err(|e| StorageErrorPayload::new("TRANSACTION", "begin_migration_v2", e.to_string()))?;
        tx.execute_batch(
            "CREATE TABLE IF NOT EXISTS chapter_image_cache (
                book_id TEXT NOT NULL,
                chapter_index INTEGER NOT NULL,
                image_index INTEGER NOT NULL,
                source_url TEXT NOT NULL,
                mime TEXT NOT NULL,
                content_hash TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                data BLOB NOT NULL,
                PRIMARY KEY (book_id, chapter_index, image_index)
            );
            CREATE INDEX IF NOT EXISTS idx_chapter_image_cache_book
                ON chapter_image_cache(book_id, chapter_index, image_index);
            PRAGMA user_version = 2;"
        ).map_err(|e| StorageErrorPayload::new("INIT_FAILED", "apply_ddl_v2", e.to_string()))?;
        tx.commit()
            .map_err(|e| StorageErrorPayload::new("TRANSACTION", "commit_v2", e.to_string()))?;
    }

    Ok(())
}
