use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const HISTORY_LIMIT: usize = 20;
const MAX_RUN_BYTES: usize = 2 * 1024 * 1024;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceAuditStageResult {
    status: SourceAuditStageStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    field: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    duration_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    channel: Option<SourceAuditChannel>,
    #[serde(skip_serializing_if = "Option::is_none")]
    count: Option<u64>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
enum SourceAuditStageStatus {
    Untested,
    Running,
    Passed,
    Failed,
    Unsupported,
    NeedsAction,
    Skipped,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum SourceAuditChannel {
    Reqwest,
    Webview,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceAuditEntry {
    source_id: String,
    source_name: String,
    source_type: Option<i32>,
    capabilities: Vec<String>,
    stages: BTreeMap<String, SourceAuditStageResult>,
    verification_status: SourceAuditVerificationStatus,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
enum SourceAuditVerificationStatus {
    Untested,
    FixturePassed,
    LivePassed,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceAuditRun {
    schema_version: u32,
    engine_version: u32,
    mode: SourceAuditMode,
    started_at: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    completed_at: Option<u64>,
    status: SourceAuditRunStatus,
    entries: Vec<SourceAuditEntry>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum SourceAuditMode {
    Quick,
    Full,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum SourceAuditRunStatus {
    Running,
    Completed,
    Cancelled,
}

fn history_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("无法确定应用数据目录: {error}"))?;
    Ok(app_data_dir.join("source-audit").join("history-v1.json"))
}

fn validate_run(run: &SourceAuditRun) -> Result<(), String> {
    if run.schema_version != 1 {
        return Err("不支持的批测历史 schemaVersion".to_string());
    }
    if run.entries.len() > 10_000 {
        return Err("批测报告书源数量超过限制".to_string());
    }
    const ALLOWED_STAGES: &[&str] = &[
        "static", "login", "search", "explore", "bookInfo", "toc", "content", "image",
    ];
    for entry in &run.entries {
        if entry.source_id.is_empty() || entry.source_id.len() > 128 {
            return Err("批测报告包含无效 sourceId".to_string());
        }
        for (stage, result) in &entry.stages {
            if !ALLOWED_STAGES.contains(&stage.as_str()) {
                return Err("批测报告包含未知阶段".to_string());
            }
            if result.code.as_ref().is_some_and(|code| {
                code.len() > 128
                    || !code.chars().all(|character| {
                        character.is_ascii_uppercase()
                            || character.is_ascii_digit()
                            || "_-".contains(character)
                    })
            }) {
                return Err("批测报告包含无效错误码".to_string());
            }
            if result.field.as_ref().is_some_and(|field| {
                field.len() > 256
                    || field.contains("://")
                    || field.contains('\n')
                    || field.contains('\r')
            }) {
                return Err("批测报告字段定位信息未通过脱敏校验".to_string());
            }
        }
    }
    let encoded =
        serde_json::to_vec(run).map_err(|error| format!("批测报告序列化失败: {error}"))?;
    if encoded.len() > MAX_RUN_BYTES {
        return Err("批测报告超过 2 MiB 限制".to_string());
    }
    Ok(())
}

fn load_history_at(path: &Path) -> Vec<SourceAuditRun> {
    let Ok(bytes) = std::fs::read(path) else {
        return Vec::new();
    };
    let Ok(runs) = serde_json::from_slice::<Vec<SourceAuditRun>>(&bytes) else {
        return Vec::new();
    };
    runs.into_iter()
        .filter(|run| validate_run(run).is_ok())
        .take(HISTORY_LIMIT)
        .collect()
}

fn write_history_at(path: &Path, runs: &[SourceAuditRun]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "批测历史路径无父目录".to_string())?;
    std::fs::create_dir_all(parent).map_err(|error| format!("创建批测历史目录失败: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(parent, std::fs::Permissions::from_mode(0o700))
            .map_err(|error| format!("设置批测历史目录权限失败: {error}"))?;
    }

    let encoded =
        serde_json::to_vec_pretty(runs).map_err(|error| format!("批测历史序列化失败: {error}"))?;
    let temporary = parent.join(format!(".history-v1.{}.tmp", std::process::id()));
    std::fs::write(&temporary, encoded)
        .map_err(|error| format!("写入批测临时历史失败: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&temporary, std::fs::Permissions::from_mode(0o600))
            .map_err(|error| format!("设置批测历史权限失败: {error}"))?;
    }
    std::fs::rename(&temporary, path).map_err(|error| format!("原子保存批测历史失败: {error}"))?;
    Ok(())
}

fn save_run_at(path: &Path, run: SourceAuditRun) -> Result<Vec<SourceAuditRun>, String> {
    validate_run(&run)?;
    let mut history = load_history_at(path);
    history.insert(0, run);
    history.truncate(HISTORY_LIMIT);
    write_history_at(path, &history)?;
    Ok(history)
}

#[tauri::command]
pub fn load_source_audit_history(app: AppHandle) -> Result<Vec<SourceAuditRun>, String> {
    Ok(load_history_at(&history_path(&app)?))
}

#[tauri::command]
pub fn save_source_audit_run(
    app: AppHandle,
    run: SourceAuditRun,
) -> Result<Vec<SourceAuditRun>, String> {
    save_run_at(&history_path(&app)?, run)
}

#[tauri::command]
pub fn clear_source_audit_history(app: AppHandle) -> Result<(), String> {
    let path = history_path(&app)?;
    if path.exists() {
        std::fs::remove_file(path).map_err(|error| format!("清空批测历史失败: {error}"))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temporary_history_path(name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir()
            .join(format!("legado-source-audit-{name}-{nonce}"))
            .join("history-v1.json")
    }

    fn run(index: u64) -> SourceAuditRun {
        serde_json::from_value(json!({
            "schemaVersion": 1,
            "engineVersion": 2,
            "mode": "quick",
            "startedAt": index,
            "completedAt": index + 1,
            "status": "completed",
            "entries": [{
                "sourceId": format!("hash-{index}"),
                "sourceName": "脱敏测试源",
                "sourceType": 0,
                "capabilities": ["xpath"],
                "stages": { "search": { "status": "passed", "durationMs": 1, "channel": "reqwest", "count": 1 } },
                "verificationStatus": "live-passed"
            }]
        })).unwrap()
    }

    #[test]
    fn atomically_saves_and_truncates_to_twenty_runs() {
        let path = temporary_history_path("truncate");
        for index in 0..25 {
            save_run_at(&path, run(index)).unwrap();
        }
        let history = load_history_at(&path);
        assert_eq!(history.len(), 20);
        assert_eq!(history[0].started_at, 24);
        assert_eq!(history[19].started_at, 5);
        assert!(!path
            .parent()
            .unwrap()
            .join(format!(".history-v1.{}.tmp", std::process::id()))
            .exists());
        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn damaged_history_recovers_on_next_save() {
        let path = temporary_history_path("corrupt");
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, b"not-json").unwrap();
        assert!(load_history_at(&path).is_empty());
        let history = save_run_at(&path, run(7)).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(load_history_at(&path)[0].started_at, 7);
        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn schema_rejects_sensitive_or_unknown_fields() {
        let value = json!({
            "schemaVersion": 1,
            "engineVersion": 2,
            "mode": "quick",
            "startedAt": 1,
            "status": "completed",
            "entries": [],
            "cookie": "secret"
        });
        assert!(serde_json::from_value::<SourceAuditRun>(value).is_err());

        let mut report = run(1);
        report
            .entries[0]
            .stages
            .get_mut("search")
            .unwrap()
            .field = Some("https://secret.invalid/path".to_string());
        assert!(validate_run(&report).unwrap_err().contains("脱敏校验"));
    }

    #[test]
    fn rejects_oversized_reports() {
        let mut oversized = run(1);
        oversized.entries[0].source_name = "x".repeat(MAX_RUN_BYTES + 1);
        assert!(validate_run(&oversized).unwrap_err().contains("2 MiB"));
    }

    #[cfg(unix)]
    #[test]
    fn history_is_owner_readable_and_writable_only() {
        use std::os::unix::fs::PermissionsExt;
        let path = temporary_history_path("permissions");
        save_run_at(&path, run(1)).unwrap();
        assert_eq!(
            std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
        assert_eq!(
            std::fs::metadata(path.parent().unwrap())
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o700
        );
        let _ = std::fs::remove_dir_all(path.parent().unwrap());
    }
}
