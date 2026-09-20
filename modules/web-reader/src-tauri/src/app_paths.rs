use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

#[cfg(any(test, all(target_os = "windows", not(debug_assertions))))]
use std::path::Path;
#[cfg(any(test, all(target_os = "windows", not(debug_assertions))))]
use std::time::Duration;

#[cfg(any(test, all(target_os = "windows", not(debug_assertions))))]
use rusqlite::{backup::Backup, Connection, OpenFlags};

const PRODUCTION_DATABASE_FILE: &str = "legado_reader.db";
const DEVELOPMENT_DATABASE_FILE: &str = "legado_reader.dev.db";
#[cfg(any(test, all(target_os = "windows", not(debug_assertions))))]
const PORTABLE_DATA_DIRECTORY: &str = "data";
#[cfg(any(test, all(target_os = "windows", not(debug_assertions))))]
const MIGRATION_MARKER_FILE: &str = ".legado-data-migrated-v1";
#[cfg(any(test, all(target_os = "windows", not(debug_assertions))))]
const MIGRATION_TEMP_DATABASE_FILE: &str = ".legado_reader.migration.tmp.db";

pub fn database_filename() -> &'static str {
    if cfg!(debug_assertions) {
        DEVELOPMENT_DATABASE_FILE
    } else {
        PRODUCTION_DATABASE_FILE
    }
}

pub fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    #[cfg(all(target_os = "windows", not(debug_assertions)))]
    {
        let _ = app;
        let executable = std::env::current_exe()
            .map_err(|error| format!("无法确定客户端可执行文件路径: {error}"))?;
        executable_directory(&executable).map(|directory| directory.join(PORTABLE_DATA_DIRECTORY))
    }

    #[cfg(not(all(target_os = "windows", not(debug_assertions))))]
    {
        app.path()
            .app_data_dir()
            .map_err(|error| format!("无法确定应用数据目录: {error}"))
    }
}

pub fn prepare_app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app_data_dir(app)?;
    fs::create_dir_all(&directory)
        .map_err(|error| format!("无法创建应用数据目录 {}: {error}", directory.display()))?;

    #[cfg(all(target_os = "windows", not(debug_assertions)))]
    {
        let executable_directory = directory
            .parent()
            .ok_or_else(|| format!("客户端数据目录没有父目录: {}", directory.display()))?;
        migrate_legacy_app_data(executable_directory, &directory)?;

        let legacy_directory = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("无法确定旧应用数据目录: {error}"))?;
        migrate_legacy_app_data(&legacy_directory, &directory)?;
    }

    Ok(directory)
}

#[cfg(any(test, all(target_os = "windows", not(debug_assertions))))]
fn executable_directory(executable: &Path) -> Result<PathBuf, String> {
    executable
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .map(Path::to_path_buf)
        .ok_or_else(|| format!("客户端可执行文件没有父目录: {}", executable.display()))
}

#[cfg(any(test, all(target_os = "windows", not(debug_assertions))))]
fn migrate_legacy_app_data(source: &Path, destination: &Path) -> Result<(), String> {
    if source == destination || !source.is_dir() {
        return Ok(());
    }

    let marker = destination.join(MIGRATION_MARKER_FILE);
    if marker.exists() {
        return Ok(());
    }

    let source_database = source.join(PRODUCTION_DATABASE_FILE);
    let source_cache = source.join("source_script_cache.json");
    let source_audit_history = source.join("source-audit").join("history-v1.json");
    let source_webdav_config = source.join("webdav.json");
    if !source_database.is_file()
        && !source_cache.is_file()
        && !source_audit_history.is_file()
        && !source_webdav_config.is_file()
    {
        return Ok(());
    }

    migrate_database_if_missing(
        &source_database,
        &destination.join(PRODUCTION_DATABASE_FILE),
    )?;
    copy_file_if_missing(&source_cache, &destination.join("source_script_cache.json"))?;
    copy_file_if_missing(
        &source_audit_history,
        &destination.join("source-audit").join("history-v1.json"),
    )?;
    copy_file_if_missing(&source_webdav_config, &destination.join("webdav.json"))?;

    fs::write(&marker, b"1\n")
        .map_err(|error| format!("无法写入客户端数据迁移标记 {}: {error}", marker.display()))
}

#[cfg(any(test, all(target_os = "windows", not(debug_assertions))))]
fn migrate_database_if_missing(source: &Path, destination: &Path) -> Result<(), String> {
    if !source.is_file() || destination.exists() {
        return Ok(());
    }

    let parent = destination
        .parent()
        .ok_or_else(|| format!("数据库目标路径没有父目录: {}", destination.display()))?;
    let temporary = parent.join(MIGRATION_TEMP_DATABASE_FILE);
    if temporary.exists() {
        fs::remove_file(&temporary).map_err(|error| {
            format!(
                "无法清理上次遗留的数据库迁移临时文件 {}: {error}",
                temporary.display()
            )
        })?;
    }

    let backup_result = (|| -> Result<(), String> {
        let source_connection =
            Connection::open_with_flags(source, OpenFlags::SQLITE_OPEN_READ_WRITE)
                .map_err(|error| format!("无法打开旧客户端数据库 {}: {error}", source.display()))?;
        let mut destination_connection = Connection::open(&temporary).map_err(|error| {
            format!(
                "无法创建数据库迁移临时文件 {}: {error}",
                temporary.display()
            )
        })?;
        let backup = Backup::new(&source_connection, &mut destination_connection)
            .map_err(|error| format!("无法初始化旧客户端数据库迁移: {error}"))?;
        backup
            .run_to_completion(500, Duration::from_millis(10), None)
            .map_err(|error| format!("迁移旧客户端数据库失败: {error}"))
    })();

    if let Err(error) = backup_result {
        let _ = fs::remove_file(&temporary);
        return Err(error);
    }

    fs::rename(&temporary, destination).map_err(|error| {
        let _ = fs::remove_file(&temporary);
        format!(
            "无法启用迁移后的客户端数据库 {}: {error}",
            destination.display()
        )
    })
}

#[cfg(any(test, all(target_os = "windows", not(debug_assertions))))]
fn copy_file_if_missing(source: &Path, destination: &Path) -> Result<(), String> {
    if !source.is_file() || destination.exists() {
        return Ok(());
    }

    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("无法创建客户端数据目录 {}: {error}", parent.display()))?;
    }
    fs::copy(source, destination).map_err(|error| {
        format!(
            "无法迁移客户端数据文件 {} 到 {}: {error}",
            source.display(),
            destination.display()
        )
    })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temporary_directory(name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "legado-app-paths-{name}-{}-{nonce}",
            std::process::id()
        ))
    }

    #[test]
    fn executable_directory_should_place_data_in_sibling_data_directory() {
        let executable = Path::new(r"C:\portable\legado-reader.exe");

        let directory = executable_directory(executable)
            .unwrap()
            .join(PORTABLE_DATA_DIRECTORY);

        assert_eq!(directory, PathBuf::from(r"C:\portable\data"));
    }

    #[test]
    fn migrate_legacy_app_data_should_copy_database_and_auxiliary_files() {
        let root = temporary_directory("migration");
        let source = root.join("legacy");
        let destination = root.join("portable");
        fs::create_dir_all(source.join("source-audit")).unwrap();
        fs::create_dir_all(&destination).unwrap();

        let source_database = source.join(PRODUCTION_DATABASE_FILE);
        let connection = Connection::open(&source_database).unwrap();
        connection
            .execute_batch(
                "PRAGMA journal_mode=WAL;
                 PRAGMA wal_autocheckpoint=0;
                 CREATE TABLE migration_test (value TEXT NOT NULL);
                 INSERT INTO migration_test VALUES ('preserved');",
            )
            .unwrap();
        fs::write(source.join("source_script_cache.json"), b"cache").unwrap();
        fs::write(
            source.join("source-audit").join("history-v1.json"),
            b"history",
        )
        .unwrap();
        fs::write(source.join("webdav.json"), b"webdav").unwrap();

        migrate_legacy_app_data(&source, &destination).unwrap();
        drop(connection);

        let migrated = Connection::open(destination.join(PRODUCTION_DATABASE_FILE)).unwrap();
        let value: String = migrated
            .query_row("SELECT value FROM migration_test", [], |row| row.get(0))
            .unwrap();
        assert_eq!(value, "preserved");
        assert_eq!(
            fs::read(destination.join("source_script_cache.json")).unwrap(),
            b"cache"
        );
        assert_eq!(
            fs::read(destination.join("source-audit").join("history-v1.json")).unwrap(),
            b"history"
        );
        assert_eq!(
            fs::read(destination.join("webdav.json")).unwrap(),
            b"webdav"
        );
        assert!(destination.join(MIGRATION_MARKER_FILE).is_file());

        drop(migrated);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn migrate_legacy_app_data_should_not_overwrite_existing_database() {
        let root = temporary_directory("preserve-existing");
        let source = root.join("legacy");
        let destination = root.join("portable");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&destination).unwrap();
        fs::write(source.join(PRODUCTION_DATABASE_FILE), b"legacy").unwrap();
        fs::write(destination.join(PRODUCTION_DATABASE_FILE), b"current").unwrap();

        migrate_legacy_app_data(&source, &destination).unwrap();

        assert_eq!(
            fs::read(destination.join(PRODUCTION_DATABASE_FILE)).unwrap(),
            b"current"
        );

        let _ = fs::remove_dir_all(root);
    }
}
