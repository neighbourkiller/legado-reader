use crate::cookie_store::CookieManager;
use crate::source_policy::validate_url;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Arc;
use tokio::sync::Mutex;
use std::time::Duration;

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

#[tauri::command]
pub async fn source_request(
    request: SourceRequest,
    state: tauri::State<'_, AppState>,
) -> Result<SourceResponse, String> {
    // 1. URL Safety Check
    validate_url(&request.url)?;

    // 2. Get or create HTTP Client for the source
    let client = {
        let mut manager = state.cookie_manager.lock().await;
        manager.get_or_create_client(&request.source_id)?
    };

    // 3. Build reqwest Request
    let method = match request.method.to_uppercase().as_str() {
        "POST" => Method::POST,
        "GET" | _ => Method::GET,
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
        .map_err(|e| format!("Request failed: {}", e))?;

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
        .map_err(|e| format!("Failed to read body: {}", e))?;
    
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
