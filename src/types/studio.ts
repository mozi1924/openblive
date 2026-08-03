export type Resp<T> = {
  code: number;
  msg: string;
  data?: T;
  qr?: string;
};

/**
 * Event names emitted from Rust backend to TypeScript frontend over Tauri IPC.
 * Corresponding Rust definitions:
 * - DANMU_MESSAGE: `src-tauri/src/danmu.rs`
 * - DANMU_AVATAR_RESOLVED: `src-tauri/src/danmu.rs`
 * - APP_LOG: `src-tauri/src/commands/system.rs`
 * - STUDIO_STATE: `src-tauri/src/state_event.rs`
 * - DANMU_OVERLAY_SETTINGS: `src-tauri/src/commands/system.rs`
 */
export const EVENT_NAMES = {
  DANMU_MESSAGE: "danmu-message",
  DANMU_AVATAR_RESOLVED: "danmu-avatar-resolved",
  APP_LOG: "app-log",
  STUDIO_STATE: "studio-state",
  DANMU_OVERLAY_SETTINGS: "danmu-overlay-settings",
} as const;

export type EventName = (typeof EVENT_NAMES)[keyof typeof EVENT_NAMES];


export type ActiveTab = "account" | "dashboard" | "stream" | "danmu" | "project" | "settings";

export type TransportStatus = "idle" | "saving" | "synced" | "conflict" | "failed";

export type ReviewStatus = "none" | "pending" | "approved" | "rejected" | "unknown";

export type AppConfig = {
  min_to_tray: boolean;
  hide_dock_on_minimize: boolean;
  danmu_overlay_enabled: boolean;
  danmu_overlay_opacity: number;
  danmu_overlay_always_on_top: boolean;
  live_control_mode: "none" | "obs_ws" | "command";
  obs_ws_enabled: boolean;
  obs_ws_url: string;
  obs_ws_password: string;
  obs_ws_auto_start_on_live: boolean;
  obs_ws_auto_stop_on_live_end: boolean;
  on_live_start_command: string;
  on_live_stop_command: string;
  force_custom_push_url: boolean;
  custom_push_url: string;
  ws_server_enabled: boolean;
  ws_server_listen_addr: string;
  ws_server_auth_token: string;
  ws_server_bypass_token_for_loopback: boolean;
  locale: "auto" | "zh-CN" | "en-US";
  host_www: string;
  host_api: string;
  host_live_api: string;
  host_passport: string;
  host_live_web: string;
  cookie_domain: string;
  danmu_host: string;
  app_key: string;
  app_sec: string;
  http_user_agent: string;
  livehime_version_override: string;
  livehime_build_override: string;
  live_platform: string;
  filter_entry_effect: boolean;
  filter_enter_msg: boolean;
  filter_guard_status: boolean;
  filter_follow_share_msg: boolean;
  is_win32: boolean;
  is_macos: boolean;
  has_tray: boolean;
};

export type DanmuOverlaySettingsEvent = {
  enabled: boolean;
  opacity: number;
  always_on_top: boolean;
};

export type DanmuAvatarResolvedEvent = {
  uid: string;
  sender_face: string;
};

export type Session = {
  uid: number;
  room_id: string;
  csrf: string;
  is_live: boolean;
  live_status?: number;
  live_time?: string;
  current_area_id?: number;
  current_area_names?: string[];
  live_key?: string;
  sub_session_key?: string;
  from_cache?: boolean;
  last_sync_at?: number;
  error_code?: string;
};

export type User = {
  uid: string;
  uname: string;
  face: string;
  level: number;
  follower: number;
  following?: number;
  money?: number;
  bcoin?: number;
  last_title: string;
  last_room_news?: string;
  last_area_name: string[];
  last_tags?: string[];
  last_cover?: string;
  last_cover_asset?: string;
  recent_areas?: RecentArea[];
  live_profile_state?: LiveProfileState;
  login_invalid?: boolean;
};

export type RecentArea = {
  parent: string;
  child: string;
};

export type TitleProfileState = {
  submitted: string;
  effective: string;
  transport: TransportStatus;
  review: ReviewStatus;
  message: string;
  updated_at: number;
};

export type AreaProfileState = {
  submitted_parent: string;
  submitted_child: string;
  submitted_area_id?: number;
  effective_parent: string;
  effective_child: string;
  effective_area_id?: number;
  transport: TransportStatus;
  review: ReviewStatus;
  message: string;
  updated_at: number;
};

export type TagsProfileState = {
  submitted: string[];
  effective: string[];
  transport: TransportStatus;
  review: ReviewStatus;
  message: string;
  updated_at: number;
};

export type CoverProfileState = {
  submitted: string;
  effective: string;
  transport: TransportStatus;
  review: ReviewStatus;
  message: string;
  updated_at: number;
};

export type LiveProfileState = {
  title: TitleProfileState;
  area: AreaProfileState;
  tags: TagsProfileState;
  cover: CoverProfileState;
};

export type StreamInfo = {
  rtmp1?: {
    addr?: string;
    code?: string;
  };
  endpoints?: StreamEndpoint[];
  protocols?: unknown[];
  primary_protocol?: string;
  live_key?: string;
  sub_session_key?: string;
  status?: string;
  need_face_auth?: boolean;
  service_source?: string;
  up_stream_extra?: Record<string, unknown>;
};

export type LiveFlowResp = {
  stream_info?: StreamInfo | null;
  danmu_monitor_started?: boolean;
  danmu_monitor_msg?: string;
  live_stopped?: boolean;
  danmu_monitor_stopped?: boolean;
  session_consistent?: boolean;
  recent_areas?: RecentArea[];
};

export type StreamEndpoint = {
  protocol: string;
  addr: string;
  code: string;
  full_url: string;
};

export type LiveRoomProfile = {
  title: string;
  room_news?: string;
  parent: string;
  child: string;
  area_id?: number;
  tags: string[];
  cover: string;
  cover_asset_url?: string;
  profile_state?: LiveProfileState;
  from_cache: boolean;
};

export type UpdateAreaResp = {
  area_id: number;
  profile_state?: LiveProfileState;
};

export type UpdateTitleResp = {
  profile_state?: LiveProfileState;
};

export type UpdateRoomNewsResp = {
  content: string;
};

export type CreateLiveReserveResp = {
  sid: number;
  title: string;
  live_plan_start_time: number;
  create_dynamic: boolean;
};

export type UpdateTagsResp = {
  tags: string[];
  tag_items?: LiveTagItem[];
  added: string[];
  removed: string[];
  profile_state?: LiveProfileState;
};

export type LiveTagItem = {
  tag_id: number;
  tag_content: string;
  audit_status: number;
};

export type GetLiveTagsResp = {
  tags: LiveTagItem[];
  tag_contents: string[];
  profile_state?: LiveProfileState;
};

export type AddLiveTagResp = {
  added: string;
  tags: string[];
  tag_items: LiveTagItem[];
  profile_state?: LiveProfileState;
};

export type RemoveLiveTagResp = {
  removed: string;
  tags: string[];
  tag_items: LiveTagItem[];
  profile_state?: LiveProfileState;
};

export type LiveCoverInfo = {
  url: string;
  cover_asset_url?: string;
  auditStatus?: number;
  auditReason?: string;
  selectStatus?: number;
};

export type LiveCoverHistoryItem = {
  cover_url: string;
  cover_asset_url?: string;
  score?: number;
  score_tag?: number;
  score_color?: string;
  cover_id?: number;
  upload_time?: number;
  use_status?: number;
};

export type LiveCoverAdviceItem = {
  title: string;
  content: string;
  example?: string;
  error_example?: string;
};

export type LiveCoverAdvice = {
  cover_url?: string;
  score?: number;
  score_tag?: number;
  advice?: LiveCoverAdviceItem[];
  audit_status?: number;
  advice_status?: number;
  score_color?: string;
  show_bubble?: boolean;
  icon?: string;
  show_history?: boolean;
  show_status?: number;
  ecology_audit_status?: number;
  ecology_audit_reason?: string;
  audit_reason?: string;
  is_ban?: boolean;
  ban_tips?: string;
  ban_end_time?: number;
};

export type GetLiveCoverHistoryResp = {
  history: LiveCoverHistoryItem[];
};

export type UpdateLiveCoverResp = {
  cover: string;
  cover_asset_url?: string;
  profile_state?: LiveProfileState;
};

export type UploadLiveCoverResp = {
  location: string;
  etag?: string;
};

export type DanmuMsg = {
  id: string;
  type:
    | "danmu"
    | "gift"
    | "guard"
    | "system"
    | "interact"
    | "superchat"
    | "moderation"
    | "live_state"
    | "recall";
  time: string;
  created_at_ms?: number;
  sender: string;
  content: string;
  cmd?: string;
  sender_uid?: number;
  sender_role?: "viewer" | "anchor" | "admin" | "guard";
  sender_name_color?: string;
  sender_guard_level?: number;
  sender_face?: string;
  interact_type?: "enter" | "follow" | "share" | "unknown";
  interaction_kind?: "vote" | "danmu" | "follow" | "gift" | "share" | "like" | "unknown";
  interaction_event_type?: number;
  interaction_vote_id?: number;
  interaction_vote_status?: number;
  interaction_vote_question?: string;
  interaction_detail?: unknown;
  superchat_id?: number;
  superchat_price?: number;
  superchat_message_jpn?: string;
  deleted_ids?: number[];
  recall_target_id?: string;
  recalled?: boolean;
  danmu_msg_id?: string;
  danmu_id_str?: string;
  danmu_rnd?: number;
  danmu_legacy_id?: number;
  gift_name?: string;
  gift_count?: number;
  gift_coin_type?: string;
  gift_unit_price?: number;
  gift_total_coin?: number;
  optimistic?: boolean;
  emoticon?: DanmuEmoticon;
  segments?: DanmuContentSegment[];
};

export type AccountList = {
  list: User[];
  current_uid: string | null;
};

export type DanmuEmoticon = {
  emoticon_id?: number;
  emoticon_unique?: string;
  text: string;
  url: string;
  width: number;
  height: number;
  is_dynamic?: boolean;
};

export type DanmuContentSegment =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "emoticon";
      text: string;
      emoticon: DanmuEmoticon;
    };

export type LiveEmoticon = {
  emoticon_id: number;
  emoticon_unique: string;
  text: string;
  label: string;
  url: string;
  width: number;
  height: number;
  is_dynamic: boolean;
};

export type LiveEmoticonPackage = {
  pkg_id: number;
  pkg_name: string;
  pkg_descript: string;
  emoticons: LiveEmoticon[];
};

export type LiveVoteOption = {
  idx: number;
  desc: string;
  percent: number;
};

export type LiveVoteInfo = {
  status: number;
  question: string;
  options: LiveVoteOption[];
  duration: number;
  result?: number;
  result_text?: string;
  etime_str?: string;
  left_duration?: number;
  interaction_id: number;
  template_id?: number;
};

export type LiveVoteTemplate = {
  template_id: number;
  question: string;
  option_a: string;
  option_b: string;
};

export type LiveVotePanelData = {
  vote_info: LiveVoteInfo | null;
  templates: LiveVoteTemplate[];
};

export type LiveOnlineRankItem = {
  user_rank: number;
  uid: string;
  name: string;
  face: string;
};

export type LiveOnlineRankData = {
  online_num: number;
  online_rank_items: LiveOnlineRankItem[];
};

export type LiveSilentUserItem = {
  tuid: number;
  tname: string;
  uid: number;
  name: string;
  ctime: string;
  id: number;
  is_anchor: number;
  face: string;
  admin_level: number;
};

export type PageResult<T> = {
  page: number;
  page_size: number;
  total: number;
  total_page: number;
  items: T[];
};

export type LiveSilentUserListData = PageResult<LiveSilentUserItem>;

export type LiveBlackUserItem = {
  mid: number;
  uname: string;
  face: string;
  mtime: number;
  attribute?: number;
  sign?: string;
};

export type LiveBlackUserListData = PageResult<LiveBlackUserItem>;

export type LiveRoomAdminItem = {
  uid: number;
  uname: string;
  face: string;
  ctime: string;
  admin_level: number;
  permissions?: number[];
};

export type LiveRoomAdminListData = PageResult<LiveRoomAdminItem> & {
  max_room_anchors_number?: number;
};

export type LiveVoteHistoryData = {
  history: LiveVoteInfo[];
};

export type LiveOverviewMetric = {
  name: string;
  index: string;
  me: number;
  max: number;
  aver: number;
};

export type LiveSessionStats = {
  live_time: number;
  add_fans: number;
  revenue: number;
  new_fans_club: number;
  danmu_num: number;
  max_online: number;
  watched_count: number;
};

export type LiveSessionSummary = {
  live_key: string;
  title: string;
  cover: string;
  start_time: number;
  end_time: number;
  duration: number;
  platform: string;
  room_id: number;
  stats?: LiveSessionStats | null;
};

export type LiveSessionPoint = {
  ts: number;
  value: number;
};

export type LiveSessionHighlight = {
  id: number;
  type: number;
  start_time: number;
  end_time: number;
  title: string;
};

export type LiveSessionDetail = {
  summary: LiveSessionSummary;
  session_data: LiveSessionPoint[];
  highlights: LiveSessionHighlight[];
  max_danmaku_ts?: number | null;
  max_pcu_ts?: number | null;
  max_value?: number | null;
};

export type LiveDashboardSnapshot = {
  current_uid: string;
  overview: LiveOverviewMetric[];
  sessions: LiveSessionSummary[];
  latest_session?: LiveSessionDetail | null;
  fetched_at: number;
};

export type LiveVoteCreateResp = {
  interaction_id: number;
};

export type LinkageStatus = {
  mode: "none" | "obs_ws" | "command";
  obs_ws: {
    connected: boolean;
    last_error: string;
    last_checked_at: number;
    url: string;
  };
  command: {
    start_configured: boolean;
    stop_configured: boolean;
    template_preview: string;
  };
};

export type QrPayload = {
  content: string;
  image_src: string;
};

export type AppLogEvent = {
  line: string;
  logs?: string[];
};

export type StudioStateEvent = {
  kind: string;
  source: string;
  at: number;
  data?: {
    session?: Session;
    danmu_running?: boolean;
    obs_ws_connected?: boolean;
    obs_ws_last_error?: string;
    obs_ws_last_checked_at?: number;
    action?: "start" | "stop";
    ok?: boolean;
    code?: number;
    session_consistent?: boolean;
    [key: string]: unknown;
  };
};
