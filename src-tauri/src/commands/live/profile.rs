use crate::models::{sync_live_profile_state_defaults, RecentArea, UserRecord};

const RECENT_AREAS_LIMIT: usize = 6;

pub(crate) fn split_tags(raw: &str) -> Vec<String> {
    raw.split([',', '，'])
        .map(|tag| tag.trim())
        .filter(|tag| !tag.is_empty())
        .map(|tag| tag.to_string())
        .collect()
}

pub(crate) fn title_review_from_audit_status(status: Option<i64>) -> &'static str {
    match status {
        Some(2) => "pending",
        Some(0) => "none",
        Some(_) => "unknown",
        None => "none",
    }
}

pub(crate) fn cover_review_from_audit_status(
    status: Option<i64>,
    has_cover: bool,
) -> &'static str {
    if !has_cover {
        return "none";
    }
    match status {
        Some(1) => "approved",
        Some(0) => "pending",
        Some(_) => "unknown",
        None => "unknown",
    }
}

pub(crate) fn normalize_cover_url(cover: &str) -> String {
    let trimmed = cover.trim();
    if trimmed.starts_with("//") {
        format!("https:{trimmed}")
    } else if let Some(stripped) = trimmed.strip_prefix("http://") {
        format!("https://{stripped}")
    } else {
        trimmed.to_string()
    }
}

fn same_tags(left: &[String], right: &[String]) -> bool {
    fn normalize(values: &[String]) -> Vec<String> {
        let mut normalized: Vec<String> = values
            .iter()
            .map(|tag| tag.trim())
            .filter(|tag| !tag.is_empty())
            .map(|tag| tag.to_string())
            .collect();
        normalized.sort();
        normalized.dedup();
        normalized
    }

    normalize(left) == normalize(right)
}

fn same_cover(left: &str, right: &str) -> bool {
    normalize_cover_url(left) == normalize_cover_url(right)
}

pub(crate) fn push_recent_area(user: &mut UserRecord, parent: &str, child: &str) {
    let parent = parent.trim();
    let child = child.trim();
    if parent.is_empty() || child.is_empty() {
        return;
    }

    user.recent_areas
        .retain(|item| !(item.parent == parent && item.child == child));
    user.recent_areas.insert(
        0,
        RecentArea {
            parent: parent.to_string(),
            child: child.to_string(),
        },
    );
    if user.recent_areas.len() > RECENT_AREAS_LIMIT {
        user.recent_areas.truncate(RECENT_AREAS_LIMIT);
    }
}

pub(crate) fn apply_profile_state_from_remote(
    user: &mut UserRecord,
    title: &str,
    parent: &str,
    child: &str,
    area_id: Option<u64>,
    tags: &[String],
    cover_url: &str,
    cover_review: &str,
    cover_message: &str,
) {
    sync_live_profile_state_defaults(user);
    let now = chrono::Utc::now().timestamp();
    let normalized_cover_url = normalize_cover_url(cover_url);
    let title_matches_submitted = user.live_profile_state.title.submitted == title;

    if user.live_profile_state.title.submitted.is_empty() {
        user.live_profile_state.title.submitted = title.to_string();
        user.last_title = title.to_string();
    }
    user.live_profile_state.title.effective = title.to_string();
    if title_matches_submitted {
        user.live_profile_state.title.transport = "synced".to_string();
        if matches!(
            user.live_profile_state.title.review.as_str(),
            "pending" | "unknown"
        ) {
            user.live_profile_state.title.review = "none".to_string();
        }
        user.live_profile_state.title.message.clear();
    } else if user.live_profile_state.title.review != "pending" {
        user.live_profile_state.title.transport = "conflict".to_string();
        user.live_profile_state.title.message = "i18n.live.profile.title_conflict".to_string();
    }
    user.live_profile_state.title.updated_at = now;

    if user.live_profile_state.area.submitted_parent.is_empty()
        && user.live_profile_state.area.submitted_child.is_empty()
    {
        user.live_profile_state.area.submitted_parent = parent.to_string();
        user.live_profile_state.area.submitted_child = child.to_string();
        user.live_profile_state.area.submitted_area_id = area_id;
        if !parent.is_empty() && !child.is_empty() {
            user.last_area_name = vec![parent.to_string(), child.to_string()];
        }
        if let Some(area_id) = area_id {
            user.last_area_id = area_id.to_string();
        }
    }
    user.live_profile_state.area.effective_parent = parent.to_string();
    user.live_profile_state.area.effective_child = child.to_string();
    user.live_profile_state.area.effective_area_id = area_id;
    if user.live_profile_state.area.submitted_area_id == Some(0)
        && user.live_profile_state.area.submitted_parent == parent
        && user.live_profile_state.area.submitted_child == child
    {
        user.live_profile_state.area.submitted_area_id = area_id;
        if let Some(area_id) = area_id {
            user.last_area_id = area_id.to_string();
        }
    }
    if user.live_profile_state.area.submitted_parent == parent
        && user.live_profile_state.area.submitted_child == child
        && user.live_profile_state.area.submitted_area_id == area_id
    {
        user.live_profile_state.area.transport = "synced".to_string();
        if user.live_profile_state.area.message == "i18n.live.profile.area_conflict" {
            user.live_profile_state.area.message.clear();
        }
    } else {
        user.live_profile_state.area.transport = "conflict".to_string();
        user.live_profile_state.area.message = "i18n.live.profile.area_conflict".to_string();
    }
    user.live_profile_state.area.updated_at = now;

    if user.live_profile_state.tags.submitted.is_empty() && !tags.is_empty() {
        user.live_profile_state.tags.submitted = tags.to_vec();
        user.last_tags = tags.to_vec();
    }
    user.live_profile_state.tags.effective = tags.to_vec();
    if same_tags(&user.live_profile_state.tags.submitted, tags) {
        user.live_profile_state.tags.transport = "synced".to_string();
        if user.live_profile_state.tags.message == "i18n.live.profile.tags_conflict" {
            user.live_profile_state.tags.message.clear();
        }
    } else {
        user.live_profile_state.tags.transport = "conflict".to_string();
        user.live_profile_state.tags.message = "i18n.live.profile.tags_conflict".to_string();
    }
    user.live_profile_state.tags.updated_at = now;

    if user.live_profile_state.cover.submitted.is_empty() {
        user.live_profile_state.cover.submitted = normalized_cover_url.clone();
        user.last_cover = normalized_cover_url.clone();
    }
    user.live_profile_state.cover.effective = normalized_cover_url.clone();
    if same_cover(&user.live_profile_state.cover.submitted, &normalized_cover_url) {
        user.live_profile_state.cover.transport = "synced".to_string();
        user.live_profile_state.cover.review = cover_review.to_string();
        user.live_profile_state.cover.message = cover_message.to_string();
        user.last_cover = normalized_cover_url;
    } else {
        user.live_profile_state.cover.transport = "conflict".to_string();
        user.live_profile_state.cover.review = cover_review.to_string();
        user.live_profile_state.cover.message = "i18n.live.profile.cover_conflict".to_string();
    }
    user.live_profile_state.cover.updated_at = now;
}

#[cfg(test)]
mod tests {
    use super::normalize_cover_url;

    #[test]
    fn normalize_cover_url_upgrades_http_and_protocol_relative_urls() {
        assert_eq!(
            normalize_cover_url("http://i0.hdslb.com/bfs/live/demo.jpg"),
            "https://i0.hdslb.com/bfs/live/demo.jpg"
        );
        assert_eq!(
            normalize_cover_url("//i0.hdslb.com/bfs/live/demo.jpg"),
            "https://i0.hdslb.com/bfs/live/demo.jpg"
        );
        assert_eq!(
            normalize_cover_url("https://i0.hdslb.com/bfs/live/demo.jpg"),
            "https://i0.hdslb.com/bfs/live/demo.jpg"
        );
    }
}
