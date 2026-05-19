import type { LiveProfileState, User } from "../../types/studio";
import { resolveBackendMessage } from "../../utils/i18n";

export const isValidUser = (value: User | null | undefined): value is User =>
  Boolean(value?.uid);

export const splitTagInput = (raw: string) =>
  raw
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);

export type StartLiveSource = "manual" | "tray" | "face_retry";
export type RecentArea = { parent: string; child: string };
export type StatusTone = "green" | "yellow" | "red";
export type SectionStatus = { tone: StatusTone; label: string; detail: string };

const RECENT_AREAS_LIMIT = 6;

export const normalizeTags = (values: string[]) =>
  [...new Set(values.map((tag) => tag.trim()).filter(Boolean))];

export const tagsToKey = (values: string[]) => normalizeTags(values).join(",");

const recentAreasStorageKey = (uid: string) => `openblive.recent_areas.${uid}`;

export const unsavedLabelMap = {
  title: "标题",
  area: "分区",
  tags: "标签",
} as const;

export const defaultProfileState = (): LiveProfileState => ({
  title: {
    submitted: "",
    effective: "",
    transport: "idle",
    review: "none",
    message: "",
    updated_at: 0,
  },
  area: {
    submitted_parent: "",
    submitted_child: "",
    submitted_area_id: undefined,
    effective_parent: "",
    effective_child: "",
    effective_area_id: undefined,
    transport: "idle",
    review: "none",
    message: "",
    updated_at: 0,
  },
  tags: {
    submitted: [],
    effective: [],
    transport: "idle",
    review: "none",
    message: "",
    updated_at: 0,
  },
});

export const normalizeProfileState = (
  state: LiveProfileState | null | undefined,
): LiveProfileState => {
  const fallback = defaultProfileState();
  if (!state) {
    return fallback;
  }
  return {
    title: {
      ...fallback.title,
      ...state.title,
    },
    area: {
      ...fallback.area,
      ...state.area,
    },
    tags: {
      ...fallback.tags,
      ...state.tags,
      submitted: normalizeTags(state.tags?.submitted || []),
      effective: normalizeTags(state.tags?.effective || []),
    },
  };
};

export const buildSectionStatus = (
  section: "title" | "area" | "tags",
  isDirty: boolean,
  profileState: LiveProfileState,
): SectionStatus => {
  const state = profileState[section];
  if (isDirty) {
    return { tone: "yellow", label: "未保存", detail: "当前修改尚未提交" };
  }
  if (state.transport === "failed") {
    return {
      tone: "red",
      label: "提交失败",
      detail: resolveBackendMessage(state.message) || "请稍后重试保存",
    };
  }
  if (state.review === "rejected") {
    return {
      tone: "red",
      label: "审核未通过",
      detail: resolveBackendMessage(state.message) || "请修改后重新提交",
    };
  }
  if (state.transport === "conflict") {
    return {
      tone: "red",
      label: "远端已回退",
      detail:
        resolveBackendMessage(state.message) || "远端当前值已不同于最近一次提交",
    };
  }
  if (state.transport === "saving") {
    return { tone: "yellow", label: "保存中", detail: "正在提交到 B 站" };
  }
  if (state.review === "pending") {
    return {
      tone: "yellow",
      label: "审核中",
      detail: resolveBackendMessage(state.message) || "已提交，等待平台审核",
    };
  }
  if (state.review === "unknown") {
    return {
      tone: "yellow",
      label: "待确认",
      detail: resolveBackendMessage(state.message) || "已提交，等待远端状态确认",
    };
  }
  return { tone: "green", label: "已同步", detail: "最近一次提交已生效" };
};

export const loadRecentAreasFromStorage = (uid: string | null): RecentArea[] => {
  if (!uid) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(recentAreasStorageKey(uid));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(
        (item): item is RecentArea =>
          item &&
          typeof item === "object" &&
          typeof item.parent === "string" &&
          typeof item.child === "string" &&
          item.parent.length > 0 &&
          item.child.length > 0,
      )
      .slice(0, RECENT_AREAS_LIMIT);
  } catch {
    return [];
  }
};

export const pushRecentAreaToStorage = (
  uid: string | null,
  area: RecentArea,
): RecentArea[] => {
  if (!uid || !area.parent || !area.child) {
    return [];
  }

  const key = recentAreasStorageKey(uid);
  const current = (() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) {
        return [] as RecentArea[];
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [] as RecentArea[];
    }
  })();

  const deduped = current.filter(
    (item) =>
      !(
        item &&
        typeof item.parent === "string" &&
        typeof item.child === "string" &&
        item.parent === area.parent &&
        item.child === area.child
      ),
  );

  const next = [area, ...deduped].slice(0, RECENT_AREAS_LIMIT);
  window.localStorage.setItem(key, JSON.stringify(next));
  return next;
};
