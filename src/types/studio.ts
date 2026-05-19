export type Resp<T> = {
  code: number;
  msg: string;
  data?: T;
  qr?: string;
};

export type ActiveTab = "account" | "stream" | "danmu";

export type Session = {
  uid: number;
  room_id: string;
  csrf: string;
  is_live: boolean;
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
  login_invalid?: boolean;
};

export type StreamInfo = {
  rtmp1?: {
    addr?: string;
    code?: string;
  };
  protocols?: unknown[];
};

export type LiveRoomProfile = {
  title: string;
  parent: string;
  child: string;
  area_id?: number;
  tags: string[];
  from_cache: boolean;
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
