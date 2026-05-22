use serde_json::Value;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::constants::CmdResult;

pub(in crate::ws_server) fn invoke_cmd(result: CmdResult) -> Result<Value, String> {
    result.map_err(|error| error.to_string())
}

pub(in crate::ws_server) fn now_unix_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}
