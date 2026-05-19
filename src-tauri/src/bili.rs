use crate::client::BiliClient;
use crate::constants::{APP_KEY, APP_SEC};
use anyhow::{anyhow, Result};
use serde_json::json;
use std::collections::BTreeMap;

pub fn app_sign(params: &BTreeMap<String, String>) -> BTreeMap<String, String> {
    let mut signed = params.clone();
    signed.insert("appkey".into(), APP_KEY.into());
    let query = serde_urlencoded::to_string(&signed).unwrap();
    let sign = format!("{:x}", md5::compute(format!("{query}{APP_SEC}")));
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
        .get_json("https://api.bilibili.com/x/web-interface/nav", &[])
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
        .get_json("https://api.bilibili.com/x/web-interface/nav", &[])
        .await?;
    if nav["code"].as_i64().unwrap_or(-1) != 0 {
        return Err(anyhow!("获取用户信息失败"));
    }

    let stat = client
        .get_json("https://api.bilibili.com/x/web-interface/nav/stat", &[])
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
            "https://api.live.bilibili.com/xlive/web-room/v1/index/getDanmuInfo",
            &pairs,
        )
        .await
}
