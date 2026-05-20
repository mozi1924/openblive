use serde_json::Value;

pub fn normalize_hex_color(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.starts_with('#') {
        return Some(trimmed.to_string());
    }
    if trimmed.len() == 6 || trimmed.len() == 8 {
        return Some(format!("#{trimmed}"));
    }
    None
}

pub fn dec_color_to_hex(value: i64) -> Option<String> {
    if value <= 0 {
        return None;
    }
    Some(format!("#{:06X}", value as u32 & 0x00FF_FFFF))
}

pub fn normalize_asset_url(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.starts_with("//") {
        return Some(format!("https:{trimmed}"));
    }
    if let Some(stripped) = trimmed.strip_prefix("http://") {
        return Some(format!("https://{stripped}"));
    }
    Some(trimmed.to_string())
}

pub fn parse_i64(value: &Value) -> Option<i64> {
    value
        .as_i64()
        .or_else(|| value.as_u64().and_then(|num| i64::try_from(num).ok()))
        .or_else(|| value.as_str().and_then(|raw| raw.parse::<i64>().ok()))
}

pub fn parse_u64(value: &Value) -> Option<u64> {
    value
        .as_u64()
        .or_else(|| value.as_i64().and_then(|num| u64::try_from(num).ok()))
        .or_else(|| value.as_str().and_then(|raw| raw.parse::<u64>().ok()))
}

pub fn parse_string(value: &Value) -> Option<String> {
    value
        .as_str()
        .map(|raw| raw.trim().to_string())
        .filter(|raw| !raw.is_empty())
}
