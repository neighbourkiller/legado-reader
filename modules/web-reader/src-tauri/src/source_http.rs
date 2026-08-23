use crate::cookie_store::CookieManager;
use crate::source_policy::validate_url;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::error::Error;
use std::str::FromStr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
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
}

impl AppState {
    pub fn new() -> Self {
        Self {
            cookie_manager: Arc::new(Mutex::new(CookieManager::new())),
        }
    }
}

const MAX_ERROR_CHAIN_DEPTH: usize = 8;

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

#[tauri::command]
pub async fn source_request(
    request: SourceRequest,
    state: tauri::State<'_, AppState>,
) -> Result<SourceResponse, String> {
    // 1. URL Safety Check
    validate_url(&request.url)?;

    // Extract User-Agent from request.headers if present
    let custom_ua = request.headers.as_ref().and_then(|h| {
        h.get("User-Agent")
            .or_else(|| h.get("user-agent"))
            .or_else(|| h.get("User-agent"))
            .cloned()
    });

    // 2. Get or create HTTP Client for the source
    let client = {
        let mut manager = state.cookie_manager.lock().await;
        manager.get_or_create_client(&request.source_id, custom_ua.as_deref())?
    };

    // 3. Build reqwest Request
    let method = match request.method.to_uppercase().as_str() {
        "POST" => Method::POST,
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

    // 4. Set Timeout (Default 30s)
    let timeout_secs = request.timeout.unwrap_or(30);
    req_builder = req_builder.timeout(Duration::from_secs(timeout_secs));

    // 5. Send Request
    let response = req_builder
        .send()
        .await
        .map_err(|error| format_request_error("send", error))?;

    // 6. Extract response info
    let status = response.status().as_u16();
    let final_url = response.url().to_string();

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

    // 8. Limit response body size (Max 10MB) & Return raw bytes
    let bytes = response
        .bytes()
        .await
        .map_err(|error| format_request_error("read_body", error))?;

    if bytes.len() > 10 * 1024 * 1024 {
        return Err("Response body too large (max 10MB)".to_string());
    }

    Ok(SourceResponse {
        status,
        final_url,
        headers: resp_headers,
        body: bytes.to_vec(),
        charset,
    })
}

#[tauri::command]
pub async fn set_source_cookies(
    source_id: String,
    url: String,
    cookie_str: String,
    user_agent: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let mut manager = state.cookie_manager.lock().await;
    manager.set_cookies(&source_id, &url, &cookie_str)?;
    if let Some(ua) = user_agent {
        if !ua.trim().is_empty() {
            manager.set_user_agent(&source_id, &ua);
        }
    }
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
    let safe_id: String = source_id
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '_' })
        .collect();
    format!("auth_{}", safe_id)
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
    error: Option<String>,
}

const WEBVIEW_FETCH_RESULT_STORE: &str = "__legadoWebviewFetchResults";
const WEBVIEW_FETCH_PENDING: &str = "__LEGADO_FETCH_PENDING__";
static WEBVIEW_FETCH_SEQUENCE: AtomicU64 = AtomicU64::new(1);

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
    source_id: String,
    url: String,
    method: String,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<SourceResponse, String> {
    validate_url(&url)?;
    let parsed_url = url::Url::parse(&url).map_err(|e| format!("Invalid URL: {}", e))?;
    let timeout = timeout_ms.unwrap_or(30000);
    let initialization_timeout = Duration::from_millis(timeout.clamp(1_000, 15_000));
    let webview =
        ensure_source_webview(&app, &source_id, &parsed_url, initialization_timeout).await?;

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
        credentials: 'include',
        signal: controller.signal
      }});
      const text = await resp.text();
      const hdrs = {{}};
      resp.headers.forEach((value, name) => {{ hdrs[name] = value; }});
      store[requestId] = JSON.stringify({{
        ok: true,
        status: resp.status,
        finalUrl: resp.url,
        headers: hdrs,
        body: text
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

    let response_body = fetch_result.body.unwrap_or_default().into_bytes();
    if response_body.len() > 10 * 1024 * 1024 {
        return Err("Response body too large (max 10MB)".to_string());
    }

    Ok(SourceResponse {
        status: fetch_result.status.unwrap_or(200),
        final_url: fetch_result.final_url.unwrap_or_else(|| url.clone()),
        headers: fetch_result.headers.unwrap_or_default(),
        body: response_body,
        charset: None,
    })
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
    use super::{decode_webview_callback_value, is_browser_managed_header};

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
}
