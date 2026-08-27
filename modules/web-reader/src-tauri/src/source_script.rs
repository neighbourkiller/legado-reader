use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use base64::Engine;
use reqwest::blocking::Client;
use reqwest::cookie::{CookieStore, Jar};
use rquickjs::{Context, Function, Runtime};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use url::Url;

use crate::source_policy::validate_url;

const DEFAULT_MEMORY_LIMIT: usize = 64 * 1024 * 1024;
const DEFAULT_STACK_LIMIT: usize = 512 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceScriptRequest {
    pub source_id: String,
    pub code: String,
    #[serde(default)]
    pub bindings: Value,
    pub timeout_ms: Option<u64>,
    pub memory_limit_bytes: Option<usize>,
    pub stack_limit_bytes: Option<usize>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceScriptResponse {
    pub result: Value,
    pub logs: Vec<String>,
    #[serde(default)]
    pub variables: HashMap<String, String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceScriptError {
    pub code: &'static str,
    pub stage: &'static str,
    pub message: String,
}

fn script_error(code: &'static str, message: impl Into<String>) -> SourceScriptError {
    SourceScriptError { code, stage: "javascript", message: message.into() }
}

#[derive(Deserialize)]
struct AjaxOptions {
    url: String,
    method: Option<String>,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
    timeout: Option<u64>,
}

#[derive(Deserialize)]
struct ScriptEvaluationPayload {
    result: Value,
    #[serde(default)]
    variables: HashMap<String, String>,
}

fn execute_script(
    request: SourceScriptRequest,
    cookie_jar: Arc<Jar>,
) -> Result<SourceScriptResponse, SourceScriptError> {
    if request.code.contains("Packages") || request.code.contains("java.io.")
        || request.code.contains("java.nio.file")
    {
        return Err(script_error(
            "UNSUPPORTED_ANDROID_API",
            "脚本调用了 Packages、任意 Java 类或 Android 文件系统",
        ));
    }

    let timeout = Duration::from_millis(request.timeout_ms.unwrap_or(3_000).clamp(50, 30_000));
    let deadline = Instant::now() + timeout;
    let runtime = Runtime::new().map_err(|error| script_error("JS_RUNTIME_INIT", error.to_string()))?;
    runtime.set_memory_limit(request.memory_limit_bytes.unwrap_or(DEFAULT_MEMORY_LIMIT).clamp(1024 * 1024, 256 * 1024 * 1024));
    runtime.set_max_stack_size(request.stack_limit_bytes.unwrap_or(DEFAULT_STACK_LIMIT).clamp(64 * 1024, 8 * 1024 * 1024));
    runtime.set_interrupt_handler(Some(Box::new(move || Instant::now() >= deadline)));
    let context = Context::full(&runtime).map_err(|error| script_error("JS_CONTEXT_INIT", error.to_string()))?;
    let logs = Arc::new(Mutex::new(Vec::<String>::new()));
    let client = Client::builder()
        .cookie_provider(cookie_jar.clone())
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|error| script_error("JS_HTTP_INIT", error.to_string()))?;

    let json_result = context.with(|ctx| -> rquickjs::Result<String> {
        let globals = ctx.globals();
        let ajax_client = client.clone();
        globals.set("__hostAjax", Function::new(ctx.clone(), move |raw: String| -> rquickjs::Result<String> {
            let options = if raw.trim_start().starts_with('{') {
                serde_json::from_str::<AjaxOptions>(&raw).map_err(|error|
                    rquickjs::Error::new_from_js_message("string", "AjaxOptions", error.to_string()))?
            } else {
                AjaxOptions { url: raw, method: None, headers: None, body: None, timeout: None }
            };
            validate_url(&options.url).map_err(|error|
                rquickjs::Error::new_from_js_message("url", "safe URL", error))?;
            let method = options.method.as_deref().unwrap_or("GET").to_uppercase();
            let mut builder = match method.as_str() {
                "POST" => ajax_client.post(&options.url),
                "HEAD" => ajax_client.head(&options.url),
                _ => ajax_client.get(&options.url),
            }.timeout(Duration::from_millis(options.timeout.unwrap_or(15_000).clamp(100, 60_000)));
            if let Some(headers) = options.headers {
                for (name, value) in headers { builder = builder.header(name, value); }
            }
            if let Some(body) = options.body { builder = builder.body(body); }
            builder.send().and_then(|response| response.text()).map_err(|error|
                rquickjs::Error::new_from_js_message("HTTP", "string", error.to_string()))
        })?)?;

        let get_jar = cookie_jar.clone();
        globals.set("__hostGetCookie", Function::new(ctx.clone(), move |url: String| -> String {
            Url::parse(&url).ok().and_then(|parsed| get_jar.cookies(&parsed))
                .and_then(|value| value.to_str().ok().map(ToOwned::to_owned)).unwrap_or_default()
        })?)?;
        let set_jar = cookie_jar.clone();
        globals.set("__hostSetCookie", Function::new(ctx.clone(), move |url: String, cookie: String| {
            if let Ok(parsed) = Url::parse(&url) { set_jar.add_cookie_str(&cookie, &parsed); }
        })?)?;

        globals.set("__hostBase64Encode", Function::new(ctx.clone(), |value: String| {
            base64::engine::general_purpose::STANDARD.encode(value.as_bytes())
        })?)?;
        globals.set("__hostBase64Decode", Function::new(ctx.clone(), |value: String| -> String {
            base64::engine::general_purpose::STANDARD.decode(value)
                .ok().and_then(|bytes| String::from_utf8(bytes).ok()).unwrap_or_default()
        })?)?;
        globals.set("__hostHexEncode", Function::new(ctx.clone(), |value: String| -> String {
            value.as_bytes().iter().map(|byte| format!("{byte:02x}")).collect()
        })?)?;
        globals.set("__hostHexDecodeToString", Function::new(ctx.clone(), |value: String| -> String {
            let clean: String = value.chars().filter(|c| !c.is_whitespace()).collect();
            if clean.len() % 2 != 0 {
                return String::new();
            }
            let bytes: Vec<u8> = (0..clean.len())
                .step_by(2)
                .filter_map(|i| u8::from_str_radix(&clean[i..i + 2], 16).ok())
                .collect();
            String::from_utf8(bytes).unwrap_or_default()
        })?)?;
        globals.set("__hostHexDecode", Function::new(ctx.clone(), |value: String| -> Vec<u8> {
            let clean: String = value.chars().filter(|c| !c.is_whitespace()).collect();
            if clean.len() % 2 != 0 {
                return Vec::new();
            }
            (0..clean.len())
                .step_by(2)
                .filter_map(|i| u8::from_str_radix(&clean[i..i + 2], 16).ok())
                .collect()
        })?)?;
        let script_logs = logs.clone();
        globals.set("__hostLog", Function::new(ctx.clone(), move |message: String| {
            if let Ok(mut entries) = script_logs.lock() { entries.push(message); }
        })?)?;

        let bindings_json = serde_json::to_string(&request.bindings).unwrap_or_else(|_| "{}".to_string());
        let code_json = serde_json::to_string(&request.code).unwrap_or_else(|_| "\"\"".to_string());
        let bootstrap = format!(r#"
            const __bindings = {bindings_json};
            Object.assign(globalThis, __bindings);
            globalThis.__variables = Object.assign({{}}, __bindings.variables || {{}});
            globalThis.java = Object.freeze({{
              ajax: value => __hostAjax(typeof value === 'string' ? value : JSON.stringify(value)),
              getCookie: url => __hostGetCookie(String(url)),
              setCookie: (url, cookie) => __hostSetCookie(String(url), String(cookie)),
              base64Encode: value => __hostBase64Encode(String(value)),
              base64Decode: value => __hostBase64Decode(String(value)),
              hexEncode: value => __hostHexEncode(String(value)),
              hexDecode: value => __hostHexDecode(String(value)),
              hexDecodeToString: value => __hostHexDecodeToString(String(value)),
              log: value => __hostLog(typeof value === 'string' ? value : JSON.stringify(value)),
              get: key => globalThis.__variables[key],
              put: (key, value) => {{ const str = String(value); globalThis.__variables[key] = str; return value; }}
            }});
            globalThis.console = Object.freeze({{ log: (...args) => __hostLog(args.map(String).join(' ')) }});
            const __code = {code_json};
            let __result;
            try {{ __result = (0, eval)(__code); }}
            catch (__error) {{
              if (/return/i.test(String(__error))) __result = Function(__code)();
              else throw __error;
            }}
            JSON.stringify({{
              result: __result === undefined ? null : __result,
              variables: globalThis.__variables
            }});
        "#);
        match ctx.eval::<String, _>(bootstrap) {
            Ok(val) => Ok(val),
            Err(error) => {
                let caught = ctx.catch();
                let detail = if caught.is_null() {
                    "out of memory: memory limit exceeded".to_string()
                } else if let Some(ex) = caught.as_exception() {
                    ex.message().unwrap_or_else(|| ex.to_string())
                } else {
                    format!("{error}: {caught:?}")
                };
                Err(rquickjs::Error::new_from_js_message("JS", "eval", detail))
            }
        }
    }).map_err(|error| {
        let err_str = error.to_string();
        let code = if Instant::now() >= deadline { "JS_TIMEOUT" }
            else if err_str.to_lowercase().contains("memory") || err_str.to_lowercase().contains("allocation") { "JS_MEMORY_LIMIT" }
            else { "JS_EXECUTION_FAILED" };
        script_error(code, err_str)
    })?;

    let payload: ScriptEvaluationPayload = serde_json::from_str(&json_result)
        .map_err(|error| script_error("JS_RESULT_SERIALIZATION", error.to_string()))?;
    let logs = logs.lock().map(|entries| entries.clone()).unwrap_or_default();
    Ok(SourceScriptResponse { result: payload.result, logs, variables: payload.variables })
}

#[tauri::command]
pub async fn execute_source_script(
    request: SourceScriptRequest,
    state: tauri::State<'_, crate::source_http::AppState>,
) -> Result<SourceScriptResponse, SourceScriptError> {
    let jar = {
        let mut manager = state.cookie_manager.lock().await;
        manager.get_or_create_jar(&request.source_id)
    };
    tokio::task::spawn_blocking(move || execute_script(request, jar)).await
        .map_err(|error| script_error("JS_TASK_FAILED", error.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(code: &str, timeout_ms: u64) -> Result<SourceScriptResponse, SourceScriptError> {
        execute_script(SourceScriptRequest {
            source_id: "test".to_string(), code: code.to_string(), bindings: serde_json::json!({"key":"abc"}),
            timeout_ms: Some(timeout_ms), memory_limit_bytes: None, stack_limit_bytes: None,
        }, Arc::new(Jar::default()))
    }

    #[test]
    fn executes_common_host_apis() {
        let response = run("java.log(key); ({value: java.base64Decode(java.base64Encode(key))})", 1_000).unwrap();
        assert_eq!(response.result["value"], "abc");
        assert_eq!(response.logs, vec!["abc"]);
    }

    #[test]
    fn decodes_hex_to_string() {
        let response = run("java.hexDecodeToString(java.hexEncode('测试文本'))", 1_000).unwrap();
        assert_eq!(response.result, "测试文本");
    }

    #[test]
    fn mutates_and_returns_variables() {
        let response = run("java.put('sessionKey', '123456'); java.get('sessionKey')", 1_000).unwrap();
        assert_eq!(response.result, "123456");
        assert_eq!(response.variables.get("sessionKey").map(String::as_str), Some("123456"));
    }

    #[test]
    fn executes_main_js_pattern() {
        let response = run("function search(key) { return [{ name: key + '书名' }]; }; search(key)", 1_000).unwrap();
        assert_eq!(response.result[0]["name"], "abc书名");
    }

    #[test]
    fn enforces_memory_limit() {
        let error = execute_script(SourceScriptRequest {
            source_id: "test".to_string(),
            code: "const arr = []; for (let i = 0; i < 1000000; i++) arr.push('memory-overflow-leak-' + i); arr.join('')".to_string(),
            bindings: serde_json::json!({}),
            timeout_ms: Some(2_000),
            memory_limit_bytes: Some(1024 * 1024),
            stack_limit_bytes: None,
        }, Arc::new(Jar::default())).unwrap_err();
        assert_eq!(error.code, "JS_MEMORY_LIMIT");
    }

    #[test]
    fn interrupts_infinite_loop() {
        let error = run("while (true) {}", 50).unwrap_err();
        assert_eq!(error.code, "JS_TIMEOUT");
    }

    #[test]
    fn rejects_android_packages() {
        let error = run("Packages.java.io.File('/tmp')", 1_000).unwrap_err();
        assert_eq!(error.code, "UNSUPPORTED_ANDROID_API");
    }
}
