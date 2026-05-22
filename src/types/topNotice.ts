export const TOP_NOTICE_DURATION_MS = 3_600;
export const TOP_NOTICE_ENTER_MS = 280;
export const TOP_NOTICE_EXIT_MS = 220;

export type TopNoticeTone = "success" | "error";

export type TopNoticeItem = {
  id: number;
  text: string;
  tone: TopNoticeTone;
};
