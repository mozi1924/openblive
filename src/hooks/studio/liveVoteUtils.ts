import type { LiveVoteInfo, LiveVotePanelData, LiveVoteTemplate } from "../../types/studio";

export const DEFAULT_LIVE_VOTE_DURATION = 1;

const toFiniteNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const normalizeLiveVoteInfo = (value: unknown): LiveVoteInfo | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const options = Array.isArray(raw.options)
    ? raw.options
        .map((option) => {
          if (!option || typeof option !== "object" || Array.isArray(option)) {
            return null;
          }
          const item = option as Record<string, unknown>;
          return {
            idx: toFiniteNumber(item.idx) ?? 0,
            desc: String(item.desc ?? item.content ?? ""),
            percent: toFiniteNumber(item.percent) ?? 0,
          };
        })
        .filter((option): option is LiveVoteInfo["options"][number] => Boolean(option))
    : [];

  const question = String(raw.question ?? "").trim();
  const interactionId = toFiniteNumber(raw.interaction_id) ?? 0;
  if (!question && interactionId <= 0 && options.length === 0) {
    return null;
  }

  const result = toFiniteNumber(raw.result);
  const leftDuration = toFiniteNumber(raw.left_duration);
  const templateId = toFiniteNumber(raw.template_id);

  return {
    status: toFiniteNumber(raw.status) ?? 0,
    question,
    options,
    duration: toFiniteNumber(raw.duration) ?? 0,
    result: result === undefined ? undefined : result,
    result_text: String(raw.result_text ?? ""),
    etime_str: String(raw.etime_str ?? ""),
    left_duration: leftDuration === undefined ? undefined : leftDuration,
    interaction_id: interactionId,
    template_id: templateId === undefined ? undefined : templateId,
  };
};

const normalizeLiveVoteTemplate = (value: unknown): LiveVoteTemplate | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const templateId = toFiniteNumber(raw.template_id) ?? 0;
  if (templateId <= 0) {
    return null;
  }

  return {
    template_id: templateId,
    question: String(raw.question ?? ""),
    option_a: String(raw.option_a ?? ""),
    option_b: String(raw.option_b ?? ""),
  };
};

export const normalizeLiveVotePanelData = (value: unknown): LiveVotePanelData => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      vote_info: null,
      templates: [],
    };
  }

  const raw = value as Record<string, unknown>;
  return {
    vote_info: normalizeLiveVoteInfo(raw.vote_info),
    templates: Array.isArray(raw.templates)
      ? raw.templates
          .map(normalizeLiveVoteTemplate)
          .filter((template): template is LiveVoteTemplate => Boolean(template))
      : [],
  };
};

export const normalizeLiveVoteHistory = (value: unknown): LiveVoteInfo[] => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const raw = value as Record<string, unknown>;
  return Array.isArray(raw.history)
    ? raw.history
        .map(normalizeLiveVoteInfo)
        .filter((item): item is LiveVoteInfo => Boolean(item))
    : [];
};

export const isLiveVoteActive = (voteInfo: LiveVoteInfo | null) =>
  voteInfo?.status === 1 || voteInfo?.status === 4;
