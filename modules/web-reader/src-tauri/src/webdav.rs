use quick_xml::events::Event;
use quick_xml::Reader;
use reqwest::{Client, Method, StatusCode};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Manager};
use url::Url;

use crate::storage::StorageDb;

const DEFAULT_SERVER_URL: &str = "https://dav.jianguoyun.com/dav/";
const DEFAULT_DIRECTORY: &str = "legado/";
const KEYRING_SERVICE: &str = "io.legado.reader.webdav";
const CONFIG_FILE: &str = "webdav.json";
const MAX_DOWNLOAD_BYTES: u64 = 512 * 1024 * 1024;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WebDavConfig {
    #[serde(default = "default_server_url")]
    pub server_url: String,
    #[serde(default)]
    pub account: String,
    #[serde(default = "default_directory")]
    pub directory: String,
    #[serde(default)]
    pub device_name: String,
    #[serde(default)]
    pub password_saved: bool,
}

impl Default for WebDavConfig {
    fn default() -> Self {
        Self {
            server_url: default_server_url(),
            account: String::new(),
            directory: default_directory(),
            device_name: "Tauri".to_string(),
            password_saved: false,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WebDavBackupFile {
    pub name: String,
    pub size: u64,
    pub modified: String,
    pub modified_at: u64,
}

#[derive(Default)]
struct PropResponse {
    href: String,
    display_name: String,
    size: u64,
    modified: String,
    is_collection: bool,
}

trait CredentialStore {
    fn get(&self, account: &str) -> Result<String, String>;
    fn set(&self, account: &str, password: &str) -> Result<(), String>;
    fn delete(&self, account: &str) -> Result<(), String>;
}

struct SystemCredentialStore;

impl SystemCredentialStore {
    fn entry(account: &str) -> Result<keyring::Entry, String> {
        keyring::Entry::new(KEYRING_SERVICE, account)
            .map_err(|error| format!("系统凭据库不可用：{error}"))
    }
}

impl CredentialStore for SystemCredentialStore {
    fn get(&self, account: &str) -> Result<String, String> {
        Self::entry(account)?
            .get_password()
            .map_err(|error| format!("无法从系统凭据库读取 WebDAV 密码：{error}"))
    }

    fn set(&self, account: &str, password: &str) -> Result<(), String> {
        Self::entry(account)?
            .set_password(password)
            .map_err(|error| format!("无法写入系统凭据库：{error}"))
    }

    fn delete(&self, account: &str) -> Result<(), String> {
        match Self::entry(account)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(format!("无法删除系统凭据库中的 WebDAV 密码：{error}")),
        }
    }
}

fn default_server_url() -> String {
    DEFAULT_SERVER_URL.to_string()
}

fn default_directory() -> String {
    DEFAULT_DIRECTORY.to_string()
}

fn normalized_config(mut config: WebDavConfig) -> Result<WebDavConfig, String> {
    config.server_url = config.server_url.trim().to_string();
    if config.server_url.is_empty() {
        config.server_url = default_server_url();
    }
    let mut server = Url::parse(&config.server_url)
        .map_err(|error| format!("WebDAV 服务器地址无效：{error}"))?;
    if server.scheme() != "http" && server.scheme() != "https" {
        return Err("WebDAV 服务器地址只支持 HTTP 或 HTTPS".to_string());
    }
    server.set_query(None);
    server.set_fragment(None);
    if !server.path().ends_with('/') {
        let path = format!("{}/", server.path());
        server.set_path(&path);
    }
    config.server_url = server.to_string();

    config.directory = config.directory.trim().trim_matches('/').to_string();
    if config.directory.is_empty() {
        config.directory = DEFAULT_DIRECTORY.trim_matches('/').to_string();
    }
    if config
        .directory
        .split('/')
        .any(|segment| segment.is_empty() || segment == "." || segment == "..")
    {
        return Err("WebDAV 子目录包含无效路径段".to_string());
    }
    config.directory.push('/');
    config.account = config.account.trim().to_string();
    config.device_name = config.device_name.trim().to_string();
    Ok(config)
}

pub fn webdav_root_url(config: &WebDavConfig) -> Result<Url, String> {
    let config = normalized_config(config.clone())?;
    let mut root = Url::parse(&config.server_url)
        .map_err(|error| format!("WebDAV 服务器地址无效：{error}"))?;
    {
        let mut segments = root
            .path_segments_mut()
            .map_err(|_| "WebDAV 服务器地址不能作为目录".to_string())?;
        segments.pop_if_empty();
        for segment in config.directory.trim_matches('/').split('/') {
            segments.push(segment);
        }
        segments.push("");
    }
    Ok(root)
}

fn validate_backup_name(name: &str) -> Result<(), String> {
    let lower = name.to_ascii_lowercase();
    if !lower.starts_with("backup") || !lower.ends_with(".zip") {
        return Err("只允许访问 backup*.zip 文件".to_string());
    }
    if name.contains('/')
        || name.contains('\\')
        || name.contains('\0')
        || name == "."
        || name == ".."
    {
        return Err("备份文件名无效".to_string());
    }
    Ok(())
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|directory| directory.join(CONFIG_FILE))
        .map_err(|error| format!("无法定位应用配置目录：{error}"))
}

fn load_config(app: &AppHandle) -> Result<WebDavConfig, String> {
    if let Some(storage_db) = app.try_state::<Arc<StorageDb>>() {
        if let Ok(Some(raw)) = storage_db.get_preference("legado_webdav_config") {
            if let Ok(config) = serde_json::from_str::<WebDavConfig>(&raw) {
                return normalized_config(config);
            }
        }
    }

    // 回退或读取旧 webdav.json 迁移
    if let Ok(path) = config_path(app) {
        if path.exists() {
            if let Ok(raw) = fs::read_to_string(&path) {
                if let Ok(config) = serde_json::from_str::<WebDavConfig>(&raw) {
                    if let Some(storage_db) = app.try_state::<Arc<StorageDb>>() {
                        let _ = storage_db.save_preference("legado_webdav_config", &raw);
                        let _ = fs::remove_file(path);
                    }
                    return normalized_config(config);
                }
            }
        }
    }

    Ok(WebDavConfig::default())
}

fn save_config_file(app: &AppHandle, config: &WebDavConfig) -> Result<(), String> {
    let raw = serde_json::to_string_pretty(config)
        .map_err(|error| format!("无法序列化 WebDAV 配置：{error}"))?;

    if let Some(storage_db) = app.try_state::<Arc<StorageDb>>() {
        storage_db
            .save_preference("legado_webdav_config", &raw)
            .map_err(|e| format!("保存 WebDAV 配置失败: {e}"))?;
        return Ok(());
    }

    let path = config_path(app)?;
    let parent = path
        .parent()
        .ok_or_else(|| "WebDAV 配置路径无效".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("无法创建应用配置目录：{error}"))?;
    let temporary = path.with_extension("json.tmp");
    fs::write(&temporary, &raw).map_err(|error| format!("无法写入 WebDAV 配置：{error}"))?;
    fs::rename(&temporary, &path).map_err(|error| format!("无法保存 WebDAV 配置：{error}"))
}

fn resolved_password(
    config: &WebDavConfig,
    password: Option<String>,
    credentials: &dyn CredentialStore,
) -> Result<String, String> {
    if let Some(password) = password.filter(|value| !value.is_empty()) {
        return Ok(password);
    }
    if config.account.is_empty() {
        return Err("请填写 WebDAV 账号".to_string());
    }
    credentials.get(&config.account)
}

fn webdav_client() -> Result<Client, String> {
    Client::builder()
        .user_agent("Legado-Reader-Tauri/1")
        .pool_max_idle_per_host(0)
        .build()
        .map_err(|error| format!("无法创建 WebDAV 客户端：{error}"))
}

async fn ensure_directory(
    client: &Client,
    config: &WebDavConfig,
    password: &str,
) -> Result<Url, String> {
    let normalized = normalized_config(config.clone())?;
    let mut current = Url::parse(&normalized.server_url)
        .map_err(|error| format!("WebDAV 服务器地址无效：{error}"))?;
    for segment in normalized.directory.trim_matches('/').split('/') {
        current = current
            .join(&format!("{segment}/"))
            .map_err(|error| format!("WebDAV 子目录地址无效：{error}"))?;
        let response = client
            .request(
                Method::from_bytes(b"MKCOL").expect("valid WebDAV method"),
                current.clone(),
            )
            .basic_auth(&normalized.account, Some(password))
            .send()
            .await
            .map_err(|error| format!("创建 WebDAV 目录失败：{error}"))?;
        if !response.status().is_success()
            && response.status() != StatusCode::METHOD_NOT_ALLOWED
            && response.status() != StatusCode::CONFLICT
        {
            return Err(format!("创建 WebDAV 目录失败：HTTP {}", response.status()));
        }
    }
    Ok(current)
}

async fn propfind(
    client: &Client,
    config: &WebDavConfig,
    password: &str,
) -> Result<String, String> {
    let root = ensure_directory(client, config, password).await?;
    let response = client
        .request(Method::from_bytes(b"PROPFIND").expect("valid WebDAV method"), root)
        .header("Depth", "1")
        .header("Content-Type", "application/xml; charset=utf-8")
        .basic_auth(&config.account, Some(password))
        .body(
            r#"<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:getcontentlength/><d:getlastmodified/><d:resourcetype/></d:prop></d:propfind>"#,
        )
        .send()
        .await
        .map_err(|error| format!("读取 WebDAV 目录失败：{error}"))?;
    if !response.status().is_success() && response.status() != StatusCode::MULTI_STATUS {
        return Err(format!("读取 WebDAV 目录失败：HTTP {}", response.status()));
    }
    response
        .text()
        .await
        .map_err(|error| format!("读取 WebDAV 响应失败：{error}"))
}

async fn put_backup(
    client: &Client,
    config: &WebDavConfig,
    password: &str,
    name: &str,
    data: Vec<u8>,
) -> Result<(), String> {
    validate_backup_name(name)?;
    let root = ensure_directory(client, config, password).await?;
    let target = root
        .join(name)
        .map_err(|error| format!("备份文件地址无效：{error}"))?;
    let response = client
        .put(target)
        .header("Content-Type", "application/zip")
        .basic_auth(&config.account, Some(password))
        .body(data)
        .send()
        .await
        .map_err(|error| format!("上传 WebDAV 备份失败：{error}"))?;
    if !response.status().is_success() {
        return Err(format!("上传 WebDAV 备份失败：HTTP {}", response.status()));
    }
    Ok(())
}

async fn get_backup(
    client: &Client,
    config: &WebDavConfig,
    password: &str,
    name: &str,
) -> Result<Vec<u8>, String> {
    validate_backup_name(name)?;
    let target = webdav_root_url(config)?
        .join(name)
        .map_err(|error| format!("备份文件地址无效：{error}"))?;
    let response = client
        .get(target)
        .basic_auth(&config.account, Some(password))
        .send()
        .await
        .map_err(|error| format!("下载 WebDAV 备份失败：{error}"))?;
    if !response.status().is_success() {
        return Err(format!("下载 WebDAV 备份失败：HTTP {}", response.status()));
    }
    if response.content_length().unwrap_or(0) > MAX_DOWNLOAD_BYTES {
        return Err("WebDAV 备份超过 512 MiB 下载上限".to_string());
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format!("读取 WebDAV 备份失败：{error}"))?;
    if bytes.len() as u64 > MAX_DOWNLOAD_BYTES {
        return Err("WebDAV 备份超过 512 MiB 下载上限".to_string());
    }
    Ok(bytes.to_vec())
}

fn local_name_from_href(href: &str) -> String {
    Url::parse(href)
        .ok()
        .and_then(|url| {
            url.path_segments()?
                .rfind(|segment| !segment.is_empty())
                .map(str::to_string)
        })
        .or_else(|| {
            href.trim_end_matches('/')
                .rsplit('/')
                .next()
                .map(str::to_string)
        })
        .unwrap_or_default()
        .replace("%20", " ")
}

pub fn parse_propfind_response(xml: &str) -> Result<Vec<WebDavBackupFile>, String> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);
    let mut current: Option<PropResponse> = None;
    let mut field = String::new();
    let mut results = Vec::new();

    loop {
        match reader.read_event() {
            Ok(Event::Start(event)) => {
                let name =
                    String::from_utf8_lossy(event.local_name().as_ref()).to_ascii_lowercase();
                if name == "response" {
                    current = Some(PropResponse::default());
                } else {
                    field = name;
                    if field == "collection" {
                        if let Some(item) = current.as_mut() {
                            item.is_collection = true;
                        }
                    }
                }
            }
            Ok(Event::Empty(event)) => {
                if event
                    .local_name()
                    .as_ref()
                    .eq_ignore_ascii_case(b"collection")
                {
                    if let Some(item) = current.as_mut() {
                        item.is_collection = true;
                    }
                }
            }
            Ok(Event::Text(text)) => {
                if let Some(item) = current.as_mut() {
                    let value = text
                        .decode()
                        .map_err(|error| format!("WebDAV XML 文本无效：{error}"))?;
                    match field.as_str() {
                        "href" => item.href = value.into_owned(),
                        "displayname" => item.display_name = value.into_owned(),
                        "getcontentlength" => item.size = value.parse().unwrap_or(0),
                        "getlastmodified" => item.modified = value.into_owned(),
                        _ => {}
                    }
                }
            }
            Ok(Event::End(event)) => {
                let name =
                    String::from_utf8_lossy(event.local_name().as_ref()).to_ascii_lowercase();
                if name == "response" {
                    if let Some(item) = current.take() {
                        let file_name = if item.display_name.is_empty() {
                            local_name_from_href(&item.href)
                        } else {
                            item.display_name
                        };
                        let lower = file_name.to_ascii_lowercase();
                        if !item.is_collection
                            && lower.starts_with("backup")
                            && lower.ends_with(".zip")
                        {
                            let modified_at = httpdate::parse_http_date(&item.modified)
                                .ok()
                                .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                                .map(|duration| duration.as_millis() as u64)
                                .unwrap_or(0);
                            results.push(WebDavBackupFile {
                                name: file_name,
                                size: item.size,
                                modified: item.modified,
                                modified_at,
                            });
                        }
                    }
                }
                field.clear();
            }
            Ok(Event::Eof) => break,
            Err(error) => return Err(format!("WebDAV XML 响应无效：{error}")),
            _ => {}
        }
    }
    results.sort_by(|left, right| {
        right
            .modified_at
            .cmp(&left.modified_at)
            .then_with(|| right.name.cmp(&left.name))
    });
    Ok(results)
}

#[tauri::command]
pub fn get_webdav_config(app: AppHandle) -> Result<WebDavConfig, String> {
    let mut config = load_config(&app)?;
    config.password_saved = if config.account.is_empty() {
        false
    } else {
        SystemCredentialStore.get(&config.account).is_ok()
    };
    Ok(config)
}

#[tauri::command]
pub fn save_webdav_config(
    app: AppHandle,
    config: WebDavConfig,
    password: Option<String>,
    clear_password: Option<bool>,
) -> Result<WebDavConfig, String> {
    let credentials = SystemCredentialStore;
    let previous = load_config(&app).unwrap_or_default();
    let mut config = normalized_config(config)?;
    if config.account.is_empty() {
        return Err("请填写 WebDAV 账号".to_string());
    }
    if clear_password.unwrap_or(false) {
        credentials.delete(&config.account)?;
    } else if let Some(password) = password.filter(|value| !value.is_empty()) {
        credentials.set(&config.account, &password)?;
    } else if previous.account != config.account && credentials.get(&config.account).is_err() {
        return Err("账号已更改，请重新输入 WebDAV 密码".to_string());
    }
    config.password_saved = credentials.get(&config.account).is_ok();
    save_config_file(&app, &config)?;
    Ok(config)
}

#[tauri::command]
pub async fn test_webdav_connection(
    config: WebDavConfig,
    password: Option<String>,
) -> Result<(), String> {
    let config = normalized_config(config)?;
    let password = resolved_password(&config, password, &SystemCredentialStore)?;
    let client = webdav_client()?;
    propfind(&client, &config, &password).await.map(|_| ())
}

#[tauri::command]
pub async fn list_webdav_backups(app: AppHandle) -> Result<Vec<WebDavBackupFile>, String> {
    let config = load_config(&app)?;
    let password = resolved_password(&config, None, &SystemCredentialStore)?;
    let xml = propfind(&webdav_client()?, &config, &password).await?;
    parse_propfind_response(&xml)
}

#[tauri::command]
pub async fn upload_webdav_backup(app: AppHandle, request: Request<'_>) -> Result<(), String> {
    let body = match request.body() {
        InvokeBody::Raw(bytes) => bytes.clone(),
        _ => return Err("请求体必须为原始二进制".to_string()),
    };

    // 优先从命令请求 Header 中获取独立验证的文件名参数
    let (name, data) = if let Some(header_val) = request.headers().get("x-backup-name") {
        let raw = header_val
            .to_str()
            .map_err(|e| format!("备份文件名 Header 无效: {e}"))?;
        let decoded = percent_encoding::percent_decode_str(raw)
            .decode_utf8_lossy()
            .to_string();
        (decoded, body)
    } else if body.len() >= 4 {
        let name_len = u32::from_le_bytes([body[0], body[1], body[2], body[3]]) as usize;
        if body.len() < 4 + name_len {
            return Err("备份文件名数据截断".to_string());
        }
        let name = String::from_utf8(body[4..4 + name_len].to_vec())
            .map_err(|e| format!("文件名不是有效 UTF-8: {e}"))?;
        let data = body[4 + name_len..].to_vec();
        (name, data)
    } else {
        return Err("缺少备份文件名参数".to_string());
    };

    validate_backup_name(&name)?;

    let config = load_config(&app)?;
    let password = resolved_password(&config, None, &SystemCredentialStore)?;
    let client = webdav_client()?;
    put_backup(&client, &config, &password, &name, data).await
}

#[tauri::command]
pub async fn download_webdav_backup(app: AppHandle, name: String) -> Result<Response, String> {
    validate_backup_name(&name)?;
    let config = load_config(&app)?;
    let password = resolved_password(&config, None, &SystemCredentialStore)?;
    let bytes = get_backup(&webdav_client()?, &config, &password, &name).await?;
    Ok(Response::new(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::Arc;
    use std::sync::Mutex;
    use std::thread;

    #[derive(Default)]
    struct MemoryCredentialStore(Mutex<HashMap<String, String>>);

    impl CredentialStore for MemoryCredentialStore {
        fn get(&self, account: &str) -> Result<String, String> {
            self.0
                .lock()
                .unwrap()
                .get(account)
                .cloned()
                .ok_or_else(|| "missing".to_string())
        }
        fn set(&self, account: &str, password: &str) -> Result<(), String> {
            self.0
                .lock()
                .unwrap()
                .insert(account.to_string(), password.to_string());
            Ok(())
        }
        fn delete(&self, account: &str) -> Result<(), String> {
            self.0.lock().unwrap().remove(account);
            Ok(())
        }
    }

    #[test]
    fn normalizes_android_compatible_root() {
        let config = WebDavConfig {
            server_url: "https://dav.jianguoyun.com/dav".to_string(),
            directory: "/legado/desktop/".to_string(),
            ..Default::default()
        };
        assert_eq!(
            webdav_root_url(&config).unwrap().as_str(),
            "https://dav.jianguoyun.com/dav/legado/desktop/"
        );
    }

    #[test]
    fn parses_filters_and_sorts_multistatus() {
        let xml = r#"<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">
          <d:response><d:href>/dav/legado/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat></d:response>
          <d:response><d:href>/dav/legado/backup2026-08-20-A.zip</d:href><d:propstat><d:prop><d:getcontentlength>12</d:getcontentlength><d:getlastmodified>Thu, 20 Aug 2026 10:00:00 GMT</d:getlastmodified></d:prop></d:propstat></d:response>
          <d:response><d:href>/dav/legado/readme.txt</d:href><d:propstat><d:prop><d:getcontentlength>2</d:getcontentlength></d:prop></d:propstat></d:response>
          <d:response><d:href>/dav/legado/backup2026-08-21-B.zip</d:href><d:propstat><d:prop><d:getcontentlength>15</d:getcontentlength><d:getlastmodified>Fri, 21 Aug 2026 10:00:00 GMT</d:getlastmodified></d:prop></d:propstat></d:response>
        </d:multistatus>"#;
        let files = parse_propfind_response(xml).unwrap();
        assert_eq!(
            files
                .iter()
                .map(|item| item.name.as_str())
                .collect::<Vec<_>>(),
            vec!["backup2026-08-21-B.zip", "backup2026-08-20-A.zip"]
        );
        assert_eq!(files[0].size, 15);
    }

    #[test]
    fn credential_store_is_replaceable_and_never_plaintext() {
        let store = MemoryCredentialStore::default();
        store.set("reader@example.com", "secret").unwrap();
        assert_eq!(store.get("reader@example.com").unwrap(), "secret");
        store.delete("reader@example.com").unwrap();
        assert!(store.get("reader@example.com").is_err());
    }

    #[test]
    fn rejects_non_backup_names() {
        assert!(validate_backup_name("../secret.zip").is_err());
        assert!(validate_backup_name("books.zip").is_err());
        assert!(validate_backup_name("backup2026-08-24.zip").is_ok());
    }

    fn spawn_http_server(
        responses: Vec<(u16, &'static str)>,
    ) -> (String, Arc<Mutex<Vec<String>>>, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let requests = Arc::new(Mutex::new(Vec::new()));
        let captured = Arc::clone(&requests);
        let handle = thread::spawn(move || {
            for (status, body) in responses {
                let (mut stream, _) = listener.accept().unwrap();
                let mut buffer = vec![0u8; 64 * 1024];
                let mut length = 0;
                loop {
                    let read = stream.read(&mut buffer[length..]).unwrap();
                    if read == 0 {
                        break;
                    }
                    length += read;
                    let request = String::from_utf8_lossy(&buffer[..length]);
                    if let Some(header_end) = request.find("\r\n\r\n") {
                        let content_length = request[..header_end]
                            .lines()
                            .find_map(|line| {
                                line.strip_prefix("content-length: ")
                                    .or_else(|| line.strip_prefix("Content-Length: "))
                            })
                            .and_then(|value| value.trim().parse::<usize>().ok())
                            .unwrap_or(0);
                        if length >= header_end + 4 + content_length {
                            break;
                        }
                    }
                }
                captured
                    .lock()
                    .unwrap()
                    .push(String::from_utf8_lossy(&buffer[..length]).into_owned());
                let reason = match status {
                    200 => "OK",
                    201 => "Created",
                    207 => "Multi-Status",
                    405 => "Method Not Allowed",
                    _ => "Error",
                };
                write!(
                    stream,
                    "HTTP/1.1 {status} {reason}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                )
                .unwrap();
            }
        });
        (format!("http://{address}/dav/"), requests, handle)
    }

    fn test_config(server_url: String) -> WebDavConfig {
        WebDavConfig {
            server_url,
            account: "user".to_string(),
            directory: "legado/".to_string(),
            device_name: "test".to_string(),
            password_saved: false,
        }
    }

    #[tokio::test]
    async fn sends_basic_auth_mkcol_and_propfind_depth_one() {
        let (server_url, requests, handle) = spawn_http_server(vec![
            (405, ""),
            (
                207,
                r#"<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"/>"#,
            ),
        ]);
        let config = test_config(server_url);
        let xml = propfind(&webdav_client().unwrap(), &config, "pass")
            .await
            .unwrap();
        assert!(xml.contains("multistatus"));
        handle.join().unwrap();
        let requests = requests.lock().unwrap();
        assert!(requests[0].starts_with("MKCOL /dav/legado/ HTTP/1.1"));
        assert!(requests[1].starts_with("PROPFIND /dav/legado/ HTTP/1.1"));
        assert!(requests[1].contains("depth: 1") || requests[1].contains("Depth: 1"));
        assert!(requests
            .iter()
            .all(|request| request.contains("Basic dXNlcjpwYXNz")));
    }

    #[tokio::test]
    async fn sends_put_and_get_for_android_compatible_file_name() {
        let (put_server, put_requests, put_handle) = spawn_http_server(vec![(405, ""), (201, "")]);
        let put_config = test_config(put_server);
        put_backup(
            &webdav_client().unwrap(),
            &put_config,
            "pass",
            "backup2026-08-24-test.zip",
            vec![1, 2, 3],
        )
        .await
        .unwrap();
        put_handle.join().unwrap();
        {
            let put_requests = put_requests.lock().unwrap();
            assert!(
                put_requests[1].starts_with("PUT /dav/legado/backup2026-08-24-test.zip HTTP/1.1")
            );
            assert!(put_requests[1].contains("Basic dXNlcjpwYXNz"));
        }

        let (get_server, get_requests, get_handle) = spawn_http_server(vec![(200, "zip")]);
        let get_config = test_config(get_server);
        let bytes = get_backup(
            &webdav_client().unwrap(),
            &get_config,
            "pass",
            "backup2026-08-24-test.zip",
        )
        .await
        .unwrap();
        get_handle.join().unwrap();
        assert_eq!(bytes, b"zip");
        assert!(get_requests.lock().unwrap()[0]
            .starts_with("GET /dav/legado/backup2026-08-24-test.zip HTTP/1.1"));
    }
}
