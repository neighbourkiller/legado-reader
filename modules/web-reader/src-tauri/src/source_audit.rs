use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::Duration;
use tauri::{AppHandle, Manager};

const HISTORY_LIMIT: usize = 20;
const MAX_RUN_BYTES: usize = 2 * 1024 * 1024;
const MAX_DIAGNOSTICS_BYTES: usize = 64 * 1024 * 1024;
const FRONTEND_START_TIMEOUT: Duration = Duration::from_secs(45);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceAuditCliOptions {
    output_path: String,
    db_path: Option<String>,
    diagnostics_dir: Option<String>,
    replay_path: Option<String>,
    mode: SourceAuditMode,
    concurrency: u8,
    scope: String,
}

#[derive(Clone, Debug, Default)]
pub struct SourceAuditCliState {
    options: Option<SourceAuditCliOptions>,
    frontend_started: Arc<AtomicBool>,
}

impl SourceAuditCliState {
    pub fn requires_internal_storage(&self) -> bool {
        match &self.options {
            None => true,
            Some(options) => options.db_path.is_none() && options.replay_path.is_none(),
        }
    }
}

fn option_value(args: &[String], name: &str) -> Result<Option<String>, String> {
    let mut found = None;
    let prefix = format!("{name}=");
    for (index, argument) in args.iter().enumerate() {
        let value = if argument == name {
            Some(
                args.get(index + 1)
                    .ok_or_else(|| format!("{name} 缺少参数值"))?
                    .clone(),
            )
        } else {
            argument.strip_prefix(&prefix).map(str::to_string)
        };
        if let Some(value) = value {
            if found.replace(value).is_some() {
                return Err(format!("{name} 不能重复"));
            }
        }
    }
    Ok(found)
}

fn absolute_path(value: String, name: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(value);
    if !path.is_absolute() {
        return Err(format!("{name} 必须是绝对路径"));
    }
    Ok(path)
}

fn paths_alias(left: &Path, right: &Path) -> bool {
    if left == right {
        return true;
    }
    match (left.canonicalize(), right.canonicalize()) {
        (Ok(left), Ok(right)) => left == right,
        _ => false,
    }
}

pub fn parse_source_audit_cli_options(args: &[String]) -> Result<SourceAuditCliState, String> {
    let Some(output) = option_value(args, "--source-audit-output")? else {
        return Ok(SourceAuditCliState::default());
    };
    let output_path = absolute_path(output, "--source-audit-output")?;
    if output_path.is_dir() {
        return Err("--source-audit-output 不能指向目录".to_string());
    }
    let db_path = option_value(args, "--source-audit-db")?
        .map(|value| absolute_path(value, "--source-audit-db"))
        .transpose()?;
    if db_path.as_ref().is_some_and(|path| !path.is_file()) {
        return Err("--source-audit-db 指向的数据库不存在".to_string());
    }
    let diagnostics_dir = option_value(args, "--source-audit-diagnostics")?
        .map(|value| absolute_path(value, "--source-audit-diagnostics"))
        .transpose()?;
    let replay_path = option_value(args, "--source-audit-replay")?
        .map(|value| absolute_path(value, "--source-audit-replay"))
        .transpose()?;
    if replay_path.as_ref().is_some_and(|path| !path.is_file()) {
        return Err("--source-audit-replay 指向的诊断包不存在".to_string());
    }
    if db_path
        .as_ref()
        .is_some_and(|path| paths_alias(path, &output_path))
    {
        return Err("批测报告不能覆盖输入数据库".to_string());
    }
    if replay_path
        .as_ref()
        .is_some_and(|path| paths_alias(path, &output_path))
    {
        return Err("重放报告不能覆盖输入诊断包".to_string());
    }
    let mode = match option_value(args, "--source-audit-mode")?
        .as_deref()
        .unwrap_or("quick")
    {
        "quick" => SourceAuditMode::Quick,
        "full" => SourceAuditMode::Full,
        value => return Err(format!("不支持的批测模式: {value}")),
    };
    let concurrency = option_value(args, "--source-audit-concurrency")?
        .unwrap_or_else(|| "1".to_string())
        .parse::<u8>()
        .map_err(|_| "--source-audit-concurrency 必须是 1-3".to_string())?;
    if !(1..=3).contains(&concurrency) {
        return Err("--source-audit-concurrency 必须是 1-3".to_string());
    }
    let scope = option_value(args, "--source-audit-scope")?.unwrap_or_else(|| "all".to_string());
    if !matches!(scope.as_str(), "all" | "enabled" | "text" | "image") {
        return Err(format!("不支持的批测范围: {scope}"));
    }
    Ok(SourceAuditCliState {
        options: Some(SourceAuditCliOptions {
            output_path: output_path.to_string_lossy().into_owned(),
            db_path: db_path.map(|path| path.to_string_lossy().into_owned()),
            diagnostics_dir: diagnostics_dir.map(|path| path.to_string_lossy().into_owned()),
            replay_path: replay_path.map(|path| path.to_string_lossy().into_owned()),
            mode,
            concurrency,
            scope,
        }),
        ..SourceAuditCliState::default()
    })
}

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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    scope: Option<String>,
    started_at: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    completed_at: Option<u64>,
    status: SourceAuditRunStatus,
    entries: Vec<SourceAuditEntry>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    summary: Option<Value>,
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

fn write_private_file(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "输出路径没有父目录".to_string())?;
    let parent_existed = parent.exists();
    std::fs::create_dir_all(parent).map_err(|error| format!("创建输出目录失败: {error}"))?;
    #[cfg(unix)]
    if !parent_existed {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(parent, std::fs::Permissions::from_mode(0o700))
            .map_err(|error| format!("设置输出目录权限失败: {error}"))?;
    }
    let temporary = parent.join(format!(
        ".{}.{}.tmp",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("audit"),
        std::process::id()
    ));
    let mut options = OpenOptions::new();
    options.create(true).truncate(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(&temporary)
        .map_err(|error| format!("创建临时输出失败: {error}"))?;
    file.write_all(bytes)
        .map_err(|error| format!("写入临时输出失败: {error}"))?;
    file.sync_all()
        .map_err(|error| format!("同步临时输出失败: {error}"))?;
    std::fs::rename(&temporary, path).map_err(|error| format!("原子保存输出失败: {error}"))?;
    Ok(())
}

fn ensure_private_directory(path: &Path) -> Result<(), String> {
    let existed = path.exists();
    std::fs::create_dir_all(path).map_err(|error| format!("创建诊断目录失败: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if !existed {
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700))
                .map_err(|error| format!("设置诊断目录权限失败: {error}"))?;
        }
        let mode = std::fs::metadata(path)
            .map_err(|error| format!("读取诊断目录权限失败: {error}"))?
            .permissions()
            .mode()
            & 0o077;
        if mode != 0 {
            return Err("诊断目录不能允许组用户或其他用户访问，请使用权限 0700 的目录".to_string());
        }
    }
    Ok(())
}

fn load_sources_from_db(path: &Path) -> Result<Vec<Value>, String> {
    use rusqlite::{Connection, OpenFlags};
    let connection = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|error| format!("只读打开批测数据库失败: {error}"))?;
    let mut statement = connection
        .prepare("SELECT data_json FROM book_sources ORDER BY custom_order ASC, rowid ASC")
        .map_err(|error| format!("读取书源表失败: {error}"))?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| format!("查询书源失败: {error}"))?;
    let mut sources = Vec::new();
    for row in rows {
        let json = row.map_err(|error| format!("读取书源记录失败: {error}"))?;
        sources
            .push(serde_json::from_str(&json).map_err(|error| format!("书源 JSON 无效: {error}"))?);
    }
    Ok(sources)
}

#[tauri::command]
pub fn get_source_audit_cli_options(
    state: tauri::State<'_, SourceAuditCliState>,
) -> Option<SourceAuditCliOptions> {
    state.options.clone()
}

#[tauri::command]
pub fn mark_source_audit_cli_started(
    state: tauri::State<'_, SourceAuditCliState>,
) -> Result<(), String> {
    if state.options.is_none() {
        return Err("当前未启用命令行批测".to_string());
    }
    state.frontend_started.store(true, Ordering::Release);
    Ok(())
}

#[tauri::command]
pub fn load_source_audit_cli_sources(
    state: tauri::State<'_, SourceAuditCliState>,
) -> Result<Vec<Value>, String> {
    let options = state
        .options
        .as_ref()
        .ok_or_else(|| "当前未启用命令行批测".to_string())?;
    let path = options
        .db_path
        .as_ref()
        .ok_or_else(|| "命令行批测未指定外部数据库".to_string())?;
    load_sources_from_db(Path::new(path))
}

#[tauri::command]
pub fn load_source_audit_replay_bundle(
    state: tauri::State<'_, SourceAuditCliState>,
) -> Result<Value, String> {
    let options = state
        .options
        .as_ref()
        .ok_or_else(|| "当前未启用命令行批测".to_string())?;
    let path = options
        .replay_path
        .as_ref()
        .ok_or_else(|| "命令行未指定重放诊断包".to_string())?;
    let metadata =
        std::fs::metadata(path).map_err(|error| format!("读取诊断包信息失败: {error}"))?;
    if metadata.len() > MAX_DIAGNOSTICS_BYTES as u64 {
        return Err("诊断包超过 64 MiB 限制".to_string());
    }
    let bytes = std::fs::read(path).map_err(|error| format!("读取诊断包失败: {error}"))?;
    serde_json::from_slice(&bytes).map_err(|error| format!("诊断包 JSON 无效: {error}"))
}

#[tauri::command]
pub fn complete_source_audit_replay(
    app: AppHandle,
    state: tauri::State<'_, SourceAuditCliState>,
    result: Value,
) -> Result<(), String> {
    let options = state
        .options
        .as_ref()
        .ok_or_else(|| "当前未启用命令行批测".to_string())?;
    let bytes = serde_json::to_vec_pretty(&result)
        .map_err(|error| format!("序列化重放结果失败: {error}"))?;
    if bytes.len() > MAX_RUN_BYTES {
        return Err("重放结果超过 2 MiB 限制".to_string());
    }
    write_private_file(Path::new(&options.output_path), &bytes)?;
    let has_failures = result
        .get("results")
        .and_then(Value::as_array)
        .is_some_and(|items| {
            items
                .iter()
                .any(|item| item.get("status").and_then(Value::as_str) == Some("failed"))
        });
    app.exit(if has_failures { 1 } else { 0 });
    Ok(())
}

#[tauri::command]
pub fn complete_source_audit_cli(
    app: AppHandle,
    state: tauri::State<'_, SourceAuditCliState>,
    run: SourceAuditRun,
    diagnostics: Option<Value>,
) -> Result<(), String> {
    let options = state
        .options
        .as_ref()
        .ok_or_else(|| "当前未启用命令行批测".to_string())?;
    validate_run(&run)?;
    let report =
        serde_json::to_vec_pretty(&run).map_err(|error| format!("序列化批测报告失败: {error}"))?;
    write_private_file(Path::new(&options.output_path), &report)?;
    if let (Some(directory), Some(diagnostics)) = (&options.diagnostics_dir, diagnostics) {
        ensure_private_directory(Path::new(directory))?;
        let encoded = serde_json::to_vec_pretty(&diagnostics)
            .map_err(|error| format!("序列化诊断包失败: {error}"))?;
        if encoded.len() > MAX_DIAGNOSTICS_BYTES {
            return Err("诊断包超过 64 MiB 限制".to_string());
        }
        write_private_file(&Path::new(directory).join("diagnostics-v1.json"), &encoded)?;
    }
    let has_failures = run.entries.iter().any(|entry| {
        entry
            .stages
            .values()
            .any(|stage| matches!(stage.status, SourceAuditStageStatus::Failed))
    });
    app.exit(if has_failures { 1 } else { 0 });
    Ok(())
}

fn write_source_audit_error(
    state: &SourceAuditCliState,
    code: &str,
    message: &str,
) -> Result<(), String> {
    let options = state
        .options
        .as_ref()
        .ok_or_else(|| "当前未启用命令行批测".to_string())?;
    let payload = serde_json::json!({
        "schemaVersion": 1,
        "kind": "source-audit-error",
        "code": code,
        "message": message.chars().take(2_000).collect::<String>(),
    });
    let encoded = serde_json::to_vec_pretty(&payload).map_err(|error| error.to_string())?;
    write_private_file(Path::new(&options.output_path), &encoded)
}

pub fn start_source_audit_cli_watchdog(app: AppHandle, state: SourceAuditCliState) {
    if state.options.is_none() {
        return;
    }
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(FRONTEND_START_TIMEOUT).await;
        if state.frontend_started.load(Ordering::Acquire) {
            return;
        }
        let _ = write_source_audit_error(
            &state,
            "FRONTEND_START_TIMEOUT",
            "书源审计前端未在 45 秒内完成启动接管；可能是 Vite 不可用、端口冲突或模块加载失败",
        );
        app.exit(2);
    });
}

#[tauri::command]
pub fn fail_source_audit_cli(
    app: AppHandle,
    state: tauri::State<'_, SourceAuditCliState>,
    message: String,
) -> Result<(), String> {
    write_source_audit_error(&state, "FRONTEND_BOOTSTRAP_FAILED", &message)?;
    app.exit(2);
    Ok(())
}

#[tauri::command]
pub fn exit_source_audit_cli(app: AppHandle, code: i32) -> Result<(), String> {
    if !(1..=2).contains(&code) {
        return Err("批测退出码只能是 1 或 2".to_string());
    }
    app.exit(code);
    Ok(())
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
        report.entries[0].stages.get_mut("search").unwrap().field =
            Some("https://secret.invalid/path".to_string());
        assert!(validate_run(&report).unwrap_err().contains("脱敏校验"));
    }

    #[test]
    fn parses_strict_cli_options_and_rejects_relative_paths() {
        let args = vec![
            "legado-reader".to_string(),
            "--source-audit-output".to_string(),
            "/tmp/report.json".to_string(),
            "--source-audit-mode=full".to_string(),
            "--source-audit-concurrency".to_string(),
            "3".to_string(),
            "--source-audit-scope=image".to_string(),
        ];
        let state = parse_source_audit_cli_options(&args).unwrap();
        let options = state.options.unwrap();
        assert_eq!(options.output_path, "/tmp/report.json");
        assert_eq!(options.concurrency, 3);
        assert_eq!(options.scope, "image");
        assert!(matches!(options.mode, SourceAuditMode::Full));

        let invalid = vec![
            "legado-reader".to_string(),
            "--source-audit-output".to_string(),
            "relative.json".to_string(),
        ];
        assert!(parse_source_audit_cli_options(&invalid).is_err());
    }

    #[test]
    fn skips_internal_storage_for_external_database_and_replay() {
        assert!(SourceAuditCliState::default().requires_internal_storage());

        let external_db = temporary_history_path("external-storage").with_file_name("sources.db");
        std::fs::create_dir_all(external_db.parent().unwrap()).unwrap();
        std::fs::write(&external_db, b"").unwrap();
        let external_args = vec![
            "legado-reader".to_string(),
            "--source-audit-output".to_string(),
            temporary_history_path("external-report")
                .with_file_name("report.json")
                .to_string_lossy()
                .into_owned(),
            "--source-audit-db".to_string(),
            external_db.to_string_lossy().into_owned(),
        ];
        assert!(!parse_source_audit_cli_options(&external_args)
            .unwrap()
            .requires_internal_storage());

        let replay = temporary_history_path("replay-storage").with_file_name("diagnostics.json");
        std::fs::create_dir_all(replay.parent().unwrap()).unwrap();
        std::fs::write(&replay, b"{}").unwrap();
        let replay_args = vec![
            "legado-reader".to_string(),
            "--source-audit-output".to_string(),
            temporary_history_path("replay-report")
                .with_file_name("report.json")
                .to_string_lossy()
                .into_owned(),
            "--source-audit-replay".to_string(),
            replay.to_string_lossy().into_owned(),
        ];
        assert!(!parse_source_audit_cli_options(&replay_args)
            .unwrap()
            .requires_internal_storage());

        let _ = std::fs::remove_dir_all(external_db.parent().unwrap());
        let _ = std::fs::remove_dir_all(replay.parent().unwrap());
    }

    #[test]
    fn writes_private_frontend_bootstrap_error_report() {
        let output = temporary_history_path("frontend-error").with_file_name("report.json");
        let args = vec![
            "legado-reader".to_string(),
            "--source-audit-output".to_string(),
            output.to_string_lossy().into_owned(),
        ];
        let state = parse_source_audit_cli_options(&args).unwrap();

        write_source_audit_error(
            &state,
            "FRONTEND_START_TIMEOUT",
            "Importing a module script failed.",
        )
        .unwrap();

        let value: Value = serde_json::from_slice(&std::fs::read(&output).unwrap()).unwrap();
        assert_eq!(value["kind"], "source-audit-error");
        assert_eq!(value["code"], "FRONTEND_START_TIMEOUT");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                std::fs::metadata(&output).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
        let _ = std::fs::remove_dir_all(output.parent().unwrap());
    }

    #[test]
    fn reads_external_source_database_without_writes() {
        let path = temporary_history_path("readonly-db").with_file_name("sources.db");
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        let connection = rusqlite::Connection::open(&path).unwrap();
        connection.execute_batch(
            "CREATE TABLE book_sources (custom_order INTEGER NOT NULL, data_json TEXT NOT NULL);\
             INSERT INTO book_sources VALUES (0, '{\"bookSourceUrl\":\"https://fixture.invalid\"}');",
        ).unwrap();
        drop(connection);
        let before = std::fs::metadata(&path).unwrap().modified().unwrap();
        let sources = load_sources_from_db(&path).unwrap();
        let after = std::fs::metadata(&path).unwrap().modified().unwrap();
        assert_eq!(sources[0]["bookSourceUrl"], "https://fixture.invalid");
        assert_eq!(before, after);
        let alias_args = vec![
            "legado-reader".to_string(),
            "--source-audit-output".to_string(),
            path.to_string_lossy().into_owned(),
            "--source-audit-db".to_string(),
            path.to_string_lossy().into_owned(),
        ];
        assert!(parse_source_audit_cli_options(&alias_args)
            .unwrap_err()
            .contains("不能覆盖输入数据库"));
        let _ = std::fs::remove_dir_all(path.parent().unwrap());
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

    #[cfg(unix)]
    #[test]
    fn report_write_does_not_change_existing_parent_permissions() {
        use std::os::unix::fs::PermissionsExt;
        let path = temporary_history_path("report-parent").with_file_name("report.json");
        let parent = path.parent().unwrap();
        std::fs::create_dir_all(parent).unwrap();
        std::fs::set_permissions(parent, std::fs::Permissions::from_mode(0o755)).unwrap();
        write_private_file(&path, b"{}").unwrap();
        assert_eq!(
            std::fs::metadata(parent).unwrap().permissions().mode() & 0o777,
            0o755
        );
        assert_eq!(
            std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
        assert!(ensure_private_directory(parent).is_err());
        let _ = std::fs::remove_dir_all(parent);
    }
}
