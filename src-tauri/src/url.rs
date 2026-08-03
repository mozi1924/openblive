pub fn normalize_https_url(url: &str) -> String {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if trimmed.starts_with("//") {
        format!("https:{trimmed}")
    } else if let Some(stripped) = trimmed.strip_prefix("http://") {
        format!("https://{stripped}")
    } else {
        trimmed.to_string()
    }
}

pub fn normalize_asset_url(url: &str) -> Option<String> {
    let normalized = normalize_https_url(url);
    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_https_url() {
        assert_eq!(
            normalize_https_url("//hdslb.com/icon.png"),
            "https://hdslb.com/icon.png"
        );
        assert_eq!(
            normalize_https_url("http://hdslb.com/icon.png"),
            "https://hdslb.com/icon.png"
        );
        assert_eq!(
            normalize_https_url("https://hdslb.com/icon.png"),
            "https://hdslb.com/icon.png"
        );
        assert_eq!(normalize_https_url("   "), "");
    }
}
