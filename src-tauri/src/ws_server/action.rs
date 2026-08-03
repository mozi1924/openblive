use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

use super::utils::{invoke_cmd, now_unix_secs};
use crate::models::{
    AddBlackUserReq, AddLiveTagReq, AddRoomAdminReq, AddSilentUserReq, CreateLiveReserveReq,
    CreateLiveVoteReq, DanmuReq, GetBlackUserListReq, GetRoomAdminListReq, GetSilentUserListReq,
    RemoveBlackUserReq, RemoveLiveTagReq, RemoveRoomAdminReq, RemoveSilentUserReq,
    TerminateLiveVoteReq, UpdateAreaReq, UpdateLiveCoverReq, UpdateRoomNewsReq, UpdateTagsReq,
    UpdateTitleReq,
};
use crate::state::AppState;

pub async fn dispatch_action(
    app: &AppHandle,
    action: &str,
    params: Value,
) -> Result<Value, String> {
    let state = app.state::<AppState>();
    match action {
        "live.start" => invoke_cmd(crate::commands::start_live_flow_inner(app, &state).await),
        "live.stop" => invoke_cmd(crate::commands::stop_live_flow_inner(app, &state).await),
        "live.status.sync" | "sync.live_status" => {
            let session = crate::commands::sync_live_status_runtime(&state).await;
            serde_json::to_value(session).map_err(|error| error.to_string())
        }

        "profile.sync" | "sync.profile" => {
            invoke_cmd(crate::commands::sync_live_room_profile_runtime(&state).await)
        }
        "profile.title.update" => {
            let req: UpdateTitleReq = serde_json::from_value(params)
                .map_err(|e| format!("invalid params for profile.title.update: {e}"))?;
            invoke_cmd(crate::commands::update_title_inner(req, state).await)
        }
        "profile.area.update" => {
            let req: UpdateAreaReq = serde_json::from_value(params)
                .map_err(|e| format!("invalid params for profile.area.update: {e}"))?;
            invoke_cmd(crate::commands::update_area_inner(req, state).await)
        }
        "profile.room_news.update" => {
            let req: UpdateRoomNewsReq = serde_json::from_value(params)
                .map_err(|e| format!("invalid params for profile.room_news.update: {e}"))?;
            invoke_cmd(crate::commands::update_room_news_inner(req, state).await)
        }
        "profile.cover.update" => {
            let req: UpdateLiveCoverReq = serde_json::from_value(params)
                .map_err(|e| format!("invalid params for profile.cover.update: {e}"))?;
            invoke_cmd(crate::commands::update_live_cover_inner(req, state).await)
        }
        "profile.tags.update" => {
            let req: UpdateTagsReq = serde_json::from_value(params)
                .map_err(|e| format!("invalid params for profile.tags.update: {e}"))?;
            invoke_cmd(crate::commands::update_live_tags_inner(req, state).await)
        }
        "profile.tags.add" => {
            let req: AddLiveTagReq = serde_json::from_value(params)
                .map_err(|e| format!("invalid params for profile.tags.add: {e}"))?;
            invoke_cmd(crate::commands::add_live_tag_inner(req, state).await)
        }
        "profile.tags.remove" => {
            let req: RemoveLiveTagReq = serde_json::from_value(params)
                .map_err(|e| format!("invalid params for profile.tags.remove: {e}"))?;
            invoke_cmd(crate::commands::remove_live_tag_inner(req, state).await)
        }

        "danmu.start" => {
            invoke_cmd(crate::commands::start_danmu_monitor_for_ws(app, &state).await)
        }
        "danmu.stop" => {
            invoke_cmd(crate::commands::stop_danmu_monitor_for_ws(&state).await)
        }
        "danmu.recent" => {
            invoke_cmd(crate::commands::get_recent_danmu_for_ws(&state).await)
        }
        "danmu.send" => {
            let req: DanmuReq = serde_json::from_value(params)
                .map_err(|e| format!("invalid params for danmu.send: {e}"))?;
            invoke_cmd(crate::commands::send_danmu_inner(req, &state).await)
        }

        "emoticons.get" => {
            invoke_cmd(crate::commands::get_live_emoticons_inner(&state).await)
        }
        "reserve.create" => {
            let req: CreateLiveReserveReq = serde_json::from_value(params)
                .map_err(|e| format!("invalid params for reserve.create: {e}"))?;
            invoke_cmd(crate::commands::create_live_reserve_inner(req, &state).await)
        }
        "vote.create" => {
            let req: CreateLiveVoteReq = serde_json::from_value(params)
                .map_err(|e| format!("invalid params for vote.create: {e}"))?;
            invoke_cmd(crate::commands::create_live_vote_inner(req, &state).await)
        }
        "vote.terminate" => {
            let req: TerminateLiveVoteReq = serde_json::from_value(params)
                .map_err(|e| format!("invalid params for vote.terminate: {e}"))?;
            invoke_cmd(crate::commands::terminate_live_vote_inner(req, &state).await)
        }

        "user.silent.add" => {
            let req: AddSilentUserReq = serde_json::from_value(params)
                .map_err(|e| format!("invalid params for user.silent.add: {e}"))?;
            invoke_cmd(crate::commands::add_silent_user_inner(req, &state).await)
        }
        "user.silent.remove" => {
            let req: RemoveSilentUserReq = serde_json::from_value(params)
                .map_err(|e| format!("invalid params for user.silent.remove: {e}"))?;
            invoke_cmd(crate::commands::remove_silent_user_inner(req, &state).await)
        }
        "user.silent.list" => {
            let req: GetSilentUserListReq =
                serde_json::from_value(params).unwrap_or(GetSilentUserListReq { page: None });
            invoke_cmd(crate::commands::get_silent_user_list_inner(req, &state).await)
        }
        "user.black.add" => {
            let req: AddBlackUserReq = serde_json::from_value(params)
                .map_err(|e| format!("invalid params for user.black.add: {e}"))?;
            invoke_cmd(crate::commands::add_black_user_inner(req, &state).await)
        }
        "user.black.remove" => {
            let req: RemoveBlackUserReq = serde_json::from_value(params)
                .map_err(|e| format!("invalid params for user.black.remove: {e}"))?;
            invoke_cmd(crate::commands::remove_black_user_inner(req, &state).await)
        }
        "user.black.list" => {
            let req: GetBlackUserListReq = serde_json::from_value(params)
                .unwrap_or(GetBlackUserListReq { page: None, page_size: None });
            invoke_cmd(crate::commands::get_black_user_list_inner(req, &state).await)
        }
        "user.admin.add" => {
            let req: AddRoomAdminReq = serde_json::from_value(params)
                .map_err(|e| format!("invalid params for user.admin.add: {e}"))?;
            invoke_cmd(crate::commands::add_room_admin_inner(req, &state).await)
        }
        "user.admin.remove" => {
            let req: RemoveRoomAdminReq = serde_json::from_value(params)
                .map_err(|e| format!("invalid params for user.admin.remove: {e}"))?;
            invoke_cmd(crate::commands::remove_room_admin_inner(req, &state).await)
        }
        "user.admin.list" => {
            let req: GetRoomAdminListReq =
                serde_json::from_value(params).unwrap_or(GetRoomAdminListReq { page: None });
            invoke_cmd(crate::commands::get_room_admin_list_inner(req, &state).await)
        }

        "session.get" => {
            let runtime = state.runtime.lock().await;
            Ok(json!({
                "session": runtime.session,
                "danmu_running": runtime.danmu_task.is_some(),
                "overlay_enabled": runtime.config.danmu_overlay_enabled,
            }))
        }
        "server.ping" => Ok(json!({ "pong": true, "at": now_unix_secs() })),
        _ => Err(format!("unknown action: {action}")),
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_action_names() {
        let valid_actions = [
            "live.start",
            "live.stop",
            "live.status.sync",
            "profile.sync",
            "profile.title.update",
            "profile.area.update",
            "profile.room_news.update",
            "profile.cover.update",
            "profile.tags.update",
            "profile.tags.add",
            "profile.tags.remove",
            "danmu.start",
            "danmu.stop",
            "danmu.recent",
            "danmu.send",
            "emoticons.get",
            "reserve.create",
            "vote.create",
            "vote.terminate",
            "user.silent.add",
            "user.silent.remove",
            "user.silent.list",
            "user.black.add",
            "user.black.remove",
            "user.black.list",
            "user.admin.add",
            "user.admin.remove",
            "user.admin.list",
            "session.get",
            "server.ping",
        ];
        assert_eq!(valid_actions.len(), 30);
    }
}
