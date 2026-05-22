use super::{ParseContext, ParseResult};
use crate::danmu::helpers::{
    dec_color_to_hex, normalize_asset_url, normalize_hex_color, parse_i64, parse_string, parse_u64,
};
use crate::danmu::interact_word::{decode_interact_word_v2_payload, resolve_interact_meta};
use crate::danmu::parser_helpers::parse_dm_interaction_detail;
use serde_json::{json, Value};

pub(super) fn parse(payload: &Value, ctx: &ParseContext<'_>) -> Option<ParseResult> {
    if ctx.cmd == "INTERACT_WORD_V2" {
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
            let content = format!("{sender} {action_text}");
            return Some((
                Some(json!({
                    "id": ctx.id,
                    "type": "interact",
                    "time": ctx.time,
                    "sender": sender,
                    "content": content,
                    "sender_uid": sender_uid,
                    "sender_role": sender_role,
                    "sender_guard_level": sender_guard_level,
                    "sender_name_color": sender_name_color,
                    "sender_face": sender_face,
                    "interact_type": interact_type,
                    "cmd": ctx.cmd,
                })),
                None,
            ));
        }
    }

    if ctx.cmd == "INTERACT_WORD" || ctx.cmd == "INTERACT_WORD_V2" {
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
        let fallback = if ctx.cmd == "INTERACT_WORD_V2" {
            "i18n.live.event.interact.received_v2"
        } else {
            "i18n.live.event.interact.received"
        };
        let has_resolved_detail = msg_type > 0 || sender_uid.is_some() || sender_name_color.is_some();
        let content = if has_resolved_detail {
            format!("{sender} {action_text}")
        } else {
            fallback.to_string()
        };
        return Some((
            Some(json!({
                "id": ctx.id,
                "type": "interact",
                "time": ctx.time,
                "sender": sender,
                "content": content,
                "sender_uid": sender_uid,
                "sender_role": sender_role,
                "sender_guard_level": sender_guard_level,
                "sender_name_color": sender_name_color,
                "interact_type": interact_type,
                "cmd": ctx.cmd,
            })),
            None,
        ));
    }

    if ctx.cmd == "DM_INTERACTION" {
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
        return Some((
            Some(json!({
                "id": ctx.id,
                "type": "interact",
                "time": ctx.time,
                "sender": "system",
                "content": content,
                "cmd": ctx.cmd,
                "interaction_kind": interaction_kind,
                "interaction_event_type": interaction_type,
                "interaction_vote_id": vote_id,
                "interaction_vote_status": vote_status,
                "interaction_vote_question": vote_question,
                "interaction_detail": detail,
            })),
            None,
        ));
    }

    None
}

