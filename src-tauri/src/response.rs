use serde_json::json;

pub fn wrap_ok(data: serde_json::Value) -> serde_json::Value {
    json!({ "code": 0, "msg": "ok", "data": data })
}
