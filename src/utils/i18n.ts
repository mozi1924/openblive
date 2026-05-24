import { backendEnUS, backendZhCN } from "./i18n/backend";
import { uiEnUS, uiZhCN } from "./i18n/ui";

export type LocaleSetting = "auto" | "zh-CN" | "en-US";
export type EffectiveLocale = "zh-CN" | "en-US";

const I18N_KEY_RE = /(i18n\.[a-z0-9_.-]+)/gi;

export function resolveLocale(locale: LocaleSetting): EffectiveLocale {
  if (locale === "zh-CN" || locale === "en-US") {
    return locale;
  }
  const nav = (globalThis.navigator?.language || "").toLowerCase();
  return nav.startsWith("en") ? "en-US" : "zh-CN";
}

function uiDict(locale: EffectiveLocale): Record<string, string> {
  return locale === "en-US" ? uiEnUS : uiZhCN;
}

function backendDict(locale: EffectiveLocale): Record<string, string> {
  return locale === "en-US" ? { ...backendZhCN, ...backendEnUS } : backendZhCN;
}

export function t(localeSetting: LocaleSetting, key: string): string {
  const locale = resolveLocale(localeSetting);
  return uiDict(locale)[key] || key;
}

export function tf(localeSetting: LocaleSetting, key: string, params: Record<string, string | number>): string {
  let text = t(localeSetting, key);
  Object.entries(params).forEach(([k, v]) => {
    text = text.split(`{${k}}`).join(String(v));
  });
  return text;
}

export const resolveBackendMessage = (
  raw: string,
  localeSetting: LocaleSetting = "auto",
): string => {
  const text = String(raw || "");
  const dict = backendDict(resolveLocale(localeSetting));
  return text.replace(I18N_KEY_RE, (fullMatch, key: string) => {
    const normalizedKey = key.toLowerCase();
    return dict[key] || dict[normalizedKey] || fullMatch;
  });
};
