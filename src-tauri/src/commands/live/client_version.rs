use crate::bili::app_sign;
use crate::config::save_config;
use crate::constants::{CmdResult, DEFAULT_LIVEHIME_BUILD, DEFAULT_LIVEHIME_VERSION};
use crate::endpoints;
use crate::response::wrap_ok;
use crate::state::AppState;
use serde_json::json;
use std::collections::BTreeMap;
use tauri::State;

const LIVE_CLIENT_VERSION_TTL_SECS: i64 = 6 * 60 * 60;

fn sanitized_live_client_version(version: &str, build: u64) -> (String, u64) {
    let normalized_version = if version.trim().is_empty() {
        DEFAULT_LIVEHIME_VERSION.to_string()
    } else {
        version.trim().to_string()
    };
    let normalized_build = if build == 0 {
        DEFAULT_LIVEHIME_BUILD
    } else {
        build
    };
    (normalized_version, normalized_build)
}

pub async fn refresh_live_client_version_inner(state: &AppState) -> Result<(String, u64), String> {
    let override_version = endpoints::livehime_version_override();
    let override_build = endpoints::livehime_build_override();
    if !override_version.trim().is_empty() || override_build.is_some() {
        let (version, build) = sanitized_live_client_version(
            if override_version.trim().is_empty() {
                DEFAULT_LIVEHIME_VERSION
            } else {
                &override_version
            },
            override_build.unwrap_or(DEFAULT_LIVEHIME_BUILD),
        );
        let mut runtime = state.runtime.lock().await;
        runtime.config.live_client_version = version.clone();
        runtime.config.live_client_build = build;
        runtime.config.live_client_synced_at = chrono::Utc::now().timestamp();
        save_config(&state.config_path, &runtime.config, &state.master_key);
        return Ok((version, build));
    }

    let ts = chrono::Utc::now().timestamp().to_string();
    let mut params = BTreeMap::new();
    params.insert("system_version".into(), "2".into());
    params.insert("ts".into(), ts);
    let signed = app_sign(&params);
    let query = signed
        .iter()
        .map(|(key, value)| (key.as_str(), value.clone()))
        .collect::<Vec<_>>();

    let value = state
        .client
        .get_json(
            &endpoints::live_api("/xlive/app-blink/v1/liveVersionInfo/getHomePageLiveVersion"),
            &query,
        )
        .await
        .map_err(|error| error.to_string())?;

    if value["code"].as_i64().unwrap_or(-1) != 0 {
        return Err(value["message"]
            .as_str()
            .unwrap_or("i18n.live.error.fetch_live_version_failed")
            .to_string());
    }

    let raw_version = value["data"]["curr_version"].as_str().unwrap_or("");
    let raw_build = value["data"]["build"].as_u64().unwrap_or(0);
    let (version, build) = sanitized_live_client_version(raw_version, raw_build);

    let mut runtime = state.runtime.lock().await;
    runtime.config.live_client_version = version.clone();
    runtime.config.live_client_build = build;
    runtime.config.live_client_synced_at = chrono::Utc::now().timestamp();
    save_config(&state.config_path, &runtime.config, &state.master_key);
    Ok((version, build))
}

async fn resolve_live_client_version(state: &AppState, force_refresh: bool) -> (String, u64, bool) {
    let override_version = endpoints::livehime_version_override();
    let override_build = endpoints::livehime_build_override();
    if !override_version.trim().is_empty() || override_build.is_some() {
        let version = if override_version.trim().is_empty() {
            DEFAULT_LIVEHIME_VERSION.to_string()
        } else {
            override_version
        };
        let build = override_build.unwrap_or(DEFAULT_LIVEHIME_BUILD);
        return (version, build, true);
    }

    let (cached_version, cached_build, synced_at) = {
        let runtime = state.runtime.lock().await;
        (
            runtime.config.live_client_version.clone(),
            runtime.config.live_client_build,
            runtime.config.live_client_synced_at,
        )
    };

    let now = chrono::Utc::now().timestamp();
    let stale = synced_at <= 0 || now - synced_at >= LIVE_CLIENT_VERSION_TTL_SECS;
    let missing = cached_version.trim().is_empty() || cached_build == 0;
    let should_refresh = force_refresh || stale || missing;

    if should_refresh {
        if let Ok((version, build)) = refresh_live_client_version_inner(state).await {
            return (version, build, false);
        }
    }

    let (version, build) = sanitized_live_client_version(&cached_version, cached_build);
    (version, build, true)
}

pub(crate) async fn inject_live_client_identity(
    state: &AppState,
    form: &mut BTreeMap<String, String>,
    force_refresh: bool,
) -> bool {
    let (version, build, from_cache) = resolve_live_client_version(state, force_refresh).await;
    form.insert("version".into(), version);
    form.insert("build".into(), build.to_string());
    from_cache
}

pub async fn refresh_live_client_version(state: State<'_, AppState>) -> CmdResult {
    let (version, build, from_cache) = resolve_live_client_version(&state, true).await;

    Ok(wrap_ok(json!({
        "version": version,
        "build": build,
        "from_cache": from_cache
    })))
}
