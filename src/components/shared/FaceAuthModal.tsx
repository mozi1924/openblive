import { RefreshCw, ShieldAlert } from "lucide-react";
import type { LocaleSetting } from "../../utils/i18n";
import { t } from "../../utils/i18n";

type FaceAuthModalProps = {
  locale: LocaleSetting;
  faceQr: string;
  faceQrContent: string;
  onClose: () => void;
  onRetry: () => Promise<void>;
};

export function FaceAuthModal({
  locale,
  faceQr,
  faceQrContent,
  onClose,
  onRetry,
}: FaceAuthModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
      <div className="glass-panel glow-pink w-full max-w-md rounded-3xl border border-white/10 p-6 shadow-2xl">
        <div className="mb-4 flex items-center space-x-3 text-bili-pink">
          <ShieldAlert className="h-6 w-6 animate-bounce" />
          <h3 className="text-base font-bold text-white">{t(locale, "ui.face.title")}</h3>
        </div>

        <p className="mb-6 text-xs leading-relaxed text-gray-400">
          {t(locale, "ui.face.desc")}
        </p>

        <div className="mb-6 flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white p-4 shadow-inner">
          {faceQr ? (
            <img
              className="h-44 w-44 object-contain"
              src={faceQr}
              alt="face verify qr"
            />
          ) : faceQrContent ? (
            <div className="w-full space-y-2">
              <p className="text-xs leading-relaxed text-gray-500">
                {t(locale, "ui.face.qr_render_failed")}
              </p>
              <div className="max-h-32 overflow-auto break-all rounded-lg border border-gray-200 bg-gray-100 p-2 text-[10px] text-gray-700 app-scrollbar">
                {faceQrContent}
              </div>
            </div>
          ) : (
            <div className="flex h-44 w-44 flex-col items-center justify-center text-center text-xs text-gray-500">
              <RefreshCw className="mb-2 h-6 w-6 animate-spin text-bili-pink" />
              {t(locale, "ui.face.qr_missing")}
            </div>
          )}
        </div>

        <div className="flex w-full space-x-3">
          <button
            className="flex-1 rounded-xl border border-white/10 bg-white/5 py-3 text-xs font-semibold transition-all duration-150 active:scale-95 hover:border-white/20 hover:bg-white/10"
            onClick={onClose}
          >
            {t(locale, "ui.face.cancel")}
          </button>
          <button
            className="glow-pink flex-1 rounded-xl bg-gradient-to-r from-bili-pink to-[#ff8bb2] py-3 text-xs font-bold text-white transition-all duration-150 active:scale-95"
            onClick={() => void onRetry()}
          >
            {t(locale, "ui.face.retry")}
          </button>
        </div>
      </div>
    </div>
  );
}
