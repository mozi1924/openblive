use crate::client::{parse_cookie_value, upsert_cookie_value, BiliClient};
use crate::endpoints;
use anyhow::{anyhow, Result};
use hmac::{Hmac, Mac};
use serde_json::json;
use sha2::Sha256;
use std::collections::BTreeMap;

type HmacSha256 = Hmac<Sha256>;

pub fn ticket_hmac_sha256(timestamp: i64) -> String {
    let mut mac = HmacSha256::new_from_slice(b"XgwSnGZ1p").expect("HMAC can take key of any size");
    mac.update(format!("ts{timestamp}").as_bytes());
    hex::encode(mac.finalize().into_bytes())
}

pub async fn fetch_bili_ticket(client: &BiliClient, csrf: &str) -> Result<(String, i64)> {
    let ts = chrono::Utc::now().timestamp();
    let hexsign = ticket_hmac_sha256(ts);
    let mut form = BTreeMap::new();
    form.insert("key_id".to_string(), "ec02".to_string());
    form.insert("hexsign".to_string(), hexsign);
    form.insert("context[ts]".to_string(), ts.to_string());
    form.insert("csrf".to_string(), csrf.to_string());

    let res = client
        .post_form(&endpoints::api("/bapis/bilibili.api.ticket.v1.Ticket/GenWebTicket"), &form)
        .await?;

    let code = res["code"].as_i64().unwrap_or(-1);
    if code != 0 {
        return Err(anyhow!("GenWebTicket failed: code={code}"));
    }

    let ticket = res["data"]["ticket"]
        .as_str()
        .ok_or_else(|| anyhow!("missing ticket"))?
        .to_string();
    let created_at = res["data"]["created_at"].as_i64().unwrap_or(ts);
    let ttl = res["data"]["ttl"].as_i64().unwrap_or(86400);
    let expires = created_at + ttl;

    Ok((ticket, expires))
}

pub async fn fetch_buvid_spi(client: &BiliClient) -> Result<(String, String)> {
    let res = client
        .get_json(&endpoints::api("/x/frontend/finger/spi"), &[])
        .await?;

    let code = res["code"].as_i64().unwrap_or(-1);
    if code != 0 {
        return Err(anyhow!("finger spi failed: code={code}"));
    }

    let buvid3 = res["data"]["b_3"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let buvid4 = res["data"]["b_4"]
        .as_str()
        .unwrap_or("")
        .to_string();

    Ok((buvid3, buvid4))
}

pub async fn ensure_device_identity(client: &BiliClient, cookie_header: &mut String) -> bool {
    let mut updated = false;

    let has_buvid3 = parse_cookie_value(cookie_header, "buvid3").is_some();
    let has_buvid4 = parse_cookie_value(cookie_header, "buvid4").is_some();

    if !has_buvid3 || !has_buvid4 {
        match fetch_buvid_spi(client).await {
            Ok((b3, b4)) => {
                if !b3.is_empty() {
                    *cookie_header = upsert_cookie_value(cookie_header, "buvid3", &b3);
                    updated = true;
                }
                if !b4.is_empty() {
                    let encoded_b4 = urlencoding::encode(&b4).to_string();
                    *cookie_header = upsert_cookie_value(cookie_header, "buvid4", &encoded_b4);
                    updated = true;
                }
            }
            Err(err) => {
                crate::runtime_warn!("[auth][device] fetch_buvid_spi failed: {err}");
            }
        }
    }

    let ticket_expires = parse_cookie_value(cookie_header, "bili_ticket_expires")
        .and_then(|raw| raw.parse::<i64>().ok())
        .unwrap_or(0);
    let now = chrono::Utc::now().timestamp();
    let has_ticket = parse_cookie_value(cookie_header, "bili_ticket").is_some();

    if !has_ticket || ticket_expires <= now {
        let csrf = parse_cookie_value(cookie_header, "bili_jct").unwrap_or_default();
        match fetch_bili_ticket(client, &csrf).await {
            Ok((ticket, expires)) => {
                *cookie_header = upsert_cookie_value(cookie_header, "bili_ticket", &ticket);
                *cookie_header = upsert_cookie_value(cookie_header, "bili_ticket_expires", &expires.to_string());
                updated = true;
            }
            Err(err) => {
                crate::runtime_warn!("[auth][device] fetch_bili_ticket failed: {err}");
            }
        }
    }

    if updated {
        client.apply_cookie_header(cookie_header);
    }
    updated
}

pub fn app_sign(params: &BTreeMap<String, String>) -> BTreeMap<String, String> {
    let mut signed = params.clone();
    let app_key = endpoints::app_key();
    let app_sec = endpoints::app_sec();
    signed.insert("appkey".into(), app_key);
    let query = serde_urlencoded::to_string(&signed).unwrap();
    let sign = format!("{:x}", md5::compute(format!("{query}{app_sec}")));
    signed.insert("sign".into(), sign);
    signed
}

fn mixin_key(orig: &str) -> String {
    let table: [usize; 64] = [
        46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19,
        29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
        22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
    ];
    let chars: Vec<char> = orig.chars().collect();
    table
        .iter()
        .filter_map(|&index| chars.get(index))
        .collect::<String>()[..32]
        .to_string()
}

pub async fn wbi_signed(
    client: &BiliClient,
    mut params: BTreeMap<String, String>,
) -> Result<BTreeMap<String, String>> {
    let nav = client
        .get_json(&endpoints::api("/x/web-interface/nav"), &[])
        .await?;
    let img = nav["data"]["wbi_img"]["img_url"]
        .as_str()
        .ok_or_else(|| anyhow!("missing img_url"))?;
    let sub = nav["data"]["wbi_img"]["sub_url"]
        .as_str()
        .ok_or_else(|| anyhow!("missing sub_url"))?;

    let img_key = img
        .rsplit('/')
        .next()
        .unwrap_or("")
        .split('.')
        .next()
        .unwrap_or("");
    let sub_key = sub
        .rsplit('/')
        .next()
        .unwrap_or("")
        .split('.')
        .next()
        .unwrap_or("");
    let mix = mixin_key(&format!("{img_key}{sub_key}"));
    params.insert("wts".into(), chrono::Utc::now().timestamp().to_string());

    let mut clean = BTreeMap::new();
    for (key, value) in params {
        clean.insert(
            key,
            value
                .chars()
                .filter(|ch| !"!'()*".contains(*ch))
                .collect::<String>(),
        );
    }

    let query = serde_urlencoded::to_string(&clean)?;
    clean.insert(
        "w_rid".into(),
        format!("{:x}", md5::compute(format!("{query}{mix}"))),
    );
    Ok(clean)
}

pub async fn fetch_full_user_data(client: &BiliClient) -> Result<serde_json::Value> {
    let nav = client
        .get_json(&endpoints::api("/x/web-interface/nav"), &[])
        .await?;
    if nav["code"].as_i64().unwrap_or(-1) != 0 {
        return Err(anyhow!("i18n.account.error.fetch_user_info_failed"));
    }

    let stat = client
        .get_json(&endpoints::api("/x/web-interface/nav/stat"), &[])
        .await
        .unwrap_or(json!({ "data": {} }));
    let mut data = nav["data"].clone();
    data["stat"] = stat["data"].clone();
    Ok(data)
}

pub async fn get_danmu_info(client: &BiliClient, room_id: &str) -> Result<serde_json::Value> {
    let mut params = BTreeMap::new();
    params.insert("id".into(), room_id.into());
    params.insert("type".into(), "0".into());
    let signed = wbi_signed(client, params).await?;
    let pairs = signed
        .iter()
        .map(|(key, value)| (key.as_str(), value.clone()))
        .collect::<Vec<_>>();

    client
        .get_json(
            &endpoints::live_api("/xlive/web-room/v1/index/getDanmuInfo"),
            &pairs,
        )
        .await
}

#[cfg(test)]
mod tests {
    use super::ticket_hmac_sha256;

    #[test]
    fn test_ticket_hmac_sha256() {
        let ts = 1700000000;
        let hexsign = ticket_hmac_sha256(ts);
        assert_eq!(hexsign.len(), 64);
        assert!(hexsign.chars().all(|c| c.is_ascii_hexdigit()));
        // Verification against same HMAC key "XgwSnGZ1p" and message "ts1700000000"
        let expected = ticket_hmac_sha256(1700000000);
        assert_eq!(hexsign, expected);
    }
}
