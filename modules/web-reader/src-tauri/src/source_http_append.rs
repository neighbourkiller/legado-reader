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

#[tauri::command]
pub async fn sync_webview_cookies(
    app: tauri::AppHandle,
    source_id: String,
    url: String,
    state: tauri::State<'_, AppState>,
) -> Result<SyncCookieResult, String> {
    use tauri::Manager;
    validate_url(&url)?;
    let parsed_url = url::Url::parse(&url).map_err(|e| format!("Invalid URL: {}", e))?;
    let window_label = make_window_label(&source_id);
    let webview = app.get_webview_window(&window_label)
        .ok_or_else(|| "WebView window not found".to_string())?;

    let cookies = webview.cookies_for_url(&parsed_url).map_err(|e| format!("Failed to get cookies: {}", e))?;
    
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
    use tauri::Manager;
    validate_url(&url)?;
    let parsed_url = url::Url::parse(&url).map_err(|e| format!("Invalid URL: {}", e))?;
    let window_label = make_window_label(&source_id);
    let webview = app.get_webview_window(&window_label)
        .ok_or_else(|| "WebView window not found".to_string())?;

    let cookies = webview.cookies_for_url(&parsed_url).map_err(|e| format!("Failed to get cookies: {}", e))?;
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
    source_id: String,
    url: String,
    method: String,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<SourceResponse, String> {
    use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
    validate_url(&url)?;
    let parsed_url = url::Url::parse(&url).map_err(|e| format!("Invalid URL: {}", e))?;
    let window_label = make_window_label(&source_id);
    
    let webview = if let Some(existing) = app.get_webview_window(&window_label) {
        existing
    } else {
        let mut base_url = parsed_url.clone();
        base_url.set_path("");
        base_url.set_query(None);
        
        let win = WebviewWindowBuilder::new(&app, &window_label, WebviewUrl::External(base_url))
            .title("Hidden Auth")
            .visible(false)
            .build()
            .map_err(|e| format!("Failed to create auth window: {}", e))?;
        win
    };

    let timeout = timeout_ms.unwrap_or(30000);
    
    let method_str = method.to_uppercase();
    let headers_json = serde_json::to_string(&headers.unwrap_or_default()).unwrap_or_else(|_| "{}".to_string());
    let body_js = match body {
        Some(b) => format!("`{}`", b.replace('`', "\\`")),
        None => "undefined".to_string(),
    };

    let js_code = format!(
        r#"(async () => {{
  try {{
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), {timeout});
    const resp = await fetch("{url}", {{
      method: "{method}",
      headers: {headers},
      body: {body},
      credentials: 'include',
      signal: controller.signal
    }});
    clearTimeout(timeoutId);
    const text = await resp.text();
    const hdrs = {{}};
    resp.headers.forEach((v, k) => {{ hdrs[k] = v; }});
    return JSON.stringify({{
      ok: true,
      status: resp.status,
      finalUrl: resp.url,
      headers: hdrs,
      body: text
    }});
  }} catch(e) {{
    return JSON.stringify({{ ok: false, error: e.message || String(e) }});
  }}
}})()"#,
        timeout = timeout,
        url = url,
        method = method_str,
        headers = headers_json,
        body = body_js
    );

    let (tx, rx) = tokio::sync::oneshot::channel();
    
    webview.eval_with_callback(&js_code, move |result| {
        let _ = tx.send(result);
    }).map_err(|e| format!("Failed to evaluate JS: {}", e))?;

    let js_result = tokio::time::timeout(std::time::Duration::from_millis(timeout + 5000), rx)
        .await
        .map_err(|_| "Timeout waiting for WebView callback".to_string())?
        .map_err(|_| "Channel closed before receiving result".to_string())?;

    let js_str = js_result;
    
    let js_str_unquoted = if js_str.starts_with('"') && js_str.ends_with('"') {
        serde_json::from_str::<String>(&js_str).unwrap_or(js_str)
    } else {
        js_str
    };

    let fetch_result: WebviewFetchResult = serde_json::from_str(&js_str_unquoted)
        .map_err(|e| format!("Failed to parse fetch result: {}", e))?;

    if !fetch_result.ok {
        return Err(fetch_result.error.unwrap_or_else(|| "Unknown fetch error".to_string()));
    }

    Ok(SourceResponse {
        status: fetch_result.status.unwrap_or(200),
        final_url: fetch_result.final_url.unwrap_or_else(|| url.clone()),
        headers: fetch_result.headers.unwrap_or_default(),
        body: fetch_result.body.unwrap_or_default().into_bytes(),
        charset: None,
    })
}
