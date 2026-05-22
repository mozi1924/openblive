use super::common::{error_message, is_auth_invalid_code, mark_current_user_login_invalid};
use super::session::resolve_current_auth_context;
use crate::constants::CmdResult;
use crate::endpoints;
use crate::response::wrap_ok;
use crate::state::AppState;
use chrono::{FixedOffset, TimeZone};
use serde::Serialize;
use serde_json::Value;
use tauri::State;

const HISTORY_LIMIT: usize = 8;

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct LiveOverviewMetric {
    name: String,
    index: String,
    me: f64,
    max: f64,
    aver: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct LiveSessionStats {
    live_time: i64,
    add_fans: i64,
    revenue: f64,
    new_fans_club: i64,
    danmu_num: i64,
    max_online: i64,
    watched_count: i64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct LiveSessionSummary {
    live_key: String,
    title: String,
    cover: String,
    start_time: i64,
    end_time: i64,
    duration: i64,
    platform: String,
    room_id: i64,
    stats: Option<LiveSessionStats>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct LiveSessionPoint {
    ts: i64,
    value: i64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct LiveSessionHighlight {
    id: i64,
    r#type: i64,
    start_time: i64,
    end_time: i64,
    title: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct LiveSessionDetail {
    summary: LiveSessionSummary,
    session_data: Vec<LiveSessionPoint>,
    highlights: Vec<LiveSessionHighlight>,
    max_danmaku_ts: Option<i64>,
    max_pcu_ts: Option<i64>,
    max_value: Option<i64>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct LiveDashboardSnapshot {
    current_uid: String,
    overview: Vec<LiveOverviewMetric>,
    sessions: Vec<LiveSessionSummary>,
    latest_session: Option<LiveSessionDetail>,
    fetched_at: i64,
}

#[derive(Clone, Debug, PartialEq)]
struct ReplaySessionSeed {
    live_key: String,
    title: String,
    cover: String,
    start_time: i64,
    end_time: i64,
    duration: i64,
    platform: String,
    room_id: i64,
}

fn canonical_session_duration(seed: &ReplaySessionSeed) -> i64 {
    if seed.duration > 0 {
        return seed.duration;
    }
    seed.end_time.saturating_sub(seed.start_time).max(0)
}

fn display_live_time(stats_live_time: i64, canonical_duration: i64) -> i64 {
    if canonical_duration > 0 {
        canonical_duration
    } else {
        stats_live_time.max(0)
    }
}

#[derive(Debug)]
enum DashboardFetchError {
    Auth { reason: String },
    Recoverable(String),
}

pub async fn get_live_dashboard_snapshot_inner(state: State<'_, AppState>) -> CmdResult {
    let (uid, _room_id, _csrf, cookie) = {
        let runtime = state.runtime.lock().await;
        resolve_current_auth_context(&runtime)?
    };
    if cookie.trim().is_empty() {
        return Err("i18n.account.error.local_credential_empty".into());
    }

    let overview_result = fetch_overview(&state, &cookie).await;
    let replay_result = fetch_replay_list(&state, &cookie).await;

    let overview = match overview_result {
        Ok(metrics) => metrics,
        Err(DashboardFetchError::Auth { reason }) => {
            mark_current_user_login_invalid(&state, &reason).await;
            return Err("i18n.common.login_expired_relogin".into());
        }
        Err(DashboardFetchError::Recoverable(_)) => Vec::new(),
    };

    let replay_items = match replay_result {
        Ok(items) => items,
        Err(DashboardFetchError::Auth { reason }) => {
            mark_current_user_login_invalid(&state, &reason).await;
            return Err("i18n.common.login_expired_relogin".into());
        }
        Err(DashboardFetchError::Recoverable(message)) => {
            if overview.is_empty() {
                return Err(message);
            }
            Vec::new()
        }
    };

    let mut sessions = Vec::with_capacity(replay_items.len());
    let mut latest_session = None;
    for (index, replay) in replay_items.into_iter().enumerate() {
        let canonical_duration = canonical_session_duration(&replay);
        let stop_live_result = fetch_stop_live_data(&state, &cookie, &replay.live_key).await;
        let mut stats = match stop_live_result {
            Ok(stats) => Some(stats),
            Err(DashboardFetchError::Auth { reason }) => {
                mark_current_user_login_invalid(&state, &reason).await;
                return Err("i18n.common.login_expired_relogin".into());
            }
            Err(DashboardFetchError::Recoverable(_)) => None,
        };
        if let Some(entry) = stats.as_mut() {
            entry.live_time = display_live_time(entry.live_time, canonical_duration);
        }

        let summary = LiveSessionSummary {
            live_key: replay.live_key.clone(),
            title: replay.title,
            cover: replay.cover,
            start_time: replay.start_time,
            end_time: replay.end_time,
            duration: canonical_duration,
            platform: replay.platform,
            room_id: replay.room_id,
            stats,
        };

        if index == 0 {
            latest_session = match fetch_session_detail(&state, &cookie, &summary).await {
                Ok(detail) => Some(detail),
                Err(DashboardFetchError::Auth { reason }) => {
                    mark_current_user_login_invalid(&state, &reason).await;
                    return Err("i18n.common.login_expired_relogin".into());
                }
                Err(DashboardFetchError::Recoverable(_)) => Some(LiveSessionDetail {
                    summary: summary.clone(),
                    session_data: Vec::new(),
                    highlights: Vec::new(),
                    max_danmaku_ts: None,
                    max_pcu_ts: None,
                    max_value: None,
                }),
            };
        }

        sessions.push(summary);
    }

    let snapshot = LiveDashboardSnapshot {
        current_uid: uid,
        overview,
        sessions,
        latest_session,
        fetched_at: chrono::Utc::now().timestamp(),
    };

    Ok(wrap_ok(serde_json::to_value(snapshot).unwrap()))
}

async fn fetch_overview(
    state: &AppState,
    cookie: &str,
) -> Result<Vec<LiveOverviewMetric>, DashboardFetchError> {
    let value = state
        .client
        .get_json_with_cookie(
            &endpoints::live_api("/xlive/app-blink/v1/date/Overview"),
            &[],
            cookie,
        )
        .await
        .map_err(|error| DashboardFetchError::Recoverable(error.to_string()))?;
    ensure_success(&value, "get_live_dashboard_snapshot.overview")?;

    Ok(value["data"]["graph"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .map(|item| LiveOverviewMetric {
                    name: item["name"].as_str().unwrap_or("").to_string(),
                    index: item["index"].as_str().unwrap_or("").to_string(),
                    me: item["me"].as_f64().unwrap_or(0.0),
                    max: item["max"].as_f64().unwrap_or(0.0),
                    aver: item["aver"].as_f64().unwrap_or(0.0),
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default())
}

async fn fetch_replay_list(
    state: &AppState,
    cookie: &str,
) -> Result<Vec<ReplaySessionSeed>, DashboardFetchError> {
    let value = state
        .client
        .get_json_with_cookie(
            &endpoints::live_api("/xlive/app-blink/v1/anchorVideo/AnchorGetReplayList"),
            &[
                ("page", "1".to_string()),
                ("page_size", HISTORY_LIMIT.to_string()),
            ],
            cookie,
        )
        .await
        .map_err(|error| DashboardFetchError::Recoverable(error.to_string()))?;
    ensure_success(&value, "get_live_dashboard_snapshot.replays")?;

    Ok(value["data"]["replay_info"]
        .as_array()
        .map(|items| items.iter().map(map_replay_session).collect::<Vec<_>>())
        .unwrap_or_default())
}

async fn fetch_stop_live_data(
    state: &AppState,
    cookie: &str,
    live_key: &str,
) -> Result<LiveSessionStats, DashboardFetchError> {
    let value = state
        .client
        .get_json_with_cookie(
            &endpoints::live_api("/xlive/app-blink/v1/live/StopLiveData"),
            &[("live_key", live_key.to_string())],
            cookie,
        )
        .await
        .map_err(|error| DashboardFetchError::Recoverable(error.to_string()))?;
    ensure_success(&value, "get_live_dashboard_snapshot.stop_live_data")?;
    Ok(map_stop_live_stats(&value["data"]))
}

async fn fetch_session_detail(
    state: &AppState,
    cookie: &str,
    summary: &LiveSessionSummary,
) -> Result<LiveSessionDetail, DashboardFetchError> {
    let value = state
        .client
        .get_json_with_cookie(
            &endpoints::live_api("/xlive/app-blink/v1/anchorVideo/GetLiveSessionData"),
            &[
                ("live_key", summary.live_key.clone()),
                ("start_tm", format_cst(summary.start_time)),
                ("end_tm", format_cst(summary.end_time)),
            ],
            cookie,
        )
        .await
        .map_err(|error| DashboardFetchError::Recoverable(error.to_string()))?;
    ensure_success(&value, "get_live_dashboard_snapshot.session_detail")?;

    let session_data = value["data"]["session_data"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .map(|item| LiveSessionPoint {
                    ts: item["ts"].as_i64().unwrap_or(0),
                    value: item["value"].as_i64().unwrap_or(0),
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let highlights = value["data"]["high_light_data"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .map(|item| LiveSessionHighlight {
                    id: item["id"].as_i64().unwrap_or(0),
                    r#type: item["type"].as_i64().unwrap_or(0),
                    start_time: item["start_time"].as_i64().unwrap_or(0),
                    end_time: item["end_time"].as_i64().unwrap_or(0),
                    title: item["title"].as_str().unwrap_or("").to_string(),
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    Ok(LiveSessionDetail {
        summary: summary.clone(),
        session_data,
        highlights,
        max_danmaku_ts: value["data"]["max_danmaku"].as_i64(),
        max_pcu_ts: value["data"]["max_pcu"].as_i64(),
        max_value: value["data"]["max_value"].as_i64(),
    })
}

fn ensure_success(value: &Value, source: &str) -> Result<(), DashboardFetchError> {
    let code = value["code"].as_i64().unwrap_or(-1);
    if code == 0 {
        return Ok(());
    }

    let message = error_message(value, source);
    if is_auth_invalid_code(code) {
        return Err(DashboardFetchError::Auth {
            reason: format!("{source} code={code}, msg={message}"),
        });
    }
    Err(DashboardFetchError::Recoverable(message))
}

fn map_replay_session(value: &Value) -> ReplaySessionSeed {
    ReplaySessionSeed {
        live_key: value["live_key"].as_str().unwrap_or("").to_string(),
        title: value["live_info"]["title"]
            .as_str()
            .unwrap_or("")
            .to_string(),
        cover: value["live_info"]["cover"]
            .as_str()
            .unwrap_or("")
            .to_string(),
        start_time: value["start_time"].as_i64().unwrap_or(0),
        end_time: value["end_time"].as_i64().unwrap_or(0),
        duration: value["video_info"]["duration"].as_i64().unwrap_or(0),
        platform: value["live_info"]["platform"]
            .as_str()
            .unwrap_or("")
            .to_string(),
        room_id: value["room_id"].as_i64().unwrap_or(0),
    }
}

fn map_stop_live_stats(value: &Value) -> LiveSessionStats {
    LiveSessionStats {
        live_time: value["LiveTime"].as_i64().unwrap_or(0),
        add_fans: value["AddFans"].as_i64().unwrap_or(0),
        revenue: value["HamsterRmb"].as_f64().unwrap_or(0.0),
        new_fans_club: value["NewFansClub"].as_i64().unwrap_or(0),
        danmu_num: value["DanmuNum"].as_i64().unwrap_or(0),
        max_online: value["MaxOnline"].as_i64().unwrap_or(0),
        watched_count: value["WatchedCount"].as_i64().unwrap_or(0),
    }
}

fn format_cst(ts: i64) -> String {
    let offset = FixedOffset::east_opt(8 * 3600).unwrap();
    offset
        .timestamp_opt(ts, 0)
        .single()
        .map(|value| value.format("%Y-%m-%d %H:%M:%S").to_string())
        .unwrap_or_else(|| "1970-01-01 08:00:00".to_string())
}

#[cfg(test)]
mod tests {
    use super::{
        canonical_session_duration, display_live_time, format_cst, map_replay_session,
        map_stop_live_stats, ReplaySessionSeed,
    };
    use serde_json::json;

    #[test]
    fn maps_replay_session_fields() {
        let mapped = map_replay_session(&json!({
            "live_key": "abc",
            "room_id": 42,
            "start_time": 100,
            "end_time": 220,
            "live_info": {
                "title": "test title",
                "cover": "https://example.com/cover.png",
                "platform": "pc_link"
            },
            "video_info": {
                "duration": 120
            }
        }));

        assert_eq!(mapped.live_key, "abc");
        assert_eq!(mapped.title, "test title");
        assert_eq!(mapped.duration, 120);
        assert_eq!(mapped.room_id, 42);
    }

    #[test]
    fn maps_stop_live_stats_fields() {
        let mapped = map_stop_live_stats(&json!({
            "LiveTime": 3600,
            "AddFans": 12,
            "HamsterRmb": 34.5,
            "NewFansClub": 2,
            "DanmuNum": 88,
            "MaxOnline": 66,
            "WatchedCount": 777
        }));

        assert_eq!(mapped.live_time, 3600);
        assert_eq!(mapped.revenue, 34.5);
        assert_eq!(mapped.watched_count, 777);
    }

    #[test]
    fn formats_cst_timestamp() {
        assert_eq!(format_cst(0), "1970-01-01 08:00:00");
    }

    #[test]
    fn prefers_replay_duration_for_display_live_time() {
        assert_eq!(display_live_time(100800, 420), 420);
        assert_eq!(display_live_time(180, 0), 180);
        assert_eq!(display_live_time(-8, 0), 0);
    }

    #[test]
    fn canonical_duration_falls_back_to_end_minus_start() {
        let seed = ReplaySessionSeed {
            live_key: "live-key".to_string(),
            title: "title".to_string(),
            cover: String::new(),
            start_time: 100,
            end_time: 220,
            duration: 0,
            platform: "pc_link".to_string(),
            room_id: 1,
        };
        assert_eq!(canonical_session_duration(&seed), 120);
    }
}
