import { Terminal } from "lucide-react";
import type { LocaleSetting } from "../../utils/i18n";
import { t } from "../../utils/i18n";

type LogDrawerProps = {
  locale: LocaleSetting;
  logs: string[];
  onClearLogs: () => void;
  onClose: () => void;
};

export function LogDrawer({ locale, logs, onClearLogs, onClose }: LogDrawerProps) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-20 flex h-72 flex-col border-t border-[#1a2336] bg-[#090c13]/98 shadow-2xl">
      <div className="flex shrink-0 items-center justify-between border-b border-[#1b253b] bg-[#0c0f1a] px-6 py-3">
        <div className="flex items-center space-x-2 text-xs font-bold text-gray-400">
          <Terminal className="h-4 w-4 text-bili-blue" />
          <span>APP RUNTIME EVENT LOG</span>
        </div>
        <div className="no-drag flex space-x-4 text-xs">
          <button
            onClick={onClearLogs}
            className="text-gray-500 transition-colors hover:text-white"
          >
            {t(locale, "ui.log.clear")}
          </button>
          <button
            onClick={onClose}
            className="font-bold text-gray-500 transition-colors hover:text-rose-400"
          >
            {t(locale, "ui.log.close")}
          </button>
        </div>
      </div>

      <div className="selectable-text flex-1 space-y-1.5 overflow-y-auto bg-[#05070a]/90 p-6 font-mono text-xs text-[#b8c9e3]">
        {logs.length === 0 ? (
          <p className="py-10 text-center text-gray-600">{t(locale, "ui.log.empty")}</p>
        ) : (
          logs.map((line, index) => (
            <div
              key={`${line}-${index}`}
              className="truncate rounded px-2 py-0.5 leading-relaxed transition-colors hover:bg-white/5"
            >
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
