use crate::endpoints;
use anyhow::Result;
use reqwest::multipart::Form;
use reqwest::cookie::{CookieStore, Jar};
use reqwest::header::{COOKIE, USER_AGENT};
use std::collections::BTreeMap;
use std::sync::Arc;
use url::Url;

#[derive(Clone)]
pub struct BiliClient {
    pub http: reqwest::Client,
    pub jar: Arc<Jar>,
}

impl BiliClient {
    pub fn new() -> Self {
        let jar = Arc::new(Jar::default());
        let ua = endpoints::http_user_agent();
        let http = reqwest::Client::builder()
            .cookie_provider(jar.clone())
            .user_agent(ua)
            .build()
            .unwrap();

        Self { http, jar }
    }

    pub async fn get_json(
        &self,
        url: &str,
        params: &[(&str, String)],
    ) -> Result<serde_json::Value> {
        Ok(self
            .http
            .get(url)
            .header(USER_AGENT, endpoints::http_user_agent())
            .query(params)
            .send()
            .await?
            .json()
            .await?)
    }

    pub async fn get_json_with_cookie(
        &self,
        url: &str,
        params: &[(&str, String)],
        cookie_header: &str,
    ) -> Result<serde_json::Value> {
        let mut request = self
            .http
            .get(url)
            .header(USER_AGENT, endpoints::http_user_agent())
            .query(params);
        if !cookie_header.trim().is_empty() {
            request = request.header(COOKIE, cookie_header.trim());
        }
        Ok(request.send().await?.json().await?)
    }

    pub async fn post_form(
        &self,
        url: &str,
        form: &BTreeMap<String, String>,
    ) -> Result<serde_json::Value> {
        Ok(self
            .http
            .post(url)
            .header(USER_AGENT, endpoints::http_user_agent())
            .form(form)
            .send()
            .await?
            .json()
            .await?)
    }

    pub async fn post_form_with_cookie(
        &self,
        url: &str,
        form: &BTreeMap<String, String>,
        cookie_header: &str,
    ) -> Result<serde_json::Value> {
        let mut request = self
            .http
            .post(url)
            .header(USER_AGENT, endpoints::http_user_agent())
            .form(form);
        if !cookie_header.trim().is_empty() {
            request = request.header(COOKIE, cookie_header.trim());
        }
        Ok(request.send().await?.json().await?)
    }

    pub async fn post_multipart_with_cookie(
        &self,
        url: &str,
        form: Form,
        cookie_header: &str,
    ) -> Result<serde_json::Value> {
        let mut request = self
            .http
            .post(url)
            .header(USER_AGENT, endpoints::http_user_agent())
            .multipart(form);
        if !cookie_header.trim().is_empty() {
            request = request.header(COOKIE, cookie_header.trim());
        }
        Ok(request.send().await?.json().await?)
    }

    pub fn cookie_header_for(&self, url: &str) -> String {
        self.jar
            .cookies(&Url::parse(url).unwrap())
            .and_then(|value| value.to_str().ok().map(|raw| raw.to_string()))
            .unwrap_or_default()
    }

    pub fn apply_cookie_header(&self, cookie_header: &str) {
        let url = Url::parse(&endpoints::www_origin()).unwrap();
        let cookie_domain = endpoints::cookie_domain();
        for kv in cookie_header
            .split(';')
            .map(|item| item.trim())
            .filter(|item| !item.is_empty())
        {
            let enriched = format!("{kv}; Domain={}; Path=/; Secure; HttpOnly", cookie_domain);
            self.jar.add_cookie_str(&enriched, &url);
        }
    }
}

pub fn parse_cookie_value(cookie_header: &str, key: &str) -> Option<String> {
    cookie_header
        .split(';')
        .map(|item| item.trim())
        .rev()
        .find_map(|kv| {
            kv.strip_prefix(&(key.to_owned() + "="))
                .map(|v| v.to_string())
        })
}
