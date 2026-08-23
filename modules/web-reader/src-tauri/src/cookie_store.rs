use reqwest::{cookie::Jar, redirect::Policy, Client};
use std::collections::HashMap;
use std::sync::Arc;
use url::Url;

pub struct CookieManager {
    clients: HashMap<String, Client>,
    jars: HashMap<String, Arc<Jar>>,
    user_agents: HashMap<String, String>,
}

impl CookieManager {
    pub fn new() -> Self {
        Self {
            clients: HashMap::new(),
            jars: HashMap::new(),
            user_agents: HashMap::new(),
        }
    }

    pub fn set_user_agent(&mut self, source_id: &str, user_agent: &str) {
        let ua = user_agent.trim();
        if !ua.is_empty() {
            let changed = match self.user_agents.get(source_id) {
                Some(existing) => existing != ua,
                None => true,
            };
            if changed {
                self.user_agents
                    .insert(source_id.to_string(), ua.to_string());
                self.clients.remove(source_id);
            }
        }
    }

    pub fn get_or_create_jar(&mut self, source_id: &str) -> Arc<Jar> {
        if let Some(jar) = self.jars.get(source_id) {
            return jar.clone();
        }
        let jar = Arc::new(Jar::default());
        self.jars.insert(source_id.to_string(), jar.clone());
        jar
    }

    pub fn get_or_create_client(
        &mut self,
        source_id: &str,
        custom_ua: Option<&str>,
    ) -> Result<Client, String> {
        if let Some(ua) = custom_ua {
            self.set_user_agent(source_id, ua);
        }

        if let Some(client) = self.clients.get(source_id) {
            return Ok(client.clone());
        }

        let cookie_jar = self.get_or_create_jar(source_id);

        let mut builder = Client::builder()
            .cookie_provider(cookie_jar)
            .gzip(true)
            .brotli(true)
            .deflate(true)
            .redirect(Policy::limited(10));

        if let Some(ua) = self.user_agents.get(source_id) {
            builder = builder.user_agent(ua);
        }

        let client = builder
            .build()
            .map_err(|e| format!("Failed to build client: {}", e))?;

        self.clients.insert(source_id.to_string(), client.clone());
        Ok(client)
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
        Ok(())
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
}
