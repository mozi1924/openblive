export type Resp<T> = {
  code: number;
  msg: string;
  data?: T;
  qr?: string;
};

export type ActiveTab = "account" | "stream" | "danmu" | "settings";

export type TransportStatus = "idle" | "saving" | "synced" | "conflict" | "failed";

export type ReviewStatus = "none" | "pending" | "approved" | "rejected" | "unknown";

export type AppConfig = {
  min_to_tray: boolean;
  live_control_mode: "none" | "obs_ws" | "command";
  obs_ws_enabled: boolean;
  obs_ws_url: string;
  obs_ws_password: string;
  obs_ws_auto_start_on_live: boolean;
  obs_ws_auto_stop_on_live_end: boolean;
  on_live_start_command: string;
  on_live_stop_command: string;
  locale: "auto" | "zh-CN" | "en-US";
  is_win32: boolean;
  has_tray: boolean;
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
  last_area_name: string[];
  last_tags?: string[];
  live_profile_state?: LiveProfileState;
  login_invalid?: boolean;
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

export type LiveProfileState = {
  title: TitleProfileState;
  area: AreaProfileState;
  tags: TagsProfileState;
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

export type StreamEndpoint = {
  protocol: string;
  addr: string;
  code: string;
  full_url: string;
  provider: string;
  new_link: string;
  stream_name: string;
  stream_key: string;
  schedule: string;
  pflag: string;
  query: Record<string, string>;
};

export type LiveRoomProfile = {
  title: string;
  parent: string;
  child: string;
  area_id?: number;
  tags: string[];
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

export type UpdateTagsResp = {
  tags: string[];
  added: string[];
  removed: string[];
  profile_state?: LiveProfileState;
};

export type DanmuMsg = {
  id: string;
  type: "danmu" | "gift" | "guard" | "system";
  time: string;
  sender: string;
  content: string;
};

export type AccountList = {
  list: User[];
  current_uid: string | null;
};

export type DanmuEventPayload = {
  cmd?: string;
  info?: unknown[];
  data?: Record<string, unknown>;
};

export type TrayActionPayload = {
  action?: "start_live" | "stop_live";
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
