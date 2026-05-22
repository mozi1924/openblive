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
) {
    sync_live_profile_state_defaults(user);
    let now = chrono::Utc::now().timestamp();
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
}
