use super::helpers::{
    dec_color_to_hex, normalize_asset_url, normalize_hex_color, parse_i64, parse_string, parse_u64,
};
use super::interact_word::{decode_interact_word_v2_payload, resolve_interact_meta};
use rand::Rng;
use serde_json::{json, Value};

fn now_hms() -> String {
    chrono::Local::now().format("%H:%M:%S").to_string()
}

fn next_msg_id() -> String {
    format!(
        "{:x}{:08x}",
        chrono::Utc::now().timestamp_millis(),
        rand::random::<u32>()
    )
}

fn parse_dm_interaction_detail(payload: &Value) -> Option<Value> {
    let raw = payload
        .get("data")
        .and_then(|value| value.get("data"))
        .or_else(|| payload.get("data"))
        .or_else(|| payload.get("value"))?;

    if raw.is_object() || raw.is_array() {
        return Some(raw.clone());
    }
    raw.as_str()
        .and_then(|value| serde_json::from_str::<Value>(value).ok())
}

pub fn parse_danmu_message(payload: &Value) -> (Option<Value>, Option<u64>) {
    let cmd = payload["cmd"].as_str().unwrap_or("UNKNOWN");
    let id = next_msg_id();
    let time = now_hms();

    if cmd.starts_with("DANMU_MSG") {
        let Some(info) = payload["info"].as_array() else {
            return (None, None);
        };
        let extra_json = info
            .first()
            .and_then(|value| value.get(15))
            .and_then(|value| value.get("extra"))
            .and_then(Value::as_str)
            .and_then(|raw| serde_json::from_str::<Value>(raw).ok());
        let danmu_msg_id = payload
            .get("msg_id")
            .and_then(Value::as_str)
            .map(|raw| raw.to_string());
        let danmu_id_str = extra_json
            .as_ref()
            .and_then(|extra| extra.get("id_str"))
            .and_then(Value::as_str)
            .map(|raw| raw.to_string());
        let danmu_rnd = info
            .first()
            .and_then(Value::as_array)
            .and_then(|meta| meta.get(4))
            .and_then(parse_i64);
        let danmu_legacy_id = info
            .first()
            .and_then(Value::as_array)
            .and_then(|meta| meta.get(5))
            .and_then(parse_i64);
        let sender_uid = info
            .first()
            .and_then(|value| value.get(15))
            .and_then(|value| value.get("user"))
            .and_then(|value| value.get("uid"))
            .and_then(|value| value.as_u64())
            .or_else(|| {
                info.get(2)
                    .and_then(|value| value.as_array())
                    .and_then(|value| value.first())
                    .and_then(|value| value.as_u64())
            });
        let sender_admin_level = info
            .get(2)
            .and_then(|value| value.as_array())
            .and_then(|meta| meta.get(2))
            .and_then(|value| value.as_i64())
            .unwrap_or(0);
        let sender_guard_level = info
            .first()
            .and_then(|value| value.get(15))
            .and_then(|value| value.get("user"))
            .and_then(|value| value.get("medal"))
            .and_then(|value| value.get("guard_level"))
            .and_then(|value| value.as_i64())
            .or_else(|| {
                info.get(3)
                    .and_then(|value| value.as_array())
                    .and_then(|medal| medal.get(10))
                    .and_then(|value| value.as_i64())
            })
            .unwrap_or(0);
        let sender_name_color = info
            .get(2)
            .and_then(|value| value.as_array())
            .and_then(|meta| meta.get(7))
            .and_then(|value| value.as_str())
            .and_then(normalize_hex_color)
            .or_else(|| {
                info.first()
                    .and_then(|value| value.get(15))
                    .and_then(|value| value.get("user"))
                    .and_then(|value| value.get("base"))
                    .and_then(|value| value.get("name_color_str"))
                    .and_then(|value| value.as_str())
                    .and_then(normalize_hex_color)
            })
            .or_else(|| {
                info.first()
                    .and_then(|value| value.get(15))
                    .and_then(|value| value.get("user"))
                    .and_then(|value| value.get("base"))
                    .and_then(|value| value.get("name_color"))
                    .and_then(|value| value.as_i64())
                    .and_then(dec_color_to_hex)
            });
        let sender_face = info
            .first()
            .and_then(|value| value.get(15))
            .and_then(|value| value.get("user"))
            .and_then(|value| value.get("base"))
            .and_then(|value| value.get("face"))
            .and_then(|value| value.as_str())
            .and_then(normalize_asset_url)
            .or_else(|| {
                info.first()
                    .and_then(|value| value.get(15))
                    .and_then(|value| value.get("user"))
                    .and_then(|value| value.get("base"))
                    .and_then(|value| value.get("origin_info"))
                    .and_then(|value| value.get("face"))
                    .and_then(|value| value.as_str())
                    .and_then(normalize_asset_url)
            });
        let sender_role = if sender_admin_level > 0 {
            "admin"
        } else if sender_guard_level > 0 {
            "guard"
        } else {
            "viewer"
        };
        let content = info
            .get(1)
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .to_string();
        let sender = info
            .get(2)
            .and_then(|value| value.as_array())
            .and_then(|meta| meta.get(1))
            .and_then(|value| value.as_str())
            .unwrap_or("i18n.live.event.fallback.anonymous_user")
            .to_string();
        return (
            Some(json!({
            "id": id,
            "type": "danmu",
            "time": time,
            "sender": sender,
            "content": content,
            "sender_uid": sender_uid,
            "sender_role": sender_role,
            "sender_name_color": sender_name_color,
            "sender_guard_level": sender_guard_level,
            "sender_face": sender_face,
            "danmu_msg_id": danmu_msg_id,
            "danmu_id_str": danmu_id_str,
            "danmu_rnd": danmu_rnd,
            "danmu_legacy_id": danmu_legacy_id,
            "cmd": cmd,
            })),
            None,
        );
    }

    if cmd == "INTERACT_WORD_V2" {
        if let Some(decoded) = decode_interact_word_v2_payload(payload) {
            let msg_type = decoded.msg_type as i64;
            let (interact_type, action_text) = resolve_interact_meta(msg_type);
            let user_base = decoded
                .user_info
                .as_ref()
                .and_then(|user_info| user_info.base.as_ref());
            let sender = if !decoded.uname.trim().is_empty() {
                decoded.uname
            } else if let Some(base) = user_base {
                base.uname.clone()
            } else {
                "i18n.live.event.fallback.viewer".to_string()
            };
            let sender_uid = if decoded.uid > 0 {
                Some(decoded.uid as u64)
            } else {
                decoded
                    .user_info
                    .as_ref()
                    .and_then(|user_info| (user_info.uid > 0).then_some(user_info.uid as u64))
            };
            let sender_face = user_base.and_then(|base| normalize_asset_url(base.face.as_str()));
            let sender_guard_level = decoded
                .user_info
                .as_ref()
                .and_then(|user_info| user_info.medal_info.as_ref())
                .map(|medal| medal.level as i64)
                .unwrap_or(0);
            let sender_name_color = decoded
                .user_info
                .as_ref()
                .and_then(|user_info| user_info.medal_info.as_ref())
                .and_then(|medal| normalize_hex_color(&medal.v2_medal_text))
                .or_else(|| {
                    decoded
                        .medal_info
                        .as_ref()
                        .and_then(|medal| dec_color_to_hex(medal.color as i64))
                });
            let sender_role = if sender_guard_level > 0 {
                "guard"
            } else {
                "viewer"
            };
            return (
                Some(json!({
                    "id": id,
                    "type": "interact",
                    "time": time,
                    "sender": sender,
                    "content": format!("{sender} {action_text}"),
                    "sender_uid": sender_uid,
                    "sender_role": sender_role,
                    "sender_guard_level": sender_guard_level,
                    "sender_name_color": sender_name_color,
                    "sender_face": sender_face,
                    "interact_type": interact_type,
                    "cmd": cmd,
                })),
                None,
            );
        }
    }

    if cmd == "INTERACT_WORD" || cmd == "INTERACT_WORD_V2" {
        let data = payload.get("data").and_then(Value::as_object);
        let msg_type = data
            .and_then(|value| value.get("msg_type"))
            .and_then(parse_i64)
            .unwrap_or(0);
        let (interact_type, action_text) = resolve_interact_meta(msg_type);
        let sender = data
            .and_then(|value| value.get("uname"))
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .unwrap_or("i18n.live.event.fallback.viewer")
            .to_string();
        let sender_uid = data.and_then(|value| value.get("uid")).and_then(parse_u64);
        let sender_name_color = data
            .and_then(|value| value.get("uname_color"))
            .and_then(Value::as_str)
            .and_then(normalize_hex_color);
        let sender_guard_level = data
            .and_then(|value| value.get("fans_medal"))
            .and_then(|value| value.get("guard_level"))
            .and_then(parse_i64)
            .unwrap_or(0);
        let sender_role = if sender_guard_level > 0 {
            "guard"
        } else {
            "viewer"
        };
        let fallback = if cmd == "INTERACT_WORD_V2" {
            "i18n.live.event.interact.received_v2"
        } else {
            "i18n.live.event.interact.received"
        };
        let has_resolved_detail =
            msg_type > 0 || sender_uid.is_some() || sender_name_color.is_some();
        let content = if has_resolved_detail {
            format!("{sender} {action_text}")
        } else {
            fallback.to_string()
        };
        return (
            Some(json!({
                "id": id,
                "type": "interact",
                "time": time,
                "sender": sender,
                "content": content,
                "sender_uid": sender_uid,
                "sender_role": sender_role,
                "sender_guard_level": sender_guard_level,
                "sender_name_color": sender_name_color,
                "interact_type": interact_type,
                "cmd": cmd,
            })),
            None,
        );
    }

    if cmd == "DM_INTERACTION" {
        let interaction_type = payload
            .get("data")
            .and_then(|value| value.get("type"))
            .and_then(parse_i64)
            .unwrap_or(0);
        let detail = parse_dm_interaction_detail(payload).unwrap_or(Value::Null);
        let vote_id = detail
            .as_object()
            .and_then(|value| value.get("vote_id"))
            .and_then(parse_u64);
        let vote_status = detail
            .as_object()
            .and_then(|value| value.get("status"))
            .and_then(parse_i64);
        let vote_question = detail
            .as_object()
            .and_then(|value| value.get("question"))
            .and_then(parse_string)
            .unwrap_or_default();
        let interaction_kind = match interaction_type {
            101 => "vote",
            102 => "danmu",
            103 => "follow",
            104 => "gift",
            105 => "share",
            106 => "like",
            _ => "unknown",
        };
        let content = if interaction_type == 101 {
            if vote_question.is_empty() {
                "i18n.live.event.interact.vote_updated".to_string()
            } else {
                format!("i18n.live.event.interact.vote_updated:{vote_question}")
            }
        } else {
            format!("i18n.live.event.interact.received(type={interaction_type})")
        };
        return (
            Some(json!({
                "id": id,
                "type": "interact",
                "time": time,
                "sender": "system",
                "content": content,
                "cmd": cmd,
                "interaction_kind": interaction_kind,
                "interaction_event_type": interaction_type,
                "interaction_vote_id": vote_id,
                "interaction_vote_status": vote_status,
                "interaction_vote_question": vote_question,
                "interaction_detail": detail,
            })),
            None,
        );
    }

    if cmd == "SEND_GIFT" {
        let Some(data) = payload["data"].as_object() else {
            return (None, None);
        };
        let sender = data
            .get("uname")
            .and_then(|value| value.as_str())
            .unwrap_or("i18n.live.event.fallback.gift_user")
            .to_string();
        let sender_uid = data.get("uid").and_then(|value| value.as_u64());
        let sender_guard_level = data
            .get("medal_info")
            .and_then(|value| value.get("guard_level"))
            .and_then(|value| value.as_i64())
            .unwrap_or(0);
        let sender_face = data
            .get("face")
            .and_then(|value| value.as_str())
            .and_then(normalize_asset_url);
        let sender_name_color = data
            .get("name_color")
            .and_then(|value| value.as_str())
            .and_then(normalize_hex_color);
        let sender_role = if sender_guard_level > 0 {
            "guard"
        } else {
            "viewer"
        };
        let gift_name = data
            .get("giftName")
            .and_then(|value| value.as_str())
            .unwrap_or("i18n.live.event.fallback.gift");
        let num = data
            .get("num")
            .and_then(|value| value.as_i64())
            .unwrap_or(1);
        let gift_unit_price = data
            .get("price")
            .and_then(|value| value.as_i64())
            .unwrap_or(0);
        let gift_total_coin = data
            .get("total_coin")
            .and_then(|value| value.as_i64())
            .or_else(|| {
                data.get("combo_total_coin")
                    .and_then(|value| value.as_i64())
            })
            .unwrap_or_else(|| gift_unit_price.saturating_mul(num.max(1)));
        let gift_coin_type = data
            .get("coin_type")
            .and_then(|value| value.as_str())
            .unwrap_or("");
        return (
            Some(json!({
            "id": id,
            "type": "gift",
            "time": time,
            "sender": sender,
            "content": format!("i18n.live.event.gift.sent:{gift_name}:x{num}"),
            "sender_uid": sender_uid,
            "sender_role": sender_role,
            "sender_guard_level": sender_guard_level,
            "sender_name_color": sender_name_color,
            "sender_face": sender_face,
            "gift_name": gift_name,
            "gift_count": num,
            "gift_coin_type": gift_coin_type,
            "gift_unit_price": gift_unit_price,
            "gift_total_coin": gift_total_coin,
            "cmd": cmd,
            })),
            None,
        );
    }

    if cmd == "GUARD_BUY" {
        let Some(data) = payload["data"].as_object() else {
            return (None, None);
        };
        let sender = data
            .get("username")
            .and_then(|value| value.as_str())
            .unwrap_or("i18n.live.event.fallback.guard_user")
            .to_string();
        let sender_uid = data.get("uid").and_then(|value| value.as_u64());
        let sender_guard_level = data
            .get("guard_level")
            .and_then(|value| value.as_i64())
            .unwrap_or(3);
        let guard_name = data
            .get("gift_name")
            .and_then(|value| value.as_str())
            .unwrap_or("i18n.live.event.fallback.guard");
        let guard_count = data
            .get("num")
            .and_then(|value| value.as_i64())
            .unwrap_or(1);
        let guard_unit_price = data
            .get("price")
            .and_then(|value| value.as_i64())
            .unwrap_or(0);
        return (
            Some(json!({
            "id": id,
            "type": "guard",
            "time": time,
            "sender": sender,
            "content": format!("i18n.live.event.guard.activated:{guard_name}"),
            "sender_uid": sender_uid,
            "sender_role": "guard",
            "sender_guard_level": sender_guard_level,
            "gift_name": guard_name,
            "gift_count": guard_count,
            "gift_coin_type": "guard",
            "gift_unit_price": guard_unit_price,
            "gift_total_coin": guard_unit_price.saturating_mul(guard_count.max(1)),
            "cmd": cmd,
            })),
            None,
        );
    }

    if cmd == "SUPER_CHAT_MESSAGE" || cmd == "SUPER_CHAT_MESSAGE_JPN" {
        let Some(data) = payload["data"].as_object() else {
            return (None, None);
        };
        let sender = data
            .get("user_info")
            .and_then(|value| value.get("uname"))
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .unwrap_or("i18n.live.event.fallback.superchat_user")
            .to_string();
        let sender_uid = data.get("uid").and_then(parse_u64);
        let sender_guard_level = data
            .get("user_info")
            .and_then(|value| value.get("guard_level"))
            .and_then(parse_i64)
            .or_else(|| {
                data.get("medal_info")
                    .and_then(|value| value.get("guard_level"))
                    .and_then(parse_i64)
            })
            .unwrap_or(0);
        let sender_name_color = data
            .get("user_info")
            .and_then(|value| value.get("name_color"))
            .and_then(Value::as_str)
            .and_then(normalize_hex_color);
        let sender_face = data
            .get("user_info")
            .and_then(|value| value.get("face"))
            .and_then(Value::as_str)
            .and_then(normalize_asset_url);
        let sender_role = if sender_guard_level > 0 {
            "guard"
        } else {
            "viewer"
        };
        let superchat_id = data.get("id").and_then(parse_i64);
        let superchat_price = data.get("price").and_then(parse_i64).unwrap_or(0);
        let message = data
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let message_jpn = data.get("message_jpn").and_then(parse_string);
        let gift_name = data
            .get("gift")
            .and_then(|value| value.get("gift_name"))
            .and_then(Value::as_str)
            .unwrap_or("i18n.live.event.fallback.superchat");
        let gift_count = data
            .get("gift")
            .and_then(|value| value.get("num"))
            .and_then(parse_i64)
            .unwrap_or(1);
        return (
            Some(json!({
                "id": id,
                "type": "superchat",
                "time": time,
                "sender": sender,
                "content": message,
                "sender_uid": sender_uid,
                "sender_role": sender_role,
                "sender_guard_level": sender_guard_level,
                "sender_name_color": sender_name_color,
                "sender_face": sender_face,
                "superchat_id": superchat_id,
                "superchat_price": superchat_price,
                "superchat_message_jpn": message_jpn,
                "gift_name": gift_name,
                "gift_count": gift_count,
                "gift_coin_type": "gold",
                "gift_total_coin": superchat_price.saturating_mul(1000),
                "cmd": cmd,
            })),
            None,
        );
    }

    if cmd == "SUPER_CHAT_MESSAGE_DELETE" {
        let ids = payload
            .get("data")
            .and_then(|value| value.get("ids"))
            .and_then(Value::as_array)
            .map(|values| values.iter().filter_map(parse_i64).collect::<Vec<_>>())
            .unwrap_or_default();
        return (
            Some(json!({
                "id": id,
                "type": "moderation",
                "time": time,
                "sender": "system",
                "content": format!("i18n.live.event.moderation.superchat_deleted:{}", ids.len()),
                "deleted_ids": ids,
                "cmd": cmd,
            })),
            None,
        );
    }

    if cmd == "WARNING" {
        let warning_msg = payload
            .get("msg")
            .and_then(Value::as_str)
            .unwrap_or("i18n.live.event.moderation.warning");
        return (
            Some(json!({
                "id": id,
                "type": "moderation",
                "time": time,
                "sender": "system",
                "content": warning_msg,
                "cmd": cmd,
            })),
            None,
        );
    }

    if cmd == "CUT_OFF" {
        let cut_off_msg = payload
            .get("msg")
            .and_then(Value::as_str)
            .unwrap_or("i18n.live.event.moderation.cut_off");
        return (
            Some(json!({
                "id": id,
                "type": "moderation",
                "time": time,
                "sender": "system",
                "content": cut_off_msg,
                "cmd": cmd,
            })),
            None,
        );
    }

    if cmd == "CUT_OFF_V2" {
        let title = payload
            .get("data")
            .and_then(|value| value.get("cut_off_data"))
            .and_then(|value| value.get("cut_off_title"))
            .and_then(Value::as_str)
            .unwrap_or("i18n.live.event.moderation.violation_notice");
        let reason = payload
            .get("data")
            .and_then(|value| value.get("cut_off_data"))
            .and_then(|value| value.get("cut_off_message_list"))
            .and_then(Value::as_array)
            .and_then(|list| {
                list.iter().find_map(|item| {
                    let label = item.get("label").and_then(Value::as_str).unwrap_or("");
                    let content = item.get("content").and_then(Value::as_str).unwrap_or("");
                    if label.is_empty() || content.is_empty() {
                        None
                    } else {
                        Some(format!("{label}:{content}"))
                    }
                })
            })
            .unwrap_or_else(|| "i18n.live.event.moderation.cut_off".to_string());
        return (
            Some(json!({
                "id": id,
                "type": "moderation",
                "time": time,
                "sender": "system",
                "content": format!("{title} · {reason}"),
                "cmd": cmd,
            })),
            None,
        );
    }

    if cmd == "ROOM_BLOCK_MSG" {
        let sender = payload
            .get("data")
            .and_then(|value| value.get("uname"))
            .and_then(Value::as_str)
            .or_else(|| payload.get("uname").and_then(Value::as_str))
            .unwrap_or("i18n.live.event.fallback.some_viewer")
            .to_string();
        let sender_uid = payload
            .get("data")
            .and_then(|value| value.get("uid"))
            .and_then(parse_u64)
            .or_else(|| payload.get("uid").and_then(parse_u64));
        return (
            Some(json!({
                "id": id,
                "type": "moderation",
                "time": time,
                "sender": "system",
                "content": format!("{sender} i18n.live.event.moderation.room_blocked"),
                "sender_uid": sender_uid,
                "cmd": cmd,
            })),
            None,
        );
    }

    if cmd == "ROOM_SILENT_ON" {
        let level = payload
            .get("data")
            .and_then(|value| value.get("level"))
            .and_then(parse_i64)
            .unwrap_or(0);
        return (
            Some(json!({
                "id": id,
                "type": "moderation",
                "time": time,
                "sender": "system",
                "content": format!("i18n.live.event.moderation.silent_on(level={level})"),
                "cmd": cmd,
            })),
            None,
        );
    }

    if cmd == "ROOM_SILENT_OFF" {
        return (
            Some(json!({
                "id": id,
                "type": "moderation",
                "time": time,
                "sender": "system",
                "content": "i18n.live.event.moderation.silent_off",
                "cmd": cmd,
            })),
            None,
        );
    }

    if cmd == "ENTRY_EFFECT" || cmd == "ENTRY_EFFECT_MUST_RECEIVE" {
        let data = payload.get("data").and_then(Value::as_object);
        let sender = data
            .and_then(|value| value.get("uinfo"))
            .and_then(|value| value.get("base"))
            .and_then(|value| value.get("name"))
            .and_then(Value::as_str)
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .or_else(|| {
                data.and_then(|value| value.get("copy_writing"))
                    .and_then(Value::as_str)
                    .and_then(|raw| {
                        raw.split("<%")
                            .nth(1)
                            .and_then(|part| part.split("%>").next())
                            .map(|part| part.trim().to_string())
                    })
            })
            .unwrap_or_else(|| "i18n.live.event.fallback.viewer".to_string());
        let sender_uid = data.and_then(|value| value.get("uid")).and_then(parse_u64);
        let sender_face = data
            .and_then(|value| value.get("face"))
            .and_then(Value::as_str)
            .and_then(normalize_asset_url);
        let copy_writing = data
            .and_then(|value| value.get("copy_writing_v2"))
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .or_else(|| {
                data.and_then(|value| value.get("copy_writing"))
                    .and_then(Value::as_str)
            })
            .unwrap_or("i18n.live.event.interact.enter");
        return (
            Some(json!({
                "id": id,
                "type": "interact",
                "time": time,
                "sender": sender,
                "content": copy_writing,
                "sender_uid": sender_uid,
                "sender_role": "viewer",
                "sender_face": sender_face,
                "interact_type": "enter",
                "cmd": cmd,
            })),
            None,
        );
    }

    if cmd == "ROOM_CHANGE" {
        let title = payload
            .get("data")
            .and_then(|value| value.get("title"))
            .and_then(Value::as_str)
            .unwrap_or("");
        let parent = payload
            .get("data")
            .and_then(|value| value.get("parent_area_name"))
            .and_then(Value::as_str)
            .unwrap_or("");
        let area = payload
            .get("data")
            .and_then(|value| value.get("area_name"))
            .and_then(Value::as_str)
            .unwrap_or("");
        let content = if !title.is_empty() && !parent.is_empty() && !area.is_empty() {
            format!("i18n.live.event.room_change.full:{title}({parent}/{area})")
        } else if !title.is_empty() {
            format!("i18n.live.event.room_change.title:{title}")
        } else {
            "i18n.live.event.room_change".to_string()
        };
        return (
            Some(json!({
                "id": id,
                "type": "live_state",
                "time": time,
                "sender": "system",
                "content": content,
                "cmd": cmd,
            })),
            None,
        );
    }

    if cmd == "GUARD_HONOR_THOUSAND" {
        let add_count = payload
            .get("data")
            .and_then(|value| value.get("add"))
            .and_then(Value::as_array)
            .map(|list| list.len())
            .unwrap_or(0);
        let del_count = payload
            .get("data")
            .and_then(|value| value.get("del"))
            .and_then(Value::as_array)
            .map(|list| list.len())
            .unwrap_or(0);
        return (
            Some(json!({
                "id": id,
                "type": "live_state",
                "time": time,
                "sender": "system",
                "content": format!("i18n.live.event.guard_honor_update:+{add_count}/-{del_count}"),
                "cmd": cmd,
            })),
            None,
        );
    }

    if cmd == "LIVE" {
        return (
            Some(json!({
                "id": id,
                "type": "live_state",
                "time": time,
                "sender": "system",
                "content": "i18n.live.event.live_started",
                "cmd": cmd,
            })),
            None,
        );
    }

    if cmd == "PREPARING" {
        let is_round = payload.get("round").and_then(parse_i64).unwrap_or(0) == 1;
        let content = if is_round {
            "i18n.live.event.preparing_round"
        } else {
            "i18n.live.event.preparing"
        };
        return (
            Some(json!({
                "id": id,
                "type": "live_state",
                "time": time,
                "sender": "system",
                "content": content,
                "cmd": cmd,
            })),
            None,
        );
    }

    if cmd == "RECALL_DANMU_MSG" {
        let recall_target_id = payload
            .get("data")
            .and_then(|value| value.get("target_id"))
            .and_then(parse_i64)
            .map(|value| value.to_string())
            .or_else(|| {
                payload
                    .get("data")
                    .and_then(|value| value.get("target_id"))
                    .and_then(parse_string)
            });
        let recall_type = payload
            .get("data")
            .and_then(|value| value.get("recall_type"))
            .and_then(parse_i64)
            .unwrap_or(0);
        return (
            Some(json!({
                "id": id,
                "type": "recall",
                "time": time,
                "sender": "system",
                "content": "i18n.live.event.danmu_recalled",
                "recall_target_id": recall_target_id,
                "recall_type": recall_type,
                "cmd": cmd,
            })),
            None,
        );
    }

    if cmd == "REENTER_LIVE_ROOM" {
        let range = payload["data"]["request_random_sec_range"]
            .as_u64()
            .unwrap_or(0)
            .min(30);
        let delay_secs = if range > 0 {
            rand::thread_rng().gen_range(0..=range)
        } else {
            0
        };
        let reason = payload["data"]["reason"].as_i64().unwrap_or(-1);
        return (
            Some(json!({
                "id": id,
                "type": "system",
                "time": time,
                "sender": "system",
                "content": format!("i18n.live.event.reenter_requested(reason={reason})"),
                "cmd": cmd,
            })),
            Some(delay_secs),
        );
    }

    (None, None)
}

pub fn is_supported_cmd(cmd: &str) -> bool {
    cmd.starts_with("DANMU_MSG")
        || cmd == "SEND_GIFT"
        || cmd == "GUARD_BUY"
        || cmd == "INTERACT_WORD"
        || cmd == "INTERACT_WORD_V2"
        || cmd == "DM_INTERACTION"
        || cmd == "SUPER_CHAT_MESSAGE"
        || cmd == "SUPER_CHAT_MESSAGE_JPN"
        || cmd == "SUPER_CHAT_MESSAGE_DELETE"
        || cmd == "WARNING"
        || cmd == "CUT_OFF"
        || cmd == "CUT_OFF_V2"
        || cmd == "ROOM_BLOCK_MSG"
        || cmd == "ROOM_SILENT_ON"
        || cmd == "ROOM_SILENT_OFF"
        || cmd == "ENTRY_EFFECT"
        || cmd == "ENTRY_EFFECT_MUST_RECEIVE"
        || cmd == "ROOM_CHANGE"
        || cmd == "GUARD_HONOR_THOUSAND"
        || cmd == "LIVE"
        || cmd == "PREPARING"
        || cmd == "RECALL_DANMU_MSG"
        || cmd == "REENTER_LIVE_ROOM"
}

pub fn build_parse_failed_system_message(cmd: &str) -> Value {
    json!({
        "id": next_msg_id(),
        "type": "system",
        "time": now_hms(),
        "sender": "system",
        "content": format!("i18n.live.event.parse_failed({cmd})"),
        "cmd": cmd,
    })
}
