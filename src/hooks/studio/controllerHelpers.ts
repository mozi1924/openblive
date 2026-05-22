import type { LiveProfileState, User } from "../../types/studio";
import { resolveBackendMessage, t, type LocaleSetting } from "../../utils/i18n";

export const isValidUser = (value: User | null | undefined): value is User =>
  Boolean(value?.uid);

export const splitTagInput = (raw: string) =>
  raw
    .split(/[,\uFF0C]/)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);

export type StartLiveSource = "manual" | "tray" | "face_retry";
export type RecentArea = { parent: string; child: string };
export type StatusTone = "green" | "yellow" | "red";
export type SectionStatus = { tone: StatusTone; label: string; detail: string };

export const normalizeTags = (values: string[]) =>
  [...new Set(values.map((tag) => tag.trim()).filter(Boolean))];

export const tagsToKey = (values: string[]) =>
  normalizeTags(values).slice().sort((left, right) => left.localeCompare(right)).join(",");

export const unsavedLabelMap = {
  title: "ui.stream.section.title",
  area: "ui.stream.section.area",
  tags: "ui.stream.section.tags",
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
  locale: LocaleSetting,
  section: "title" | "area" | "tags",
  isDirty: boolean,
  profileState: LiveProfileState,
): SectionStatus => {
  const state = profileState[section];
  if (isDirty) {
    return { tone: "yellow", label: t(locale, "ui.profile.unsaved"), detail: t(locale, "ui.profile.unsaved.desc") };
  }
  if (state.transport === "failed") {
    return {
      tone: "red",
      label: t(locale, "ui.profile.failed"),
      detail: resolveBackendMessage(state.message, locale) || t(locale, "ui.profile.failed.desc"),
    };
  }
  if (state.review === "rejected") {
    return {
      tone: "red",
      label: t(locale, "ui.profile.rejected"),
      detail: resolveBackendMessage(state.message, locale) || t(locale, "ui.profile.rejected.desc"),
    };
  }
  if (state.transport === "conflict") {
    return {
      tone: "red",
      label: t(locale, "ui.profile.conflict"),
      detail:
        resolveBackendMessage(state.message, locale) || t(locale, "ui.profile.conflict.desc"),
    };
  }
  if (state.transport === "saving") {
    return { tone: "yellow", label: t(locale, "ui.profile.saving"), detail: t(locale, "ui.profile.saving.desc") };
  }
  if (state.review === "pending") {
    return {
      tone: "yellow",
      label: t(locale, "ui.profile.pending"),
      detail: resolveBackendMessage(state.message, locale) || t(locale, "ui.profile.pending.desc"),
    };
  }
  if (state.review === "unknown") {
    return {
      tone: "yellow",
      label: t(locale, "ui.profile.unknown"),
      detail: resolveBackendMessage(state.message, locale) || t(locale, "ui.profile.unknown.desc"),
    };
  }
  return { tone: "green", label: t(locale, "ui.profile.synced"), detail: t(locale, "ui.profile.synced.desc") };
};
