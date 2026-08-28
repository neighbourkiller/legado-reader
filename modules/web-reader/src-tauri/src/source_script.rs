use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use std::path::{Path, PathBuf};

use base64::Engine;
use aes::{Aes128, Aes192, Aes256};
use des::{Des, TdesEde3};
use cipher::{BlockDecryptMut, BlockEncryptMut, KeyInit, KeyIvInit, block_padding::{NoPadding, Pkcs7}};
use reqwest::blocking::Client;
use reqwest::cookie::{CookieStore, Jar};
use rquickjs::{Context, Function, Runtime};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use url::Url;
use scraper::{Html, Selector};
use regex::Regex;

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

fn symmetric_crypto(action: &str, transformation: &str, key: &[u8], iv: &[u8], data: &[u8]) -> Result<Vec<u8>, String> {
    let upper = transformation.to_uppercase();
    let cbc_mode = upper.contains("/CBC/");
    let no_padding = upper.ends_with("/NOPADDING");
    macro_rules! apply_cipher {
        ($cipher:ty) => {{
            if cbc_mode {
                if action == "encrypt" {
                    let cipher = cbc::Encryptor::<$cipher>::new_from_slices(key, iv).map_err(|e| e.to_string())?;
                    if no_padding { cipher.encrypt_padded_vec_mut::<NoPadding>(data) } else { cipher.encrypt_padded_vec_mut::<Pkcs7>(data) }
                } else {
                    let cipher = cbc::Decryptor::<$cipher>::new_from_slices(key, iv).map_err(|e| e.to_string())?;
                    if no_padding { cipher.decrypt_padded_vec_mut::<NoPadding>(data).map_err(|e| e.to_string())? }
                    else { cipher.decrypt_padded_vec_mut::<Pkcs7>(data).map_err(|e| e.to_string())? }
                }
            } else if action == "encrypt" {
                let cipher = ecb::Encryptor::<$cipher>::new_from_slice(key).map_err(|e| e.to_string())?;
                if no_padding { cipher.encrypt_padded_vec_mut::<NoPadding>(data) } else { cipher.encrypt_padded_vec_mut::<Pkcs7>(data) }
            } else {
                let cipher = ecb::Decryptor::<$cipher>::new_from_slice(key).map_err(|e| e.to_string())?;
                if no_padding { cipher.decrypt_padded_vec_mut::<NoPadding>(data).map_err(|e| e.to_string())? }
                else { cipher.decrypt_padded_vec_mut::<Pkcs7>(data).map_err(|e| e.to_string())? }
            }
        }};
    }
    let result = if upper.starts_with("AES/") {
        match key.len() {
            16 => apply_cipher!(Aes128),
            24 => apply_cipher!(Aes192),
            32 => apply_cipher!(Aes256),
            _ => return Err("AES key must be 16, 24 or 32 bytes".to_string()),
        }
    } else if upper.starts_with("DES/") {
        if key.len() != 8 { return Err("DES key must be 8 bytes".to_string()); }
        apply_cipher!(Des)
    } else if upper.starts_with("DESEDE/") || upper.starts_with("3DES/") {
        if key.len() != 24 { return Err("3DES key must be 24 bytes".to_string()); }
        apply_cipher!(TdesEde3)
    } else {
        return Err(format!("unsupported symmetric transformation: {transformation}"));
    };
    Ok(result)
}

#[derive(Clone, Copy)]
enum XPathCombinator {
    Descendant,
    Child,
}

struct XPathStep {
    combinator: XPathCombinator,
    raw: String,
}

enum XPathDirective {
    Element,
    DirectText,
    DescendantText,
    Html,
    Attribute(String),
}

fn split_xpath_steps(xpath: &str) -> Result<Vec<XPathStep>, String> {
    let mut clean = xpath.trim();
    if clean.get(..7).is_some_and(|prefix| prefix.eq_ignore_ascii_case("@xpath:")) {
        clean = clean[7..].trim();
    } else if clean.get(..6).is_some_and(|prefix| prefix.eq_ignore_ascii_case("xpath:")) {
        clean = clean[6..].trim();
    }
    if let Some(rest) = clean.strip_prefix('.') {
        clean = rest.trim_start();
    }
    if clean.is_empty() {
        return Err("XPath expression is empty".to_string());
    }

    let bytes = clean.as_bytes();
    let mut steps = Vec::new();
    let mut quote = None;
    let mut bracket_depth = 0usize;
    let mut start = 0usize;
    let mut pending = XPathCombinator::Descendant;
    let mut index = 0usize;
    while index < bytes.len() {
        let ch = bytes[index];
        if let Some(expected) = quote {
            if ch == expected {
                quote = None;
            }
            index += 1;
            continue;
        }
        match ch {
            b'\'' | b'"' => quote = Some(ch),
            b'[' => bracket_depth += 1,
            b']' => {
                if bracket_depth == 0 {
                    return Err("unbalanced XPath predicate".to_string());
                }
                bracket_depth -= 1;
            }
            b'/' if bracket_depth == 0 => {
                let raw = clean[start..index].trim();
                if !raw.is_empty() {
                    steps.push(XPathStep { combinator: pending, raw: raw.to_string() });
                }
                if bytes.get(index + 1) == Some(&b'/') {
                    pending = XPathCombinator::Descendant;
                    index += 1;
                } else {
                    pending = XPathCombinator::Child;
                }
                start = index + 1;
            }
            _ => {}
        }
        index += 1;
    }
    if quote.is_some() || bracket_depth != 0 {
        return Err("unbalanced XPath expression".to_string());
    }
    let raw = clean[start..].trim();
    if !raw.is_empty() {
        steps.push(XPathStep { combinator: pending, raw: raw.to_string() });
    }
    if steps.is_empty() {
        return Err("XPath contains no selectable steps".to_string());
    }
    Ok(steps)
}

fn css_string(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn relative_xpath_to_css(path: &str) -> Result<String, String> {
    let direct_child = path.trim_start().starts_with("./") && !path.trim_start().starts_with(".//");
    let steps = split_xpath_steps(path)?;
    let mut selector = if direct_child { "> ".to_string() } else { String::new() };
    for (index, step) in steps.iter().enumerate() {
        if matches!(step.raw.to_ascii_lowercase().as_str(), "text()" | "html()") || step.raw.starts_with('@') {
            return Err(format!("unsupported relative XPath extraction in predicate: {path}"));
        }
        if index > 0 {
            selector.push_str(match step.combinator {
                XPathCombinator::Descendant => " ",
                XPathCombinator::Child => " > ",
            });
        }
        selector.push_str(&xpath_step_to_css(&step.raw)?);
    }
    Ok(selector)
}

fn xpath_predicate_to_css(predicate: &str) -> Result<String, String> {
    let value = predicate.trim();
    if value.chars().all(|ch| ch.is_ascii_digit()) && !value.is_empty() {
        let index = value.parse::<usize>().map_err(|error| error.to_string())?;
        return if index == 0 {
            Err("XPath positions are one-based".to_string())
        } else {
            Ok(format!(":nth-of-type({index})"))
        };
    }
    if value.eq_ignore_ascii_case("last()") {
        return Ok(":last-of-type".to_string());
    }

    let not_relative = Regex::new(r"(?i)^not\s*\(\s*(\.(?://|/).+)\s*\)$").unwrap();
    if let Some(capture) = not_relative.captures(value) {
        return Ok(format!(":not(:has({}))", relative_xpath_to_css(&capture[1])?));
    }
    if value.starts_with(".//") || value.starts_with("./") {
        return Ok(format!(":has({})", relative_xpath_to_css(value)?));
    }

    let and_re = Regex::new(r"(?i)\s+and\s+").unwrap();
    let parts = and_re.split(value).collect::<Vec<_>>();
    if parts.len() > 1 {
        return parts.into_iter().map(xpath_predicate_to_css).collect::<Result<Vec<_>, _>>().map(|parts| parts.join(""));
    }

    let patterns = [
        (r#"(?i)^contains\s*\(\s*@([\w:-]+)\s*,\s*['\"]([^'\"]*)['\"]\s*\)$"#, "*="),
        (r#"(?i)^starts-with\s*\(\s*@([\w:-]+)\s*,\s*['\"]([^'\"]*)['\"]\s*\)$"#, "^="),
        (r#"(?i)^ends-with\s*\(\s*@([\w:-]+)\s*,\s*['\"]([^'\"]*)['\"]\s*\)$"#, "$="),
    ];
    for (pattern, operator) in patterns {
        let regex = Regex::new(pattern).unwrap();
        if let Some(capture) = regex.captures(value) {
            return Ok(format!("[{}{}\"{}\"]", &capture[1], operator, css_string(&capture[2])));
        }
    }

    let equality = Regex::new(r#"^@([\w:-]+)\s*(=|!=)\s*['\"]([^'\"]*)['\"]$"#).unwrap();
    if let Some(capture) = equality.captures(value) {
        let selector = format!("[{}=\"{}\"]", &capture[1], css_string(&capture[3]));
        return Ok(if &capture[2] == "!=" { format!(":not({selector})") } else { selector });
    }
    let exists = Regex::new(r"^@([\w:-]+)$").unwrap();
    if let Some(capture) = exists.captures(value) {
        return Ok(format!("[{}]", &capture[1]));
    }
    let not_exists = Regex::new(r"(?i)^not\s*\(\s*@([\w:-]+)\s*\)$").unwrap();
    if let Some(capture) = not_exists.captures(value) {
        return Ok(format!(":not([{}])", &capture[1]));
    }
    let not_contains = Regex::new(r#"(?i)^not\s*\(\s*contains\s*\(\s*@([\w:-]+)\s*,\s*['\"]([^'\"]*)['\"]\s*\)\s*\)$"#).unwrap();
    if let Some(capture) = not_contains.captures(value) {
        return Ok(format!(":not([{}*=\"{}\"])", &capture[1], css_string(&capture[2])));
    }
    Err(format!("unsupported XPath predicate: [{value}]"))
}

fn xpath_step_to_css(step: &str) -> Result<String, String> {
    let bytes = step.as_bytes();
    let tag_end = step.find('[').unwrap_or(step.len());
    let tag = step[..tag_end].trim();
    if tag != "*" && (tag.is_empty() || !tag.chars().all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '_' | '-'))) {
        return Err(format!("unsupported XPath step: {step}"));
    }
    let mut selector = if tag == "*" { "*".to_string() } else { tag.to_string() };
    let mut index = tag_end;
    while index < bytes.len() {
        if bytes[index] != b'[' {
            return Err(format!("invalid XPath step: {step}"));
        }
        let start = index + 1;
        let mut quote = None;
        let mut depth = 1usize;
        index += 1;
        while index < bytes.len() && depth > 0 {
            let ch = bytes[index];
            if let Some(expected) = quote {
                if ch == expected { quote = None; }
            } else {
                match ch {
                    b'\'' | b'"' => quote = Some(ch),
                    b'[' => depth += 1,
                    b']' => depth -= 1,
                    _ => {}
                }
            }
            index += 1;
        }
        if depth != 0 {
            return Err(format!("unbalanced XPath step: {step}"));
        }
        selector.push_str(&xpath_predicate_to_css(&step[start..index - 1])?);
    }
    Ok(selector)
}

fn portable_xpath_strings(rule: &str, content: &str) -> Result<Vec<String>, String> {
    let steps = split_xpath_steps(rule)?;
    let mut selector = String::new();
    let mut directive = XPathDirective::Element;
    for (index, step) in steps.iter().enumerate() {
        let is_last = index + 1 == steps.len();
        let lower = step.raw.to_ascii_lowercase();
        if lower == "text()" || lower == "html()" || step.raw.starts_with('@') {
            if !is_last || selector.is_empty() {
                return Err("XPath extraction directive must be the final step".to_string());
            }
            directive = if lower == "text()" {
                match step.combinator {
                    XPathCombinator::Child => XPathDirective::DirectText,
                    XPathCombinator::Descendant => XPathDirective::DescendantText,
                }
            } else if lower == "html()" {
                XPathDirective::Html
            } else {
                XPathDirective::Attribute(step.raw[1..].to_string())
            };
            continue;
        }
        if !selector.is_empty() {
            selector.push_str(match step.combinator {
                XPathCombinator::Descendant => " ",
                XPathCombinator::Child => " > ",
            });
        }
        selector.push_str(&xpath_step_to_css(&step.raw)?);
    }
    if selector.is_empty() {
        return Err("XPath selector is empty".to_string());
    }

    let selector = Selector::parse(&selector).map_err(|error| format!("converted XPath selector is invalid: {error}"))?;
    let document = Html::parse_document(content);
    let mut values = Vec::new();
    for element in document.select(&selector) {
        match &directive {
            XPathDirective::Element | XPathDirective::Html => values.push(element.html()),
            XPathDirective::DirectText => values.extend(element.children()
                .filter_map(|node| node.value().as_text())
                .map(|text| text.trim().to_string())
                .filter(|text| !text.is_empty())),
            XPathDirective::DescendantText => values.extend(element.text()
                .map(|text| text.trim().to_string())
                .filter(|text| !text.is_empty())),
            XPathDirective::Attribute(name) => {
                if let Some(value) = element.value().attr(name) {
                    values.push(value.to_string());
                }
            }
        }
    }
    Ok(values)
}

fn portable_rule_strings(rule: &str, content: &str) -> Result<Vec<String>, String> {
    let trimmed = rule.trim();
    if let Some(pattern) = trimmed.strip_prefix("@Regex:").or_else(|| trimmed.strip_prefix("@regex:")) {
        let regex = Regex::new(pattern).map_err(|e| e.to_string())?;
        return Ok(regex.captures_iter(content).filter_map(|capture| {
            capture.get(1).or_else(|| capture.get(0)).map(|value| value.as_str().to_string())
        }).collect());
    }
    if let Some(path) = trimmed.strip_prefix("@Json:").or_else(|| trimmed.strip_prefix("@json:"))
        .or_else(|| trimmed.starts_with('$').then_some(trimmed)) {
        let json: Value = serde_json::from_str(content).map_err(|e| e.to_string())?;
        return jsonpath_lib::select(&json, path).map_err(|e| e.to_string()).map(|values| values.into_iter().map(|value| {
            value.as_str().map(ToOwned::to_owned).unwrap_or_else(|| value.to_string())
        }).collect());
    }
    if trimmed.get(..7).is_some_and(|prefix| prefix.eq_ignore_ascii_case("@xpath:"))
        || trimmed.get(..6).is_some_and(|prefix| prefix.eq_ignore_ascii_case("xpath:"))
        || trimmed.starts_with("//") || trimmed.starts_with(".//") || trimmed.starts_with("./") || trimmed.starts_with('/') {
        return portable_xpath_strings(trimmed, content);
    }
    let raw = trimmed.strip_prefix("@CSS:").or_else(|| trimmed.strip_prefix("@css:")).unwrap_or(trimmed);
    let mut pieces = raw.split('@').filter(|part| !part.trim().is_empty()).collect::<Vec<_>>();
    let candidate_directive = pieces.last().copied().unwrap_or("text");
    let known_directive = matches!(candidate_directive.to_ascii_lowercase().as_str(), "text" | "textnodes" | "owntext" | "html" | "all")
        || (!candidate_directive.starts_with("class.") && !candidate_directive.starts_with("tag.") && !candidate_directive.starts_with("id.") && pieces.len() > 1);
    if known_directive { pieces.pop(); }
    let directive = if known_directive { candidate_directive } else { "text" };
    let selector_text = pieces.into_iter().map(|piece| {
        if let Some(value) = piece.strip_prefix("class.") { format!(".{value}") }
        else if let Some(value) = piece.strip_prefix("tag.") { value.to_string() }
        else if let Some(value) = piece.strip_prefix("id.") { format!("#{value}") }
        else { piece.to_string() }
    }).collect::<Vec<_>>().join(" ");
    let selector = Selector::parse(if selector_text.is_empty() { "html" } else { &selector_text })
        .map_err(|e| format!("invalid CSS selector: {e}"))?;
    let document = Html::parse_document(content);
    let mut values = Vec::new();
    for element in document.select(&selector) {
        let value = match directive.to_ascii_lowercase().as_str() {
            "html" | "all" => element.html(),
            "textnodes" | "owntext" => element.children().filter_map(|node| node.value().as_text()).map(|text| text.trim()).filter(|text| !text.is_empty()).collect::<Vec<_>>().join(if directive.eq_ignore_ascii_case("textNodes") { "\n" } else { " " }),
            "text" => element.text().collect::<Vec<_>>().join(" ").split_whitespace().collect::<Vec<_>>().join(" "),
            attribute => element.value().attr(attribute).unwrap_or_default().to_string(),
        };
        if !value.is_empty() && !values.contains(&value) { values.push(value); }
    }
    Ok(values)
}

fn persist_explicit_cache(path: Option<&Path>, cache: &HashMap<String, String>) -> Result<(), String> {
    let Some(path) = path else { return Ok(()); };
    if let Some(parent) = path.parent() { std::fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    let temporary = path.with_extension("json.tmp");
    std::fs::write(&temporary, serde_json::to_vec(cache).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&temporary, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| e.to_string())?;
    }
    std::fs::rename(&temporary, path).map_err(|e| e.to_string())
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
    source_cache: Arc<Mutex<HashMap<String, String>>>,
    source_cache_path: Arc<Option<PathBuf>>,
) -> Result<SourceScriptResponse, SourceScriptError> {
    if request.code.contains("Packages") || request.code.contains("java.io.")
        || request.code.contains("java.nio.file") || request.code.contains("java.lang.")
        || request.code.contains("java.util.") || request.code.contains("java.security.")
        || request.code.contains("java.net.") || request.code.contains("context.")
        || request.code.contains("activity.") || request.code.contains("startActivity")
        || request.code.contains("java.getFile(") || request.code.contains("java.readFile(")
        || request.code.contains("payAction")
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
        globals.set("__hostBase64EncodeBytes", Function::new(ctx.clone(), |value: Vec<u8>| {
            base64::engine::general_purpose::STANDARD.encode(value)
        })?)?;
        globals.set("__hostBase64DecodeBytes", Function::new(ctx.clone(), |value: String| -> Vec<u8> {
            base64::engine::general_purpose::STANDARD.decode(value).unwrap_or_default()
        })?)?;
        globals.set("__hostBytesToString", Function::new(ctx.clone(), |value: Vec<u8>| -> String {
            String::from_utf8_lossy(&value).into_owned()
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
        globals.set("__hostMd5", Function::new(ctx.clone(), |value: String| -> String {
            format!("{:x}", md5::compute(value.as_bytes()))
        })?)?;
        globals.set("__hostSymmetricCrypto", Function::new(ctx.clone(), |action: String, transformation: String, key: Vec<u8>, iv: Vec<u8>, data: Vec<u8>| -> rquickjs::Result<Vec<u8>> {
            symmetric_crypto(&action, &transformation, &key, &iv, &data)
                .map_err(|error| rquickjs::Error::new_from_js_message("crypto", "bytes", error))
        })?)?;
        globals.set("__hostRuleStrings", Function::new(ctx.clone(), |rule: String, content: String| -> rquickjs::Result<Vec<String>> {
            portable_rule_strings(&rule, &content)
                .map_err(|error| rquickjs::Error::new_from_js_message("rule", "string[]", error))
        })?)?;
        globals.set("__hostParseUrl", Function::new(ctx.clone(), |value: String, base: String| -> String {
            let parsed = if base.trim().is_empty() {
                Url::parse(&value)
            } else {
                Url::parse(&base).and_then(|url| url.join(&value))
            };
            parsed.ok().map(|url| serde_json::json!({
                "host": url.host_str().unwrap_or_default(),
                "origin": url.origin().ascii_serialization(),
                "pathname": url.path(),
                "searchParams": url.query_pairs().into_owned().collect::<HashMap<String, String>>(),
            }).to_string()).unwrap_or_else(|| "null".to_string())
        })?)?;
        let cache_source_id = request.source_id.clone();
        let get_cache = source_cache.clone();
        globals.set("__hostCacheGet", Function::new(ctx.clone(), move |key: String| -> String {
            let cache_key = format!("{}\0{}", cache_source_id, key);
            get_cache.lock().ok().and_then(|cache| cache.get(&cache_key).cloned()).unwrap_or_default()
        })?)?;
        let cache_source_id = request.source_id.clone();
        let put_cache = source_cache.clone();
        let put_cache_path = source_cache_path.clone();
        globals.set("__hostCachePut", Function::new(ctx.clone(), move |key: String, value: String| -> rquickjs::Result<()> {
            let mut cache = put_cache.lock().map_err(|error| rquickjs::Error::new_from_js_message("cache", "lock", error.to_string()))?;
            cache.insert(format!("{}\0{}", cache_source_id, key), value);
            persist_explicit_cache(put_cache_path.as_deref(), &cache)
                .map_err(|error| rquickjs::Error::new_from_js_message("cache", "disk", error))
        })?)?;
        let cache_source_id = request.source_id.clone();
        let delete_cache = source_cache.clone();
        let delete_cache_path = source_cache_path.clone();
        globals.set("__hostCacheDelete", Function::new(ctx.clone(), move |key: String| -> rquickjs::Result<()> {
            let mut cache = delete_cache.lock().map_err(|error| rquickjs::Error::new_from_js_message("cache", "lock", error.to_string()))?;
            cache.remove(&format!("{}\0{}", cache_source_id, key));
            persist_explicit_cache(delete_cache_path.as_deref(), &cache)
                .map_err(|error| rquickjs::Error::new_from_js_message("cache", "disk", error))
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
              connect: value => __hostAjax(typeof value === 'string' ? value : JSON.stringify(value)),
              post: (url, body, headers) => __hostAjax(JSON.stringify({{ url: String(url), method: 'POST', body: body == null ? '' : String(body), headers: headers || undefined }})),
              getCookie: url => __hostGetCookie(String(url)),
              setCookie: (url, cookie) => __hostSetCookie(String(url), String(cookie)),
              base64Encode: value => __hostBase64Encode(String(value)),
              base64Decode: value => __hostBase64Decode(String(value)),
              hexEncode: value => __hostHexEncode(String(value)),
              hexDecode: value => __hostHexDecode(String(value)),
              hexDecodeToString: value => __hostHexDecodeToString(String(value)),
              md5Encode: value => __hostMd5(String(value)),
              urlEncode: value => encodeURIComponent(String(value)),
              encodeURI: value => encodeURI(String(value)),
              strToBytes: value => Array.from(unescape(encodeURIComponent(String(value))), c => c.charCodeAt(0)),
              timeFormat: (value, format) => {{
                const d = new Date(Number(value));
                const pad = n => String(n).padStart(2, '0');
                return String(format || 'yyyy-MM-dd HH:mm:ss')
                  .replace(/yyyy/g, String(d.getFullYear())).replace(/MM/g, pad(d.getMonth() + 1))
                  .replace(/dd/g, pad(d.getDate())).replace(/HH/g, pad(d.getHours()))
                  .replace(/mm/g, pad(d.getMinutes())).replace(/ss/g, pad(d.getSeconds()));
              }},
              timeFormatUTC: (value, format) => {{
                const d = new Date(Number(value));
                const pad = n => String(n).padStart(2, '0');
                return String(format || 'yyyy-MM-dd HH:mm:ss')
                  .replace(/yyyy/g, String(d.getUTCFullYear())).replace(/MM/g, pad(d.getUTCMonth() + 1))
                  .replace(/dd/g, pad(d.getUTCDate())).replace(/HH/g, pad(d.getUTCHours()))
                  .replace(/mm/g, pad(d.getUTCMinutes())).replace(/ss/g, pad(d.getUTCSeconds()));
              }},
              htmlFormat: value => String(value).replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/\s*(?:p|div|li|h[1-6])\s*>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' '),
              toast: value => __hostLog(String(value)),
              longToast: value => __hostLog(String(value)),
              createSymmetricCrypto: (transformation, key, iv) => {{
                const toBytes = value => Array.isArray(value) ? value.map(v => Number(v) & 255) : Array.from(unescape(encodeURIComponent(String(value ?? ''))), c => c.charCodeAt(0));
                const keyBytes = toBytes(key), ivBytes = toBytes(iv);
                const normalizeEncrypted = value => {{
                  if (Array.isArray(value)) return toBytes(value);
                  const text = String(value ?? '').trim();
                  return /^[0-9a-f]+$/i.test(text) && text.length % 2 === 0 ? __hostHexDecode(text) : __hostBase64DecodeBytes(text);
                }};
                return Object.freeze({{
                  encrypt: value => __hostSymmetricCrypto('encrypt', String(transformation), keyBytes, ivBytes, toBytes(value)),
                  encryptBase64: value => __hostBase64EncodeBytes(__hostSymmetricCrypto('encrypt', String(transformation), keyBytes, ivBytes, toBytes(value))),
                  encryptHex: value => __hostSymmetricCrypto('encrypt', String(transformation), keyBytes, ivBytes, toBytes(value)).map(v => v.toString(16).padStart(2, '0')).join(''),
                  decrypt: value => __hostSymmetricCrypto('decrypt', String(transformation), keyBytes, ivBytes, normalizeEncrypted(value)),
                  decryptStr: value => __hostBytesToString(__hostSymmetricCrypto('decrypt', String(transformation), keyBytes, ivBytes, normalizeEncrypted(value)))
                }});
              }},
              getStringList: (rule, content) => __hostRuleStrings(String(rule), content == null ? (typeof result === 'string' ? result : JSON.stringify(result)) : String(content)),
              getString: (rule, content) => __hostRuleStrings(String(rule), content == null ? (typeof result === 'string' ? result : JSON.stringify(result)) : String(content)).join('\n'),
              getElements: (rule, content) => __hostRuleStrings(String(rule), content == null ? (typeof result === 'string' ? result : JSON.stringify(result)) : String(content)),
              getElement: (rule, content) => __hostRuleStrings(String(rule), content == null ? (typeof result === 'string' ? result : JSON.stringify(result)) : String(content))[0] ?? null,
              toURL: (value, base) => JSON.parse(__hostParseUrl(String(value), base == null ? '' : String(base))),
              getWebViewUA: () => {{
                try {{
                  const header = typeof source?.header === 'string' ? JSON.parse(source.header) : source?.header;
                  return header?.['User-Agent'] || header?.['user-agent'] || 'Mozilla/5.0 AppleWebKit/537.36';
                }} catch (_) {{ return 'Mozilla/5.0 AppleWebKit/537.36'; }}
              }},
              log: value => __hostLog(typeof value === 'string' ? value : JSON.stringify(value)),
              get: key => globalThis.__variables[key],
              put: (key, value) => {{ const str = String(value); globalThis.__variables[key] = str; return value; }}
            }});
            globalThis.cache = Object.freeze({{
              get: key => __hostCacheGet(String(key)),
              getFromMemory: key => __hostCacheGet(String(key)),
              put: (key, value) => {{ __hostCachePut(String(key), String(value)); return value; }},
              putMemory: (key, value) => {{ __hostCachePut(String(key), String(value)); return value; }},
              delete: key => __hostCacheDelete(String(key)),
              deleteMemory: key => __hostCacheDelete(String(key))
            }});
            globalThis.cookie = Object.freeze({{
              getCookie: url => __hostGetCookie(String(url)),
              setCookie: (url, value) => __hostSetCookie(String(url), String(value)),
              removeCookie: (url, name) => __hostSetCookie(String(url), String(name) + '=; Max-Age=0')
            }});
            globalThis.source = Object.assign(Object.create(null), __bindings.source || {{}}, {{
              get: key => __hostCacheGet(String(key)),
              put: (key, value) => {{ __hostCachePut(String(key), String(value)); return value; }},
              getLoginHeader: () => '',
              getLoginInfoMap: () => ({{}}),
              putLoginInfo: () => {{}},
              putLoginHeader: () => {{}},
              removeLoginHeader: () => {{}},
              login: () => {{}},
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
    let cache = state.source_cache.clone();
    let cache_path = state.source_cache_path.clone();
    tokio::task::spawn_blocking(move || execute_script(request, jar, cache, cache_path)).await
        .map_err(|error| script_error("JS_TASK_FAILED", error.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run_with_bindings(
        code: &str,
        bindings: Value,
        timeout_ms: u64,
    ) -> Result<SourceScriptResponse, SourceScriptError> {
        execute_script(SourceScriptRequest {
            source_id: "test".to_string(), code: code.to_string(), bindings,
            timeout_ms: Some(timeout_ms), memory_limit_bytes: None, stack_limit_bytes: None,
        }, Arc::new(Jar::default()), Arc::new(Mutex::new(HashMap::new())), Arc::new(None))
    }

    fn run(code: &str, timeout_ms: u64) -> Result<SourceScriptResponse, SourceScriptError> {
        run_with_bindings(code, serde_json::json!({"key":"abc"}), timeout_ms)
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
    fn exposes_portable_encoding_and_diagnostic_apis() {
        let response = run("java.toast('ok'); ({md5:java.md5Encode('abc'), url:java.urlEncode('中 文'), bytes:java.strToBytes('A中'), host:java.toURL('/book?id=1','https://example.com/root/').host})", 1_000).unwrap();
        assert_eq!(response.result["md5"], "900150983cd24fb0d6963f7d28e17f72");
        assert_eq!(response.result["url"], "%E4%B8%AD%20%E6%96%87");
        assert_eq!(response.result["bytes"], serde_json::json!([65, 228, 184, 173]));
        assert_eq!(response.result["host"], "example.com");
        assert_eq!(response.logs, vec!["ok"]);
    }

    #[test]
    fn explicit_cache_survives_quickjs_sandbox_and_process_state_recreation() {
        let path = std::env::temp_dir().join(format!("legado-source-cache-{}.json", std::process::id()));
        let cache = Arc::new(Mutex::new(HashMap::new()));
        let cache_path = Arc::new(Some(path.clone()));
        let request = |code: &str| SourceScriptRequest {
            source_id: "cache-source".to_string(), code: code.to_string(), bindings: serde_json::json!({}),
            timeout_ms: Some(1_000), memory_limit_bytes: None, stack_limit_bytes: None,
        };
        execute_script(request("cache.put('token', 'value')"), Arc::new(Jar::default()), cache, cache_path.clone()).unwrap();
        let restored = serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        let response = execute_script(request("cache.get('token')"), Arc::new(Jar::default()), Arc::new(Mutex::new(restored)), cache_path).unwrap();
        assert_eq!(response.result, "value");
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn supports_common_aes_cbc_crypto_roundtrip() {
        let code = "const crypto=java.createSymmetricCrypto('AES/CBC/PKCS5Padding','1234567890123456','6543210987654321'); const encrypted=crypto.encryptBase64('兼容测试'); crypto.decryptStr(encrypted)";
        let response = run(code, 1_000).unwrap();
        assert_eq!(response.result, "兼容测试");
    }

    #[test]
    fn bridges_portable_css_and_regex_rules() {
        let code = "const html='<div class=\"book\"><span class=\"name\">测试书</span></div>'; [java.getString('class.book@class.name@text', html), java.getString('.book .name', html), java.getString('@Regex:id=(\\\\d+)', 'id=42'), java.getString('@Json:$.book.name', '{\"book\":{\"name\":\"JSON书\"}}'), java.getString('$.book.name', '{\"book\":{\"name\":\"自动JSON书\"}}')]";
        let response = run(code, 1_000).unwrap();
        assert_eq!(response.result, serde_json::json!(["测试书", "测试书", "42", "JSON书", "自动JSON书"]));
    }

    #[test]
    fn bridges_android_style_xpath_get_string_with_implicit_result() {
        let html = r#"<div class="list-group-item">
            <h5><small>连载</small></h5>
            <p class="text-muted"><a>玄幻</a><a>系统</a></p>
            <p class="mb-1 text-muted">字数 123.4 万<br>阅读 56.7 万</p>
        </div>"#;
        let code = r#"
            var status = java.getString("//h5/small/text()");
            var tags = java.getString("//p[@class='text-muted']/a/text()");
            var views = java.getString("//p[@class='mb-1 text-muted']//text()").match(/\d+?.\d+/g)[1];
            status + ",👀" + views + "," + tags
        "#;
        let response = run_with_bindings(code, serde_json::json!({"result": html}), 1_000).unwrap();
        assert_eq!(response.result, "连载,👀56.7,玄幻\n系统");
    }

    #[test]
    fn bridges_xpath_descendant_absence_predicate_in_book_info_script() {
        let html = r#"<div class="box_info"><div class="novel_info">
            <p>作者信息</p><p><a href="/tag">标签</a>排除文本</p><p>字数信息</p>
        </div></div><div class="jianjie"><p>作品简介</p></div>"#;
        let code = r#"
            var info = java.getString("//div[@class='box_info']/div[@class='novel_info']//p[not(.//a)]//text()");
            var intro = java.getString("//div[@class='jianjie']/p/text()");
            intro + "\n◤-----------------------------------------------------------------◥\n" + info + "\n◣-----------------------------------------------------------------◢\n"
        "#;
        let response = run_with_bindings(code, serde_json::json!({"result": html}), 1_000).unwrap();
        assert_eq!(response.result, "作品简介\n◤-----------------------------------------------------------------◥\n作者信息\n字数信息\n◣-----------------------------------------------------------------◢\n");
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
        }, Arc::new(Jar::default()), Arc::new(Mutex::new(HashMap::new())), Arc::new(None)).unwrap_err();
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
