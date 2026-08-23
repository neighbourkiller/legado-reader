use reqwest::{Client, redirect::Policy};
use std::collections::HashMap;
use std::sync::Arc;

pub struct CookieManager {
    clients: HashMap<String, Client>,
}

impl CookieManager {
    pub fn new() -> Self {
        Self {
            clients: HashMap::new(),
        }
    }

    pub fn get_or_create_client(&mut self, source_id: &str) -> Result<Client, String> {
        if let Some(client) = self.clients.get(source_id) {
            return Ok(client.clone());
        }

        let cookie_jar = Arc::new(reqwest::cookie::Jar::default());
        
        let client = Client::builder()
            .cookie_provider(cookie_jar)
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .gzip(true)
            .brotli(true)
            .deflate(true)
            .redirect(Policy::limited(10))
            .build()
            .map_err(|e| format!("Failed to build client: {}", e))?;

        self.clients.insert(source_id.to_string(), client.clone());
        Ok(client)
    }
}
