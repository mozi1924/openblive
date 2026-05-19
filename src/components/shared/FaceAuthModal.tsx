import { RefreshCw, ShieldAlert } from "lucide-react";

type FaceAuthModalProps = {
  faceQr: string;
  faceQrContent: string;
  onClose: () => void;
  onRetry: () => Promise<void>;
};

export function FaceAuthModal({
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
          <h3 className="text-base font-bold text-white">开播前需要人脸验证</h3>
        </div>

        <p className="mb-6 text-xs leading-relaxed text-gray-400">
          由于哔哩哔哩的安全策略，开播前必须使用 <b>哔哩哔哩手机App</b>{" "}
          扫描下方二维码进行人脸识别验证。验证通过后一段时间内可直接免验证开播。
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
                二维码渲染失败，可复制下方内容到浏览器中打开，再使用 Bilibili App 扫码：
              </p>
              <div className="max-h-32 overflow-auto break-all rounded-lg border border-gray-200 bg-gray-100 p-2 text-[10px] text-gray-700">
                {faceQrContent}
              </div>
            </div>
          ) : (
            <div className="flex h-44 w-44 flex-col items-center justify-center text-center text-xs text-gray-500">
              <RefreshCw className="mb-2 h-6 w-6 animate-spin text-bili-pink" />
              未获取到人脸验证二维码
            </div>
          )}
        </div>

        <div className="flex w-full space-x-3">
          <button
            className="flex-1 rounded-xl border border-white/10 bg-white/5 py-3 text-xs font-semibold transition-all duration-150 active:scale-95 hover:border-white/20 hover:bg-white/10"
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="glow-pink flex-1 rounded-xl bg-gradient-to-r from-bili-pink to-[#ff8bb2] py-3 text-xs font-bold text-white transition-all duration-150 active:scale-95"
            onClick={() => void onRetry()}
          >
            我已验证，重试开播
          </button>
        </div>
      </div>
    </div>
  );
}
