use base64::Engine;
use prost::Message;
use serde_json::Value;

pub fn resolve_interact_meta(msg_type: i64) -> (&'static str, &'static str) {
    match msg_type {
        1 => ("enter", "i18n.live.event.interact.enter"),
        2 => ("follow", "i18n.live.event.interact.follow"),
        3 => ("share", "i18n.live.event.interact.share"),
        _ => ("unknown", "i18n.live.event.interact.unknown"),
    }
}

#[derive(Clone, PartialEq, Message)]
pub struct InteractWordV2MedalInfo {
    #[prost(uint32, tag = "1")]
    pub target_id: u32,
    #[prost(int32, tag = "2")]
    pub int2: i32,
    #[prost(string, tag = "3")]
    pub name: String,
    #[prost(int32, tag = "4")]
    pub color: i32,
    #[prost(int32, tag = "5")]
    pub color_start: i32,
    #[prost(int32, tag = "6")]
    pub color_end: i32,
    #[prost(int32, tag = "7")]
    pub color_border: i32,
    #[prost(uint32, tag = "12")]
    pub roomid: u32,
    #[prost(uint32, tag = "13")]
    pub int4: u32,
}

#[derive(Clone, PartialEq, Message)]
pub struct InteractWordV2UMedalInfo {
    #[prost(string, tag = "1")]
    pub name: String,
    #[prost(uint32, tag = "2")]
    pub level: u32,
    #[prost(int32, tag = "3")]
    pub color_start: i32,
    #[prost(int32, tag = "4")]
    pub color_end: i32,
    #[prost(int32, tag = "5")]
    pub color_border: i32,
    #[prost(int32, tag = "6")]
    pub color: i32,
    #[prost(uint32, tag = "7")]
    pub id: u32,
    #[prost(uint32, tag = "10")]
    pub ruid: u32,
    #[prost(uint32, tag = "12")]
    pub int4: u32,
    #[prost(string, tag = "15")]
    pub v2_medal_color_start: String,
    #[prost(string, tag = "16")]
    pub v2_medal_color_end: String,
    #[prost(string, tag = "17")]
    pub v2_medal_color_border: String,
    #[prost(string, tag = "18")]
    pub v2_medal_text: String,
    #[prost(string, tag = "19")]
    pub v2_medal_level: String,
}

#[derive(Clone, PartialEq, Message)]
pub struct InteractWordV2UserBase {
    #[prost(string, tag = "1")]
    pub uname: String,
    #[prost(string, tag = "2")]
    pub face: String,
}

#[derive(Clone, PartialEq, Message)]
pub struct InteractWordV2UserInfoMessage1 {
    #[prost(uint32, tag = "1")]
    pub int1: u32,
}

#[derive(Clone, PartialEq, Message)]
pub struct InteractWordV2UserInfo {
    #[prost(uint32, tag = "1")]
    pub uid: u32,
    #[prost(message, optional, tag = "2")]
    pub base: Option<InteractWordV2UserBase>,
    #[prost(message, optional, tag = "3")]
    pub medal_info: Option<InteractWordV2UMedalInfo>,
    #[prost(message, optional, tag = "4")]
    pub message1: Option<InteractWordV2UserInfoMessage1>,
    #[prost(string, tag = "6")]
    pub string1: String,
}

#[derive(Clone, PartialEq, Message)]
pub struct InteractWordV2ActivityMessage {
    #[prost(string, tag = "1")]
    pub icon: String,
    #[prost(string, tag = "2")]
    pub msg: String,
    #[prost(int32, tag = "3")]
    pub r#type: i32,
}

#[derive(Clone, PartialEq, Message)]
pub struct InteractWordV2Payload {
    #[prost(uint32, tag = "1")]
    pub uid: u32,
    #[prost(string, tag = "2")]
    pub uname: String,
    #[prost(string, tag = "4")]
    pub string1: String,
    #[prost(uint32, tag = "5")]
    pub msg_type: u32,
    #[prost(uint32, tag = "6")]
    pub roomid: u32,
    #[prost(uint32, tag = "7")]
    pub timestamp: u32,
    #[prost(uint32, tag = "8")]
    pub timestamp_millisecond: u32,
    #[prost(message, optional, tag = "9")]
    pub medal_info: Option<InteractWordV2MedalInfo>,
    #[prost(string, tag = "12")]
    pub string2: String,
    #[prost(int32, tag = "15")]
    pub int2: i32,
    #[prost(int32, tag = "17")]
    pub int3: i32,
    #[prost(string, tag = "19")]
    pub string4: String,
    #[prost(message, optional, tag = "22")]
    pub user_info: Option<InteractWordV2UserInfo>,
    #[prost(message, optional, tag = "23")]
    pub activity_message: Option<InteractWordV2ActivityMessage>,
}

pub fn decode_interact_word_v2_payload(payload: &Value) -> Option<InteractWordV2Payload> {
    let encoded = payload
        .get("data")
        .and_then(|value| value.get("pb"))
        .or_else(|| payload.get("pb"))
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())?;
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(encoded.trim())
        .ok()?;
    InteractWordV2Payload::decode(decoded.as_slice()).ok()
}
