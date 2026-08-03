import type { Resp } from "../types/studio";
import { resolveBackendMessage, type LocaleSetting } from "./i18n";

export interface UnwrapOptions {
  localeSetting?: LocaleSetting;
  append?: (msg: string) => void;
  actionName?: string;
  bypassCodes?: number[];
}

/**
 * Unwraps an API response object (`Resp<T>`).
 * Returns `res.data` if `res.code === 0` or if `res.code` matches a bypass code.
 * Otherwise, formats the error message, optionally appends to log console, and throws an Error.
 */
export function unwrapResp<T>(res: Resp<T>, options?: UnwrapOptions): T {
  const { localeSetting = "zh-CN", append, actionName, bypassCodes = [] } = options || {};

  if (res.code === 0) {
    return res.data as T;
  }

  if (bypassCodes.includes(res.code)) {
    return res.data as T;
  }

  const errorMsg = resolveBackendMessage(res.msg || `Error code: ${res.code}`, localeSetting);
  if (append) {
    const prefix = actionName ? `${actionName}: ` : "";
    append(`${prefix}${errorMsg}`);
  }

  throw new Error(errorMsg);
}

/**
 * Type guard for checking if an API response is successful and contains data.
 */
export function isSuccessResp<T>(res: Resp<T>): res is Resp<T> & { code: 0; data: T } {
  return res.code === 0 && res.data !== undefined;
}
