use reqwest::cookie::Jar;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use url::Url;

pub struct CookieManager {
    jars: HashMap<String, Arc<Jar>>,
    persisted: HashMap<String, String>,
    persistence_path: Option<PathBuf>,
}

impl CookieManager {
    pub fn new(persistence_path: Option<PathBuf>) -> Self {
        let persisted = persistence_path
            .as_ref()
            .and_then(|path| std::fs::read_to_string(path).ok())
            .and_then(|json| serde_json::from_str(&json).ok())
            .unwrap_or_default();
        Self {
            jars: HashMap::new(),
            persisted,
            persistence_path,
        }
    }

    fn key(source_id: &str, target_url: &str) -> String {
        let normalized = Url::parse(target_url)
            .map(|mut url| {
                url.set_path("/");
                url.set_query(None);
                url.set_fragment(None);
                url.to_string()
            })
            .unwrap_or_else(|_| target_url.to_string());
        format!("{}\0{}", source_id, normalized)
    }

    fn persist(&self) -> Result<(), String> {
        let Some(path) = self.persistence_path.as_deref() else {
            return Ok(());
        };
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let temporary = path.with_extension("json.tmp");
        std::fs::write(
            &temporary,
            serde_json::to_vec(&self.persisted).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        secure_file(&temporary)?;
        std::fs::rename(temporary, path).map_err(|e| e.to_string())
    }

    pub fn get_or_create_jar(&mut self, source_id: &str) -> Arc<Jar> {
        if let Some(jar) = self.jars.get(source_id) {
            return jar.clone();
        }
        let jar = Arc::new(Jar::default());
        let prefix = format!("{}\0", source_id);
        for (key, cookie_str) in &self.persisted {
            if let Some(target_url) = key.strip_prefix(&prefix) {
                if let Ok(parsed_url) = Url::parse(target_url) {
                    for cookie in cookie_str
                        .split(';')
                        .map(str::trim)
                        .filter(|item| !item.is_empty())
                    {
                        jar.add_cookie_str(cookie, &parsed_url);
                    }
                }
            }
        }
        self.jars.insert(source_id.to_string(), jar.clone());
        jar
    }

    pub fn set_cookies(
        &mut self,
        source_id: &str,
        target_url: &str,
        cookie_str: &str,
    ) -> Result<(), String> {
        let parsed_url = Url::parse(target_url).map_err(|e| format!("Invalid URL: {}", e))?;
        let jar = self.get_or_create_jar(source_id);

        for item in cookie_str.split(';') {
            let cookie = item.trim();
            if !cookie.is_empty() {
                jar.add_cookie_str(cookie, &parsed_url);
            }
        }
        self.persisted
            .insert(Self::key(source_id, target_url), cookie_str.to_string());
        self.persist()
    }

    pub fn get_cookies(&mut self, source_id: &str, target_url: &str) -> Result<String, String> {
        let parsed_url = Url::parse(target_url).map_err(|e| format!("Invalid URL: {}", e))?;
        let jar = self.get_or_create_jar(source_id);
        use reqwest::cookie::CookieStore;
        let cookies = jar.cookies(&parsed_url);
        match cookies {
            Some(val) => Ok(val.to_str().unwrap_or("").to_string()),
            None => Ok(String::new()),
        }
    }

    pub fn persist_current_cookies(
        &mut self,
        source_id: &str,
        target_url: &str,
    ) -> Result<(), String> {
        let value = self.get_cookies(source_id, target_url)?;
        self.persisted
            .insert(Self::key(source_id, target_url), value);
        self.persist()
    }
}

#[cfg(unix)]
fn secure_file(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(not(unix))]
fn secure_file(_path: &Path) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn persists_cookie_jar_by_source_across_restarts() {
        let path =
            std::env::temp_dir().join(format!("legado-source-cookies-{}.json", std::process::id()));
        let mut first = CookieManager::new(Some(path.clone()));
        first
            .set_cookies("source-a", "https://example.com/login", "session=abc")
            .unwrap();
        let mut restored = CookieManager::new(Some(path.clone()));
        assert_eq!(
            restored
                .get_cookies("source-a", "https://example.com/book/1")
                .unwrap(),
            "session=abc"
        );
        assert_eq!(
            restored
                .get_cookies("source-b", "https://example.com/book/1")
                .unwrap(),
            ""
        );
        let _ = std::fs::remove_file(path);
    }
}
