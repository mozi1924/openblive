import type { DanmuAvatarResolvedEvent, DanmuMsg } from "../../types/studio";
import { tf, type LocaleSetting } from "../../utils/i18n";
import { upsertIncomingDanmuMessage } from "../../utils/danmu";

const normalizeEventToken = (value: unknown): string => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  if (typeof value === "string") {
    return value.trim();
  }
  return "";
};

const matchesRecallTarget = (message: DanmuMsg, targetToken: string) => {
  if (!targetToken || message.type !== "danmu") {
    return false;
  }
  const candidates = [
    message.id,
    message.danmu_msg_id,
    message.danmu_id_str,
    typeof message.danmu_rnd === "number" ? String(Math.trunc(message.danmu_rnd)) : "",
    typeof message.danmu_legacy_id === "number" ? String(Math.trunc(message.danmu_legacy_id)) : "",
  ].flatMap((candidate) => (candidate ? [candidate] : []));
  return candidates.some((candidate) => candidate === targetToken || candidate.includes(targetToken));
};

export const applyIncomingRealtimeMessage = (
  prev: DanmuMsg[],
  incoming: DanmuMsg,
  locale: LocaleSetting,
): DanmuMsg[] => {
  if (incoming.cmd === "SUPER_CHAT_MESSAGE_DELETE") {
    const deletedIds = (incoming.deleted_ids || [])
      .map((value) => normalizeEventToken(value))
      .filter(Boolean);
    if (deletedIds.length === 0) {
      return [incoming, ...prev];
    }

    const deletedSet = new Set(deletedIds);
    const filtered = prev.filter((message) => {
      if (message.type !== "superchat") {
        return true;
      }
      const superchatId = normalizeEventToken(message.superchat_id);
      return !superchatId || !deletedSet.has(superchatId);
    });

    const removedCount = prev.length - filtered.length;
    if (removedCount === 0) {
      const existingSuperChatIds = prev
        .filter((message) => message.type === "superchat")
        .slice(0, 30)
        .map((message) => normalizeEventToken(message.superchat_id))
        .filter(Boolean);
      console.warn("[danmu] super chat delete target not matched", {
        cmd: incoming.cmd,
        deletedIds,
        existingSuperChatIds,
      });
    }

    const notice =
      removedCount > 0
        ? { ...incoming, content: tf(locale, "ui.ctrl.danmu_sc_delete", { count: removedCount }) }
        : incoming;
    return [notice, ...filtered];
  }

  if (incoming.type === "recall") {
    const targetToken = normalizeEventToken(incoming.recall_target_id);
    if (!targetToken) {
      return [incoming, ...prev];
    }

    let removedCount = 0;
    const filtered = prev.filter((message) => {
      const matched = matchesRecallTarget(message, targetToken);
      if (matched) {
        removedCount += 1;
      }
      return !matched;
    });

    if (removedCount === 0) {
      const recallCandidates = prev
        .filter((message) => message.type === "danmu")
        .slice(0, 40)
        .map((message) => ({
          id: message.id,
          msg_id: message.danmu_msg_id || "",
          id_str: message.danmu_id_str || "",
          rnd:
            typeof message.danmu_rnd === "number" ? String(Math.trunc(message.danmu_rnd)) : "",
          legacy_id:
            typeof message.danmu_legacy_id === "number"
              ? String(Math.trunc(message.danmu_legacy_id))
              : "",
          content: message.content.slice(0, 36),
        }));
      console.warn("[danmu] recall target not matched", {
        cmd: incoming.cmd,
        targetToken,
        recallCandidates,
      });
    }

    const notice =
      removedCount > 0
        ? { ...incoming, content: tf(locale, "ui.ctrl.danmu_recall_removed", { count: removedCount }) }
        : incoming;
    return [notice, ...filtered];
  }

  return upsertIncomingDanmuMessage(prev, incoming);
};

export const applyResolvedDanmuAvatar = (
  prev: DanmuMsg[],
  incoming: DanmuAvatarResolvedEvent,
): DanmuMsg[] => {
  const uid = Number.parseInt(incoming.uid, 10);
  const senderFace = incoming.sender_face.trim();
  if (!Number.isFinite(uid) || !senderFace) {
    return prev;
  }

  let changed = false;
  const next = prev.map((message) => {
    if (message.sender_uid !== uid || message.sender_face === senderFace) {
      return message;
    }
    changed = true;
    return {
      ...message,
      sender_face: senderFace,
    };
  });

  return changed ? next : prev;
};
