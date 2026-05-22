import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { LocaleSetting } from "../../utils/i18n";
import { t } from "../../utils/i18n";

type ConfirmActionModalProps = {
  locale: LocaleSetting;
  title: string;
  description: string;
  confirmText?: string;
  showCancel?: boolean;
  tone?: "primary" | "danger";
  selectLabel?: string;
  selectOptions?: Array<{ value: string; label: string }>;
  selectValue?: string;
  onSelectValueChange?: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmActionModal({
  locale,
  title,
  description,
  confirmText,
  showCancel = true,
  tone = "primary",
  selectLabel,
  selectOptions,
  selectValue,
  onSelectValueChange,
  onCancel,
  onConfirm,
}: ConfirmActionModalProps) {
  const isDanger = tone === "danger";
  const showSelect =
    Boolean(selectLabel) &&
    Array.isArray(selectOptions) &&
    selectOptions.length > 0 &&
    typeof onSelectValueChange === "function";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
      <div className="glass-panel w-full max-w-md rounded-3xl border border-white/10 p-6 shadow-2xl">
        <div className={`mb-4 flex items-center space-x-3 ${isDanger ? "text-rose-400" : "text-bili-blue"}`}>
          {isDanger ? (
            <AlertTriangle className="h-6 w-6" />
          ) : (
            <CheckCircle2 className="h-6 w-6" />
          )}
          <h3 className="text-base font-bold text-white">{title}</h3>
        </div>

        <p className="mb-6 text-xs leading-relaxed text-gray-400">{description}</p>

        {showSelect ? (
          <label className="mb-6 block">
            <span className="mb-2 block text-[11px] font-semibold tracking-[0.04em] text-gray-300">
              {selectLabel}
            </span>
            <select
              value={selectValue || selectOptions[0].value}
              onChange={(event) => onSelectValueChange(event.target.value)}
              className="w-full rounded-xl border border-white/12 bg-[#0b1018] px-3 py-2 text-xs text-white outline-none transition-all focus:border-bili-blue/45"
            >
              {selectOptions.map((option) => (
                <option key={option.value} value={option.value} className="bg-[#0b1018] text-white">
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="flex w-full space-x-3">
          {showCancel && (
            <button
              className="flex-1 rounded-xl border border-white/10 bg-white/5 py-3 text-xs font-semibold transition-all duration-150 active:scale-95 hover:border-white/20 hover:bg-white/10"
              onClick={onCancel}
            >
              {t(locale, "ui.confirm.cancel")}
            </button>
          )}
          <button
            className={`rounded-xl py-3 text-xs font-bold text-white transition-all duration-150 active:scale-95 ${
              showCancel ? "flex-1" : "w-full"
            } ${
              isDanger
                ? "bg-gradient-to-r from-rose-500 to-rose-400"
                : "bg-gradient-to-r from-bili-blue to-[#39c4f3]"
            }`}
            onClick={onConfirm}
          >
            {confirmText || t(locale, "ui.confirm.ok")}
          </button>
        </div>
      </div>
    </div>
  );
}
