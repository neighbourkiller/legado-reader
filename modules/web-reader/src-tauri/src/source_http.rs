use crate::cookie_store::CookieManager;
use crate::source_policy::{redirect_policy, validate_ip, validate_url, PublicDnsResolver};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::error::Error;
use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::sync::Mutex as StdMutex;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceRequest {
    pub source_id: String,
    pub url: String,
    pub method: String,
    pub headers: Option<HashMap<String, String>>,
    pub body: Option<String>,
    pub charset: Option<String>,
    pub timeout: Option<u64>,
    pub follow_redirects: Option<bool>,
    pub use_cookie_jar: Option<bool>,
    pub dns_ip: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebviewFetchRequest {
    pub source_id: String,
    pub url: String,
    pub method: String,
    pub headers: Option<HashMap<String, String>>,
    pub body: Option<String>,
    pub timeout_ms: Option<u64>,
    pub delay_ms: Option<u64>,
    pub follow_redirects: Option<bool>,
    pub use_cookie_jar: Option<bool>,
    pub response_type: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceResponse {
    pub status: u16,
    pub final_url: String,
    pub headers: HashMap<String, String>,
    pub body: Vec<u8>,
    pub charset: Option<String>,
}

pub struct AppState {
    pub cookie_manager: Arc<Mutex<CookieManager>>,
    pub source_cache: Arc<StdMutex<HashMap<String, String>>>,
    pub source_cache_path: Arc<Option<PathBuf>>,
}

impl AppState {
    pub fn new(source_cache_path: Option<PathBuf>) -> Self {
        let source_cache = source_cache_path
            .as_ref()
            .and_then(|path| std::fs::read_to_string(path).ok())
            .and_then(|json| serde_json::from_str::<HashMap<String, String>>(&json).ok())
            .unwrap_or_default();
        Self {
            cookie_manager: Arc::new(Mutex::new(CookieManager::new(
                source_cache_path
                    .as_ref()
                    .and_then(|path| path.parent())
                    .map(|directory| directory.join("source_cookies.json")),
            ))),
            source_cache: Arc::new(StdMutex::new(source_cache)),
            source_cache_path: Arc::new(source_cache_path),
        }
    }
}

const MAX_ERROR_CHAIN_DEPTH: usize = 8;
const MAX_RESPONSE_BODY_BYTES: usize = 10 * 1024 * 1024;

fn format_error_chain(error: &(dyn Error + 'static)) -> String {
    let mut messages = Vec::new();
    let mut current = Some(error);

    for _ in 0..MAX_ERROR_CHAIN_DEPTH {
        let Some(cause) = current else {
            break;
        };

        messages.push(cause.to_string());
        current = cause.source();
    }

    if current.is_some() {
        messages.push("additional error causes omitted".to_string());
    }

    messages.join(" -> ")
}

fn classify_request_error(error: &reqwest::Error, error_chain: &str) -> &'static str {
    if error.is_timeout() {
        return "timeout";
    }

    let detail = error_chain.to_ascii_lowercase();
    if [
        "dns error",
        "failed to lookup",
        "lookup address",
        "name or service not known",
        "temporary failure in name resolution",
        "nxdomain",
    ]
    .iter()
    .any(|marker| detail.contains(marker))
    {
        return "dns";
    }

    if ["tls", "ssl", "certificate", "unknownissuer", "invalid peer"]
        .iter()
        .any(|marker| detail.contains(marker))
    {
        return "tls";
    }

    if error.is_connect()
        || [
            "connection refused",
            "connection reset",
            "network is unreachable",
            "host unreachable",
            "broken pipe",
        ]
        .iter()
        .any(|marker| detail.contains(marker))
    {
        return "connect";
    }

    "request"
}

fn format_request_error(stage: &str, error: reqwest::Error) -> String {
    let error_chain = format_error_chain(&error);
    let kind = classify_request_error(&error, &error_chain);

    format!(
        "Request failed [stage={stage}, kind={kind}, connect={}, timeout={}]: {error_chain}",
        error.is_connect(),
        error.is_timeout(),
    )
}

fn exceeds_response_body_limit(current_length: usize, next_chunk_length: usize) -> bool {
    current_length.saturating_add(next_chunk_length) > MAX_RESPONSE_BODY_BYTES
}

async fn read_limited_response_body(mut response: reqwest::Response) -> Result<Vec<u8>, String> {
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BODY_BYTES as u64)
    {
        return Err("Response body too large (max 10MB)".to_string());
    }

    let mut body = Vec::with_capacity(
        response
            .content_length()
            .unwrap_or_default()
            .min(MAX_RESPONSE_BODY_BYTES as u64) as usize,
    );
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format_request_error("read_body", error))?
    {
        if exceeds_response_body_limit(body.len(), chunk.len()) {
            return Err("Response body too large (max 10MB)".to_string());
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

#[tauri::command]
pub async fn source_request(
    request: SourceRequest,
    state: tauri::State<'_, AppState>,
) -> Result<SourceResponse, String> {
    // 1. URL Safety Check
    validate_url(&request.url)?;

    // 2. Build a request-scoped client so redirect, Cookie and DNS overrides are honored.
    let cookie_jar = {
        let mut manager = state.cookie_manager.lock().await;
        manager.get_or_create_jar(&request.source_id)
    };
    let mut client_builder = reqwest::Client::builder()
        .gzip(true)
        .brotli(true)
        .deflate(true)
        .dns_resolver(Arc::new(PublicDnsResolver))
        .redirect(redirect_policy(request.follow_redirects != Some(false)));
    if request.use_cookie_jar != Some(false) {
        client_builder = client_builder.cookie_provider(cookie_jar);
    }
    if let Some(dns_ip) = request.dns_ip.as_deref() {
        let parsed_url = url::Url::parse(&request.url).map_err(|e| format!("Invalid URL: {e}"))?;
        let host = parsed_url
            .host_str()
            .ok_or_else(|| "URL has no host".to_string())?;
        let port = parsed_url.port_or_known_default().unwrap_or(80);
        let addresses = dns_ip
            .split(',')
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| {
                let ip = value
                    .trim_matches(|character| character == '[' || character == ']')
                    .parse::<IpAddr>()
                    .map_err(|e| format!("Invalid dnsIp: {e}"))?;
                validate_ip(ip)?;
                Ok::<SocketAddr, String>(SocketAddr::new(ip, port))
            })
            .collect::<Result<Vec<_>, _>>()?;
        if addresses.is_empty() {
            return Err("dnsIp requires at least one IP address".to_string());
        }
        client_builder = client_builder.resolve_to_addrs(host, &addresses);
    }
    let client = client_builder
        .build()
        .map_err(|e| format!("Failed to build client: {e}"))?;

    // 3. Build reqwest Request
    let method = match request.method.to_uppercase().as_str() {
        "POST" => Method::POST,
        "HEAD" => Method::HEAD,
        _ => Method::GET,
    };

    let mut req_builder = client.request(method, &request.url);

    if let Some(headers) = request.headers {
        let mut header_map = HeaderMap::new();
        for (k, v) in headers {
            if let (Ok(name), Ok(value)) = (HeaderName::from_str(&k), HeaderValue::from_str(&v)) {
                header_map.insert(name, value);
            }
        }
        req_builder = req_builder.headers(header_map);
    }

    if let Some(body) = request.body {
        req_builder = req_builder.body(body);
    }

    // 4. 前端统一以毫秒传递超时。
    let timeout_ms = request.timeout.unwrap_or(30_000).clamp(1, 300_000);
    req_builder = req_builder.timeout(Duration::from_millis(timeout_ms));

    // 5. Send Request
    let response = req_builder
        .send()
        .await
        .map_err(|error| format_request_error("send", error))?;

    // 6. Extract response info
    let status = response.status().as_u16();
    let final_url = response.url().to_string();

    if request.use_cookie_jar != Some(false) {
        let mut manager = state.cookie_manager.lock().await;
        manager.persist_current_cookies(&request.source_id, &final_url)?;
    }

    let mut resp_headers = HashMap::new();
    for (name, value) in response.headers() {
        if let Ok(v) = value.to_str() {
            resp_headers.insert(name.to_string(), v.to_string());
        }
    }

    // 7. Infer charset
    let mut charset = request.charset;
    if charset.is_none() {
        if let Some(content_type) = response.headers().get(reqwest::header::CONTENT_TYPE) {
            if let Ok(ct) = content_type.to_str() {
                if let Some(idx) = ct.find("charset=") {
                    charset = Some(ct[idx + 8..].trim().to_string());
                }
            }
        }
    }

    // 8. Stream response bytes and stop before an oversized body is buffered in memory.
    let bytes = read_limited_response_body(response).await?;

    Ok(SourceResponse {
        status,
        final_url,
        headers: resp_headers,
        body: bytes,
        charset,
    })
}

#[tauri::command]
pub async fn set_source_cookies(
    app: tauri::AppHandle,
    source_id: String,
    url: String,
    cookie_str: String,
    user_agent: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    {
        let mut manager = state.cookie_manager.lock().await;
        manager.set_cookies(&source_id, &url, &cookie_str)?;
    }
    if !cookie_str.trim().is_empty() {
        let parsed_url = url::Url::parse(&url).map_err(|e| format!("Invalid URL: {e}"))?;
        let host = parsed_url
            .host_str()
            .ok_or_else(|| "URL has no host".to_string())?
            .to_string();
        let webview =
            ensure_source_webview(&app, &source_id, &parsed_url, Duration::from_secs(15)).await?;
        for item in cookie_str.split(';') {
            if let Some((name, value)) = item.trim().split_once('=') {
                let cookie = tauri::webview::Cookie::build((
                    name.trim().to_string(),
                    value.trim().to_string(),
                ))
                .domain(host.clone())
                .path("/")
                .build();
                webview
                    .set_cookie(cookie)
                    .map_err(|e| format!("Failed to set WebView cookie: {e}"))?;
            }
        }
    }
    // UA 由书源 header 持久化并在每次请求中传入；保留参数以兼容现有 IPC。
    let _ = user_agent;
    Ok(())
}

#[tauri::command]
pub async fn get_source_cookies(
    source_id: String,
    url: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let mut manager = state.cookie_manager.lock().await;
    manager.get_cookies(&source_id, &url)
}

fn make_window_label(source_id: &str) -> String {
    let digest = Sha256::digest(source_id.as_bytes());
    format!("auth_{digest:x}")
}

fn preserve_auth_webview_on_close(window: &tauri::WebviewWindow) {
    let window_to_hide = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = window_to_hide.hide();
        }
    });
}

#[tauri::command]
pub async fn open_source_auth_window(
    app: tauri::AppHandle,
    source_id: String,
    url: String,
    title: Option<String>,
) -> Result<(), String> {
    validate_url(&url)?;
    let parsed_url = url::Url::parse(&url).map_err(|e| format!("Invalid URL: {}", e))?;

    let window_label = make_window_label(&source_id);

    use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

    if let Some(existing) = app.get_webview_window(&window_label) {
        let _ = existing.show();
        let _ = existing.set_focus();
        return Ok(());
    }

    let win_title = title.unwrap_or_else(|| {
        format!(
            "书源网页验证与登录 - {}",
            parsed_url.host_str().unwrap_or("")
        )
    });

    let window = WebviewWindowBuilder::new(&app, &window_label, WebviewUrl::External(parsed_url))
        .title(&win_title)
        .inner_size(960.0, 720.0)
        .center()
        .build()
        .map_err(|e| format!("Failed to create auth window: {}", e))?;

    // WebView 是受保护书源的请求执行上下文。用户点击标题栏关闭按钮时仅隐藏窗口，
    // 保留 Cookie、页面上下文和浏览器指纹；再次打开认证窗口时会恢复显示。
    preserve_auth_webview_on_close(&window);

    Ok(())
}

#[tauri::command]
pub async fn close_source_auth_window(
    app: tauri::AppHandle,
    source_id: String,
) -> Result<(), String> {
    use tauri::Manager;
    let window_label = make_window_label(&source_id);
    if let Some(win) = app.get_webview_window(&window_label) {
        let _ = win.hide();
    }
    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncCookieResult {
    pub cookie_count: usize,
    pub cookie_names: Vec<String>,
    pub has_cf_clearance: bool,
}

#[derive(Deserialize)]
struct WebviewFetchResult {
    ok: bool,
    status: Option<u16>,
    #[serde(rename = "finalUrl")]
    final_url: Option<String>,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
    #[serde(rename = "bodyBase64")]
    body_base64: Option<String>,
    error: Option<String>,
}

const WEBVIEW_FETCH_RESULT_STORE: &str = "__legadoWebviewFetchResults";
const WEBVIEW_FETCH_PENDING: &str = "__LEGADO_FETCH_PENDING__";
static WEBVIEW_FETCH_SEQUENCE: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebviewScriptResponse {
    pub result: serde_json::Value,
}

#[tauri::command]
pub async fn execute_webview_script(
    app: tauri::AppHandle,
    source_id: String,
    url: String,
    code: String,
    bindings: serde_json::Value,
    timeout_ms: Option<u64>,
) -> Result<WebviewScriptResponse, String> {
    validate_url(&url)?;
    let parsed_url = url::Url::parse(&url).map_err(|e| format!("Invalid URL: {e}"))?;
    let timeout = timeout_ms.unwrap_or(10_000).clamp(100, 30_000);
    let webview =
        ensure_source_webview(&app, &source_id, &parsed_url, Duration::from_secs(15)).await?;
    let request_id = format!(
        "script-{}-{}",
        std::process::id(),
        WEBVIEW_FETCH_SEQUENCE.fetch_add(1, Ordering::Relaxed)
    );
    let request_id_json = serde_json::to_string(&request_id).map_err(|e| e.to_string())?;
    let code_json = serde_json::to_string(&code).map_err(|e| e.to_string())?;
    let bindings_json = serde_json::to_string(&bindings).map_err(|e| e.to_string())?;
    let store_json =
        serde_json::to_string(WEBVIEW_FETCH_RESULT_STORE).map_err(|e| e.to_string())?;
    let pending_json = serde_json::to_string(WEBVIEW_FETCH_PENDING).map_err(|e| e.to_string())?;
    let start_js = format!(
        r#"(() => {{
      const store = window[{store_json}] ?? (window[{store_json}] = Object.create(null));
      store[{request_id_json}] = {pending_json};
      void (async () => {{
        const previous = Object.create(null);
        const bindings = {bindings_json};
        for (const key of Object.keys(bindings)) {{ previous[key] = window[key]; window[key] = bindings[key]; }}
        try {{
          const value = await (0, eval)({code_json});
          store[{request_id_json}] = JSON.stringify({{ ok: true, result: value === undefined ? null : value }});
        }} catch (error) {{
          store[{request_id_json}] = JSON.stringify({{ ok: false, error: error?.message || String(error) }});
        }} finally {{
          for (const key of Object.keys(bindings)) {{
            if (previous[key] === undefined) delete window[key]; else window[key] = previous[key];
          }}
        }}
      }})();
    }})()"#
    );
    webview
        .eval(&start_js)
        .map_err(|e| format!("Failed to start WebView script: {e}"))?;
    let poll_js = format!(
        r#"(() => {{
      const value = window[{store_json}]?.[{request_id_json}];
      if (value === undefined || value === {pending_json}) return {pending_json};
      delete window[{store_json}][{request_id_json}];
      return value;
    }})()"#
    );
    let deadline = Instant::now() + Duration::from_millis(timeout);
    let raw_result = loop {
        if Instant::now() >= deadline {
            return Err("WEBJS_TIMEOUT: 页面脚本执行超时".to_string());
        }
        let (tx, rx) = tokio::sync::oneshot::channel();
        let tx_mutex = Arc::new(std::sync::Mutex::new(Some(tx)));
        webview
            .eval_with_callback(&poll_js, move |result| {
                if let Some(tx) = tx_mutex.lock().ok().and_then(|mut guard| guard.take()) {
                    let _ = tx.send(result);
                }
            })
            .map_err(|e| format!("Failed to poll WebView script: {e}"))?;
        if let Ok(Ok(raw)) = tokio::time::timeout(Duration::from_secs(2), rx).await {
            if let Some(value) = decode_webview_callback_value(raw) {
                if value != WEBVIEW_FETCH_PENDING {
                    break value;
                }
            }
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    };
    let envelope: serde_json::Value = serde_json::from_str(&raw_result)
        .map_err(|e| format!("Failed to parse WebView script result: {e}"))?;
    if envelope.get("ok").and_then(|value| value.as_bool()) != Some(true) {
        return Err(format!(
            "WEBJS_EXECUTION_FAILED: {}",
            envelope
                .get("error")
                .and_then(|value| value.as_str())
                .unwrap_or("未知错误")
        ));
    }
    Ok(WebviewScriptResponse {
        result: envelope
            .get("result")
            .cloned()
            .unwrap_or(serde_json::Value::Null),
    })
}

fn is_browser_managed_header(name: &str) -> bool {
    let name = name.to_ascii_lowercase();
    matches!(
        name.as_str(),
        "accept-encoding"
            | "connection"
            | "content-length"
            | "cookie"
            | "host"
            | "origin"
            | "referer"
            | "user-agent"
    ) || name.starts_with("proxy-")
        || name.starts_with("sec-")
}

fn decode_webview_callback_value(raw: String) -> Option<String> {
    if raw.is_empty() || raw == "null" || raw == "undefined" {
        return None;
    }

    serde_json::from_str::<String>(&raw).ok().or(Some(raw))
}

async fn wait_for_webview_document(
    webview: &tauri::WebviewWindow,
    timeout: Duration,
) -> Result<(), String> {
    let deadline = Instant::now() + timeout;

    loop {
        if Instant::now() >= deadline {
            return Err("Timed out while initializing background WebView".to_string());
        }

        let (tx, rx) = tokio::sync::oneshot::channel();
        let tx_mutex = Arc::new(std::sync::Mutex::new(Some(tx)));
        webview
            .eval_with_callback("document.readyState", move |result| {
                if let Some(tx) = tx_mutex.lock().ok().and_then(|mut guard| guard.take()) {
                    let _ = tx.send(result);
                }
            })
            .map_err(|e| format!("Failed to inspect background WebView state: {e}"))?;

        if let Ok(Ok(raw)) = tokio::time::timeout(Duration::from_millis(500), rx).await {
            if matches!(
                decode_webview_callback_value(raw).as_deref(),
                Some("interactive" | "complete")
            ) {
                return Ok(());
            }
        }

        tokio::time::sleep(Duration::from_millis(100)).await;
    }
}

async fn ensure_source_webview(
    app: &tauri::AppHandle,
    source_id: &str,
    request_url: &url::Url,
    timeout: Duration,
) -> Result<tauri::WebviewWindow, String> {
    use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

    let window_label = make_window_label(source_id);
    let webview = if let Some(existing) = app.get_webview_window(&window_label) {
        existing
    } else {
        let mut base_url = request_url.clone();
        base_url.set_path("/");
        base_url.set_query(None);
        base_url.set_fragment(None);

        match WebviewWindowBuilder::new(app, &window_label, WebviewUrl::External(base_url))
            .title("书源后台认证")
            .visible(false)
            .build()
        {
            Ok(window) => {
                preserve_auth_webview_on_close(&window);
                window
            }
            Err(error) => app.get_webview_window(&window_label).ok_or_else(|| {
                format!("Failed to create background verification WebView: {error}")
            })?,
        }
    };

    wait_for_webview_document(&webview, timeout).await?;
    Ok(webview)
}

#[tauri::command]
pub async fn sync_webview_cookies(
    app: tauri::AppHandle,
    source_id: String,
    url: String,
    state: tauri::State<'_, AppState>,
) -> Result<SyncCookieResult, String> {
    validate_url(&url)?;
    let parsed_url = url::Url::parse(&url).map_err(|e| format!("Invalid URL: {}", e))?;
    let webview =
        ensure_source_webview(&app, &source_id, &parsed_url, Duration::from_secs(15)).await?;

    let cookies = webview
        .cookies_for_url(parsed_url.clone())
        .map_err(|e| format!("Failed to get cookies: {}", e))?;

    let mut cookie_strs = Vec::new();
    let mut cookie_names = Vec::new();
    let mut has_cf_clearance = false;

    for c in &cookies {
        let name = c.name();
        let value = c.value();
        cookie_strs.push(format!("{}={}", name, value));
        cookie_names.push(name.to_string());
        if name == "cf_clearance" {
            has_cf_clearance = true;
        }
    }

    let cookie_str = cookie_strs.join("; ");
    if !cookie_str.is_empty() {
        let mut manager = state.cookie_manager.lock().await;
        manager.set_cookies(&source_id, &url, &cookie_str)?;
    }

    Ok(SyncCookieResult {
        cookie_count: cookies.len(),
        cookie_names,
        has_cf_clearance,
    })
}

#[tauri::command]
pub async fn check_cf_clearance(
    app: tauri::AppHandle,
    source_id: String,
    url: String,
) -> Result<bool, String> {
    validate_url(&url)?;
    let parsed_url = url::Url::parse(&url).map_err(|e| format!("Invalid URL: {}", e))?;
    let webview =
        ensure_source_webview(&app, &source_id, &parsed_url, Duration::from_secs(15)).await?;

    let cookies = webview
        .cookies_for_url(parsed_url)
        .map_err(|e| format!("Failed to get cookies: {}", e))?;
    for c in &cookies {
        if c.name() == "cf_clearance" {
            return Ok(true);
        }
    }
    Ok(false)
}

#[tauri::command]
pub async fn webview_fetch(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    request: WebviewFetchRequest,
) -> Result<SourceResponse, String> {
    let WebviewFetchRequest {
        source_id,
        url,
        method,
        headers,
        body,
        timeout_ms,
        delay_ms,
        follow_redirects,
        use_cookie_jar,
        response_type,
    } = request;
    validate_url(&url)?;
    let parsed_url = url::Url::parse(&url).map_err(|e| format!("Invalid URL: {}", e))?;
    let timeout = timeout_ms.unwrap_or(30000);
    let initialization_timeout = Duration::from_millis(timeout.clamp(1_000, 15_000));
    let webview =
        ensure_source_webview(&app, &source_id, &parsed_url, initialization_timeout).await?;
    if let Some(delay) = delay_ms.filter(|value| *value > 0) {
        tokio::time::sleep(Duration::from_millis(delay.min(60_000))).await;
    }

    // WebKit 的网站数据目录会跨应用重启保存 Cookie。隐藏 WebView 加载完成后，
    // 将当前可用 Cookie 同步到 reqwest CookieJar，供非 WebView回退路径复用。
    let persisted_cookies = webview
        .cookies_for_url(parsed_url.clone())
        .map_err(|e| format!("Failed to read cookies from background WebView: {e}"))?;
    if !persisted_cookies.is_empty() {
        let cookie_header = persisted_cookies
            .iter()
            .map(|cookie| format!("{}={}", cookie.name(), cookie.value()))
            .collect::<Vec<_>>()
            .join("; ");
        let mut manager = state.cookie_manager.lock().await;
        manager.set_cookies(&source_id, &url, &cookie_header)?;
    }

    let request_id = format!(
        "{}-{}",
        std::process::id(),
        WEBVIEW_FETCH_SEQUENCE.fetch_add(1, Ordering::Relaxed)
    );
    let method_str = method.to_uppercase();
    let fetch_headers: HashMap<String, String> = headers
        .unwrap_or_default()
        .into_iter()
        .filter(|(name, _)| !is_browser_managed_header(name))
        .collect();
    let store_json = serde_json::to_string(WEBVIEW_FETCH_RESULT_STORE)
        .map_err(|e| format!("Failed to serialize WebView store key: {e}"))?;
    let pending_json = serde_json::to_string(WEBVIEW_FETCH_PENDING)
        .map_err(|e| format!("Failed to serialize WebView pending marker: {e}"))?;
    let request_id_json = serde_json::to_string(&request_id)
        .map_err(|e| format!("Failed to serialize WebView request id: {e}"))?;
    let url_json = serde_json::to_string(&url)
        .map_err(|e| format!("Failed to serialize WebView request URL: {e}"))?;
    let method_json = serde_json::to_string(&method_str)
        .map_err(|e| format!("Failed to serialize WebView request method: {e}"))?;
    let headers_json = serde_json::to_string(&fetch_headers)
        .map_err(|e| format!("Failed to serialize WebView request headers: {e}"))?;
    let body_json = serde_json::to_string(&body)
        .map_err(|e| format!("Failed to serialize WebView request body: {e}"))?;
    let redirect_mode = if follow_redirects == Some(false) {
        "manual"
    } else {
        "follow"
    };
    let credentials_mode = if use_cookie_jar == Some(false) {
        "omit"
    } else {
        "include"
    };
    let binary_response = matches!(response_type.as_deref(), Some("binary" | "hex"));

    let js_code = format!(
        r#"(() => {{
  const storeKey = {store};
  const requestId = {request_id};
  const pending = {pending};
  const store = window[storeKey] ?? (window[storeKey] = Object.create(null));
  store[requestId] = pending;

  void (async () => {{
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), {timeout});
    try {{
      const requestBody = {body};
      const resp = await fetch({url}, {{
        method: {method},
        headers: {headers},
        body: requestBody === null ? undefined : requestBody,
        credentials: '{credentials}',
        redirect: '{redirect}',
        signal: controller.signal
      }});
      const declaredLength = Number(resp.headers.get('content-length'));
      if (Number.isFinite(declaredLength) && declaredLength > {max_body_bytes}) {{
        throw new Error('Response body too large (max 10MB)');
      }}
      const chunks = [];
      let totalLength = 0;
      if (resp.body) {{
        const reader = resp.body.getReader();
        while (true) {{
          const {{ done, value }} = await reader.read();
          if (done) break;
          if (totalLength + value.byteLength > {max_body_bytes}) {{
            await reader.cancel();
            throw new Error('Response body too large (max 10MB)');
          }}
          chunks.push(value);
          totalLength += value.byteLength;
        }}
      }}
      const bytes = new Uint8Array(totalLength);
      let writeOffset = 0;
      for (const chunk of chunks) {{
        bytes.set(chunk, writeOffset);
        writeOffset += chunk.byteLength;
      }}
      let text = null;
      let bodyBase64 = null;
      if ({binary}) {{
        let binaryText = '';
        for (let offset = 0; offset < bytes.length; offset += 32768) {{
          binaryText += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
        }}
        bodyBase64 = btoa(binaryText);
      }} else {{
        text = new TextDecoder().decode(bytes);
      }}
      const hdrs = {{}};
      resp.headers.forEach((value, name) => {{ hdrs[name] = value; }});
      store[requestId] = JSON.stringify({{
        ok: true,
        status: resp.status,
        finalUrl: resp.url,
        headers: hdrs,
        body: text,
        bodyBase64
      }});
    }} catch (error) {{
      store[requestId] = JSON.stringify({{
        ok: false,
        error: error?.message || String(error)
      }});
    }} finally {{
      clearTimeout(timeoutId);
    }}
  }})();
}})()"#,
        store = store_json,
        request_id = request_id_json,
        pending = pending_json,
        timeout = timeout,
        url = url_json,
        method = method_json,
        headers = headers_json,
        body = body_json,
        credentials = credentials_mode,
        redirect = redirect_mode,
        binary = binary_response,
        max_body_bytes = MAX_RESPONSE_BODY_BYTES,
    );

    webview
        .eval(&js_code)
        .map_err(|e| format!("Failed to start WebView fetch: {e}"))?;

    let poll_js = format!(
        r#"(() => {{
  const store = window[{store}];
  const value = store?.[{request_id}];
  if (value === undefined || value === {pending}) return {pending};
  delete store[{request_id}];
  return value;
}})()"#,
        store = store_json,
        request_id = request_id_json,
        pending = pending_json,
    );
    let cleanup_js = format!(
        "delete window[{store}]?.[{request_id}]",
        store = store_json,
        request_id = request_id_json,
    );

    let deadline = Instant::now() + Duration::from_millis(timeout + 5000);
    let js_str_unquoted = loop {
        if Instant::now() >= deadline {
            let _ = webview.eval(&cleanup_js);
            return Err("Timeout waiting for WebView fetch result".to_string());
        }

        let (tx, rx) = tokio::sync::oneshot::channel();
        let tx_mutex = Arc::new(std::sync::Mutex::new(Some(tx)));
        webview
            .eval_with_callback(&poll_js, move |result| {
                if let Some(tx) = tx_mutex.lock().ok().and_then(|mut guard| guard.take()) {
                    let _ = tx.send(result);
                }
            })
            .map_err(|e| format!("Failed to poll WebView fetch result: {e}"))?;

        if let Ok(Ok(raw)) = tokio::time::timeout(Duration::from_secs(2), rx).await {
            if let Some(value) = decode_webview_callback_value(raw) {
                if value != WEBVIEW_FETCH_PENDING {
                    break value;
                }
            }
        }

        tokio::time::sleep(Duration::from_millis(50)).await;
    };

    let fetch_result: WebviewFetchResult = serde_json::from_str(&js_str_unquoted)
        .map_err(|e| format!("Failed to parse WebView fetch result: {e}"))?;

    if !fetch_result.ok {
        return Err(fetch_result
            .error
            .unwrap_or_else(|| "Unknown fetch error".to_string()));
    }

    if let Some(final_url) = fetch_result.final_url.as_deref() {
        validate_url(final_url)?;
    }

    let response_body = if let Some(encoded) = fetch_result.body_base64 {
        use base64::Engine;
        base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .map_err(|e| format!("Failed to decode WebView binary response: {e}"))?
    } else {
        fetch_result.body.unwrap_or_default().into_bytes()
    };
    if response_body.len() > MAX_RESPONSE_BODY_BYTES {
        return Err("Response body too large (max 10MB)".to_string());
    }

    let updated_cookies = webview
        .cookies_for_url(parsed_url)
        .map_err(|e| format!("Failed to read WebView response cookies: {e}"))?;
    if !updated_cookies.is_empty() {
        let cookie_header = updated_cookies
            .iter()
            .map(|cookie| format!("{}={}", cookie.name(), cookie.value()))
            .collect::<Vec<_>>()
            .join("; ");
        let mut manager = state.cookie_manager.lock().await;
        manager.set_cookies(&source_id, &url, &cookie_header)?;
    }

    Ok(SourceResponse {
        status: fetch_result.status.unwrap_or(200),
        final_url: fetch_result.final_url.unwrap_or_else(|| url.clone()),
        headers: fetch_result.headers.unwrap_or_default(),
        body: response_body,
        charset: None,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SolveChallengeResult {
    pub success: bool,
    pub html: Option<String>,
    pub cookies: Vec<String>,
    pub requires_manual_interaction: bool,
}

#[tauri::command]
pub async fn solve_webview_challenge(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    source_id: String,
    url: String,
    timeout_ms: Option<u64>,
) -> Result<SolveChallengeResult, String> {
    validate_url(&url)?;
    let parsed_url = url::Url::parse(&url).map_err(|e| format!("Invalid URL: {e}"))?;
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(5000).clamp(1000, 15000));

    let webview =
        ensure_source_webview(&app, &source_id, &parsed_url, Duration::from_secs(10)).await?;

    // 让后台隐藏 WebView 导航到具体的章节/目标页面 URL
    let target_url_json = serde_json::to_string(&url).map_err(|e| e.to_string())?;
    let target_path_json = serde_json::to_string(parsed_url.path()).map_err(|e| e.to_string())?;
    let navigate_js = format!("window.location.href = {};", target_url_json);
    let _ = webview.eval(&navigate_js);

    let check_js = format!(
        r#"(() => {{
        const state = document.readyState;
        const title = (document.title || '').toLowerCase();
        const text = (document.body ? document.body.innerText : '').slice(0, 500).toLowerCase();
        const currentUrl = window.location.href;
        const currentPath = window.location.pathname;
        const targetUrl = {target_url_json};
        const targetPath = {target_path_json};

        // 确保已真正导航至目标页面（或路径包含目标章节路径）
        const urlMatched = targetPath === '/' || currentPath === targetPath || currentUrl.includes(targetPath);

        const isChallenge = [
            '正在验证浏览器',
            '正在進行安全驗證',
            '正在进行安全验证',
            '安全验证',
            '请稍等',
            'checking your browser',
            'just a moment',
            'attention required',
            'ddos protection'
        ].some(kw => title.includes(kw) || text.includes(kw));

        const isCaptcha = [
            '滑动验证',
            '人机安全验证',
            '点击完成验证',
            'geetest',
            '极验',
            '请输入验证码'
        ].some(kw => text.includes(kw));

        // 已经脱离 challenge，目标 URL 已匹配，且 DOM 就绪 (interactive 或 complete)
        const isReady = urlMatched && (state === 'interactive' || state === 'complete') && !isChallenge;
        const html = isReady ? document.documentElement.outerHTML : null;

        return JSON.stringify({{
            ready: isReady,
            isChallenge: isChallenge,
            isCaptcha: isCaptcha,
            url: currentUrl,
            html: html
        }});
    }})()"#
    );

    let deadline = Instant::now() + timeout;
    let mut last_html: Option<String> = None;

    while Instant::now() < deadline {
        let (tx, rx) = tokio::sync::oneshot::channel();
        let tx_mutex = Arc::new(std::sync::Mutex::new(Some(tx)));
        if webview
            .eval_with_callback(&check_js, move |result| {
                if let Some(tx) = tx_mutex.lock().ok().and_then(|mut guard| guard.take()) {
                    let _ = tx.send(result);
                }
            })
            .is_ok()
        {
            if let Ok(Ok(raw)) = tokio::time::timeout(Duration::from_millis(500), rx).await {
                if let Some(val_str) = decode_webview_callback_value(raw) {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&val_str) {
                        let ready = val.get("ready").and_then(|v| v.as_bool()).unwrap_or(false);
                        if ready {
                            if let Some(html) = val.get("html").and_then(|v| v.as_str()) {
                                if !html.is_empty() {
                                    last_html = Some(html.to_string());
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }

    let updated_cookies = webview
        .cookies_for_url(parsed_url)
        .map_err(|e| format!("Failed to read WebView response cookies: {e}"))?;
    let mut cookie_list = Vec::new();
    if !updated_cookies.is_empty() {
        let cookie_header = updated_cookies
            .iter()
            .map(|cookie| {
                let item = format!("{}={}", cookie.name(), cookie.value());
                cookie_list.push(item.clone());
                item
            })
            .collect::<Vec<_>>()
            .join("; ");
        let mut manager = state.cookie_manager.lock().await;
        manager.set_cookies(&source_id, &url, &cookie_header)?;
    }

    if let Some(html) = last_html {
        Ok(SolveChallengeResult {
            success: true,
            html: Some(html),
            cookies: cookie_list,
            requires_manual_interaction: false,
        })
    } else {
        Ok(SolveChallengeResult {
            success: false,
            html: None,
            cookies: cookie_list,
            requires_manual_interaction: true,
        })
    }
}

#[tauri::command]
pub async fn toggle_fullscreen(window: tauri::WebviewWindow) -> Result<bool, String> {
    let is_fullscreen = window.is_fullscreen().map_err(|e| e.to_string())?;
    window
        .set_fullscreen(!is_fullscreen)
        .map_err(|e| e.to_string())?;
    Ok(!is_fullscreen)
}

#[tauri::command]
pub async fn exit_fullscreen(window: tauri::WebviewWindow) -> Result<(), String> {
    let is_fullscreen = window.is_fullscreen().map_err(|e| e.to_string())?;
    if is_fullscreen {
        window.set_fullscreen(false).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        decode_webview_callback_value, exceeds_response_body_limit, is_browser_managed_header,
        make_window_label, WebviewFetchRequest, MAX_RESPONSE_BODY_BYTES,
    };

    #[test]
    fn creates_stable_non_colliding_auth_window_labels() {
        let first = make_window_label("https://a-b.example");
        let second = make_window_label("https://a.b.example");

        assert_eq!(first, make_window_label("https://a-b.example"));
        assert_ne!(first, second);
        assert!(first.starts_with("auth_"));
        assert!(first[5..]
            .chars()
            .all(|character| character.is_ascii_hexdigit()));
    }

    #[test]
    fn rejects_a_chunk_before_it_pushes_a_response_over_the_limit() {
        assert!(!exceeds_response_body_limit(MAX_RESPONSE_BODY_BYTES - 1, 1));
        assert!(exceeds_response_body_limit(MAX_RESPONSE_BODY_BYTES, 1));
        assert!(exceeds_response_body_limit(usize::MAX, 1));
    }

    #[test]
    fn filters_headers_owned_by_the_browser() {
        for name in [
            "Cookie",
            "User-Agent",
            "Referer",
            "Sec-Fetch-Mode",
            "Proxy-Authorization",
        ] {
            assert!(
                is_browser_managed_header(name),
                "header should be filtered: {name}"
            );
        }

        for name in ["Accept", "Accept-Language", "Content-Type", "X-Book-Source"] {
            assert!(
                !is_browser_managed_header(name),
                "header should be retained: {name}"
            );
        }
    }

    #[test]
    fn decodes_json_encoded_webview_callback_strings() {
        let encoded = serde_json::to_string(r#"{"ok":true,"status":200}"#).unwrap();
        assert_eq!(
            decode_webview_callback_value(encoded).as_deref(),
            Some(r#"{"ok":true,"status":200}"#)
        );
        assert_eq!(decode_webview_callback_value(String::new()), None);
        assert_eq!(decode_webview_callback_value("null".to_string()), None);
    }

    #[test]
    fn deserializes_webview_fetch_request_from_camel_case_ipc_payload() {
        let request: WebviewFetchRequest = serde_json::from_value(serde_json::json!({
            "sourceId": "source-1",
            "url": "https://example.com/start",
            "method": "POST",
            "headers": { "accept": "text/plain" },
            "body": "payload",
            "timeoutMs": 12000,
            "delayMs": 300,
            "followRedirects": false,
            "useCookieJar": false,
            "responseType": "binary"
        }))
        .unwrap();

        assert_eq!(request.source_id, "source-1");
        assert_eq!(request.timeout_ms, Some(12_000));
        assert_eq!(request.delay_ms, Some(300));
        assert_eq!(request.follow_redirects, Some(false));
        assert_eq!(request.use_cookie_jar, Some(false));
        assert_eq!(request.response_type.as_deref(), Some("binary"));
    }
}
