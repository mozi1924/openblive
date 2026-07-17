import zh from "./zh";
import en from "./en";
import ja from "./ja";

const messages: Record<string, any> = { zh, en, ja };
let currentLocale = "zh";

export function getLocale() {
  return currentLocale;
}

export function setLocale(locale: string) {
  if (messages[locale]) {
    currentLocale = locale;
  } else if (locale.startsWith("zh")) {
    currentLocale = "zh";
  } else if (locale.startsWith("ja")) {
    currentLocale = "ja";
  } else {
    currentLocale = "en";
  }
  window.localStorage.lang = currentLocale;
}

export function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((acc, part) => acc && acc[part], obj);
}

export function t(key: string, args?: Record<string, string | number>): string {
  const langObj = messages[currentLocale] || messages["zh"];
  let val = getNestedValue(langObj, key);
  if (val === undefined) {
    val = getNestedValue(messages["en"], key) || getNestedValue(messages["zh"], key) || key;
  }
  if (typeof val !== "string") {
    return String(val || key);
  }
  if (args) {
    let result = val;
    for (const [k, v] of Object.entries(args)) {
      result = result.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
    return result;
  }
  return val;
}

export function te(key: string): boolean {
  const langObj = messages[currentLocale] || messages["zh"];
  return getNestedValue(langObj, key) !== undefined;
}

function initLocale() {
  let locale = window.localStorage.lang;
  if (!locale) {
    const lang = navigator.language;
    if (lang.startsWith("zh")) {
      locale = "zh";
    } else if (lang.startsWith("ja")) {
      locale = "ja";
    } else {
      locale = "en";
    }
  }
  setLocale(locale);
}

initLocale();

export const i18n = {
  t,
  te,
  setLocale,
  getLocale,
};
