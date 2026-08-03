use crate::endpoints;
use anyhow::Result;
use reqwest::cookie::{CookieStore, Jar};
use reqwest::header::{COOKIE, ORIGIN, REFERER, USER_AGENT};
use reqwest::multipart::Form;
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

    pub fn with_cookie(cookie_header: &str) -> Self {
        let client = Self::new();
        if !cookie_header.trim().is_empty() {
            client.apply_cookie_header(cookie_header);
        }
        client
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
        let referer = endpoints::live_web_origin();
        let origin = referer.trim_end_matches('/');
        let mut request = self
            .http
            .post(url)
            .header(USER_AGENT, endpoints::http_user_agent())
            .header(REFERER, &referer)
            .header(ORIGIN, origin)
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
        .filter(|item| !item.is_empty())
        .rev()
        .find_map(|kv| {
            let mut parts = kv.splitn(2, '=');
            let k = parts.next()?.trim();
            if k == key {
                Some(parts.next().unwrap_or("").trim().to_string())
            } else {
                None
            }
        })
}

pub fn upsert_cookie_value(cookie_header: &str, key: &str, value: &str) -> String {
    let mut items: Vec<(String, String)> = cookie_header
        .split(';')
        .map(|item| item.trim())
        .filter(|item| !item.is_empty())
        .filter_map(|kv| {
            let mut parts = kv.splitn(2, '=');
            let k = parts.next()?.trim().to_string();
            let v = parts.next().unwrap_or("").trim().to_string();
            Some((k, v))
        })
        .collect();

    let mut found = false;
    for (k, v) in &mut items {
        if k == key {
            *v = value.to_string();
            found = true;
            break;
        }
    }
    if !found {
        items.push((key.to_string(), value.to_string()));
    }

    items
        .into_iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<_>>()
        .join("; ")
}

#[cfg(test)]
mod tests {
    use super::{parse_cookie_value, upsert_cookie_value};

    #[test]
    fn test_parse_cookie_value() {
        let cookie = "SESSDATA=abc%3D123; bili_jct=xyz; DedeUserID=100; enc=base64==data==";
        assert_eq!(parse_cookie_value(cookie, "SESSDATA"), Some("abc%3D123".to_string()));
        assert_eq!(parse_cookie_value(cookie, "bili_jct"), Some("xyz".to_string()));
        assert_eq!(parse_cookie_value(cookie, "DedeUserID"), Some("100".to_string()));
        assert_eq!(parse_cookie_value(cookie, "enc"), Some("base64==data==".to_string()));
        assert_eq!(parse_cookie_value(cookie, "missing"), None);
    }

    #[test]
    fn test_upsert_cookie_value() {
        let cookie = "SESSDATA=abc; bili_jct=xyz";
        let updated = upsert_cookie_value(cookie, "bili_jct", "new_csrf");
        assert_eq!(updated, "SESSDATA=abc; bili_jct=new_csrf");

        let added = upsert_cookie_value(&updated, "buvid3", "b3_val");
        assert_eq!(added, "SESSDATA=abc; bili_jct=new_csrf; buvid3=b3_val");

        let base64_val = upsert_cookie_value(cookie, "token", "abc=123==456");
        assert_eq!(parse_cookie_value(&base64_val, "token"), Some("abc=123==456".to_string()));
    }
}



