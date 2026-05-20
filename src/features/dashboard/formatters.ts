import { resolveLocale, type LocaleSetting } from "../../utils/i18n";

function localeName(locale: LocaleSetting): string {
  return resolveLocale(locale) === "en-US" ? "en-US" : "zh-CN";
}

export function formatNumber(value: number, locale: LocaleSetting): string {
  return new Intl.NumberFormat(localeName(locale), {
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

export function formatCurrency(value: number, locale: LocaleSetting): string {
  return new Intl.NumberFormat(localeName(locale), {
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDuration(seconds: number, locale: LocaleSetting): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainSeconds = total % 60;

  if (resolveLocale(locale) === "en-US") {
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${remainSeconds}s`;
    }
    return `${remainSeconds}s`;
  }

  if (hours > 0) {
    return `${hours}小时 ${minutes}分钟`;
  }
  if (minutes > 0) {
    return `${minutes}分钟 ${remainSeconds}秒`;
  }
  return `${remainSeconds}秒`;
}

export function formatDateTime(timestamp: number, locale: LocaleSetting): string {
  return new Intl.DateTimeFormat(localeName(locale), {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

export function formatDate(timestamp: number, locale: LocaleSetting): string {
  return new Intl.DateTimeFormat(localeName(locale), {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp * 1000));
}
