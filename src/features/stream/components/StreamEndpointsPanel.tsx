import { Check, Copy, Server, Key } from "lucide-react";
import type { StreamInfo, StreamEndpoint } from "../../../types/studio";
import type { LocaleSetting } from "../../../utils/i18n";
import { t } from "../../../utils/i18n";

type StreamEndpointsPanelProps = {
  locale: LocaleSetting;
  rtmp: StreamInfo | null;
  copiedKey: string | null;
  onCopyToClipboard: (text: string, type: string) => Promise<void>;
};

export function StreamEndpointsPanel({
  locale,
  rtmp,
  copiedKey,
  onCopyToClipboard,
}: StreamEndpointsPanelProps) {
  if (!rtmp) {
    return null;
  }

  const streamEndpoints = buildStreamEndpoints(rtmp);
  const primaryEndpoint = streamEndpoints[0];

  return (
    <div className="mt-3 w-full max-w-sm rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] p-2.5 text-left">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[9px] font-extrabold tracking-widest text-emerald-400 uppercase">
          RTMP
        </span>
        <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">
          {t(locale, "ui.stream.ready")}
        </span>
      </div>
      <div className="space-y-2">
        <div>
          <span className="text-[9px] font-bold uppercase tracking-wide text-gray-500">
            {t(locale, "ui.stream.addr")}
          </span>
          <div className="relative mt-1">
            <div className="flex h-8 items-center rounded-md border border-white/8 bg-[#05090a] px-2 pr-12 font-mono text-[10px] text-gray-300">
              <Server className="mr-1.5 h-3 w-3 shrink-0 text-gray-500" />
              <span className="truncate">
                {truncateStreamValue(primaryEndpoint?.addr || "") || t(locale, "ui.stream.unavailable")}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void onCopyToClipboard(primaryEndpoint?.addr || "", "server")}
              disabled={!primaryEndpoint?.addr}
              title={t(locale, "ui.stream.copy")}
              className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded border border-white/8 bg-white/6 text-gray-300 transition-all hover:bg-white/12 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              {copiedKey === "server" ? (
                <Check className="h-3 w-3 text-emerald-400" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
          </div>
        </div>
        <div>
          <span className="text-[9px] font-bold uppercase tracking-wide text-gray-500">
            {t(locale, "ui.stream.key")}
          </span>
          <div className="relative mt-1">
            <div className="flex h-8 items-center rounded-md border border-white/8 bg-[#05090a] px-2 pr-12 font-mono text-[10px] text-gray-300">
              <Key className="mr-1.5 h-3 w-3 shrink-0 text-gray-500" />
              <span className="truncate">
                {maskStreamCode(primaryEndpoint?.code || "") || t(locale, "ui.stream.unavailable")}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void onCopyToClipboard(primaryEndpoint?.code || "", "key")}
              disabled={!primaryEndpoint?.code}
              title={t(locale, "ui.stream.copy")}
              className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded border border-white/8 bg-white/6 text-gray-300 transition-all hover:bg-white/12 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              {copiedKey === "key" ? (
                <Check className="h-3 w-3 text-emerald-400" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function buildStreamEndpoints(rtmp: StreamInfo | null): StreamEndpoint[] {
  if (!rtmp) {
    return [];
  }
  if (rtmp.endpoints && rtmp.endpoints.length > 0) {
    return rtmp.endpoints;
  }

  if (rtmp.rtmp1?.addr || rtmp.rtmp1?.code) {
    return [
      {
        protocol: "rtmp",
        addr: rtmp.rtmp1?.addr || "",
        code: rtmp.rtmp1?.code || "",
        full_url: `${rtmp.rtmp1?.addr || ""}${rtmp.rtmp1?.code || ""}`,
      },
    ];
  }

  return [];
}

function truncateStreamValue(value: string): string {
  if (!value) {
    return "";
  }
  if (value.length <= 28) {
    return value;
  }
  return `${value.slice(0, 16)}...${value.slice(-9)}`;
}

function maskStreamCode(code: string): string {
  if (!code) {
    return "";
  }
  return "•".repeat(Math.max(8, Math.min(14, code.length)));
}
