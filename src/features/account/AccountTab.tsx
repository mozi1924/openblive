import { LogOut, QrCode, RefreshCw, ShieldAlert } from "lucide-react";
import type { User } from "../../types/studio";

type AccountTabProps = {
  accounts: User[];
  currentUser: User | null;
  qrcode: string;
  onLoadQrcode: () => Promise<void>;
  onLogout: (uid: string) => Promise<void>;
  onPollLogin: () => Promise<void>;
  onRefreshCurrentUser: () => Promise<void>;
  onSwitchAccount: (uid: string) => Promise<void>;
};

export function AccountTab({
  accounts,
  currentUser,
  qrcode,
  onLoadQrcode,
  onLogout,
  onPollLogin,
  onRefreshCurrentUser,
  onSwitchAccount,
}: AccountTabProps) {
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-7">
        <div className="glass-panel glow-blue rounded-3xl p-6">
          <h3 className="mb-5 text-xs font-bold tracking-wider text-gray-400 uppercase">
            当前登录账号
          </h3>

          {currentUser ? (
            <div className="space-y-6">
              <div className="flex items-center space-x-5">
                <img
                  src={currentUser.face}
                  alt={currentUser.uname}
                  className="h-16 w-16 rounded-2xl border-2 border-bili-blue/30 object-cover shadow-lg"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-2">
                    <h4 className="truncate text-lg font-bold text-white">
                      {currentUser.uname}
                    </h4>
                    <span className="rounded bg-bili-blue/20 px-2 py-0.5 text-[10px] font-bold text-bili-blue">
                      UL {currentUser.level}
                    </span>
                    {currentUser.login_invalid ? (
                      <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                        登录失效
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    UID: {currentUser.uid}
                  </p>
                </div>
                <button
                  onClick={() => void onRefreshCurrentUser()}
                  className="rounded-xl p-2 text-gray-400 transition-all duration-150 active:scale-95 hover:bg-white/10 hover:text-white"
                  title="刷新当前账号信息"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 rounded-2xl border border-white/5 bg-white/5 px-4 py-4 md:grid-cols-4">
                <StatBlock label="粉丝数" value={currentUser.follower} />
                <StatBlock label="关注数" value={currentUser.following ?? "-"} />
                <StatBlock
                  label="金瓜子"
                  value={
                    currentUser.money
                      ? currentUser.money.toLocaleString()
                      : "-"
                  }
                  className="text-amber-500"
                />
                <StatBlock
                  label="B币余额"
                  value={
                    currentUser.bcoin
                      ? currentUser.bcoin.toLocaleString()
                      : "-"
                  }
                  className="text-bili-pink"
                />
              </div>

              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => void onLogout(currentUser.uid)}
                  className="flex items-center rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-400 transition-all duration-150 active:scale-95 hover:bg-rose-500/20"
                >
                  <LogOut className="mr-1.5 h-3.5 w-3.5" />
                  退出当前账号
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-yellow-500/20 bg-yellow-500/10 text-yellow-500">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <h4 className="text-sm font-bold text-white">当前未登录账号</h4>
              <p className="mt-1 max-w-xs text-xs text-gray-500">
                使用右侧的二维码进行扫码登录以启用开播相关功能
              </p>
            </div>
          )}
        </div>

        <div className="glass-panel rounded-3xl p-6">
          <h3 className="mb-5 text-xs font-bold tracking-wider text-gray-400 uppercase">
            切换已登录账户
          </h3>
          {accounts.length <= 1 ? (
            <p className="py-4 text-center text-xs text-gray-500">
              暂无多余已保存的账号，您可以扫码添加更多账号
            </p>
          ) : (
            <div className="max-h-[320px] overflow-y-auto pr-1 space-y-3">
              {accounts
                .filter((user) => user.uid !== currentUser?.uid)
                .map((user) => (
                  <div
                    key={user.uid}
                    className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/5 p-4 transition-all duration-200 hover:border-bili-blue/20 hover:bg-white/10"
                  >
                    <div className="flex items-center space-x-4 min-w-0 flex-1">
                      <img
                        src={user.face}
                        alt={user.uname}
                        className="h-10 w-10 rounded-xl border border-white/10 object-cover shadow-md"
                      />
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate text-sm font-bold text-white">
                          {user.uname}
                        </h4>
                        <p className="mt-0.5 truncate text-[10px] text-gray-400">
                          UID: {user.uid}
                        </p>
                        {user.login_invalid ? (
                          <p className="mt-1 text-[10px] font-semibold text-rose-300">
                            登录失效，请重新扫码
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 ml-4 flex-shrink-0">
                      <button
                        onClick={() => void onSwitchAccount(user.uid)}
                        disabled={Boolean(user.login_invalid)}
                        className="rounded-xl bg-bili-blue/15 px-3.5 py-1.5 text-xs font-bold text-bili-blue transition-all duration-150 active:scale-95 hover:bg-bili-blue/25 hover:text-white"
                      >
                        {user.login_invalid ? "需重登" : "切换"}
                      </button>
                      <button
                        onClick={() => void onLogout(user.uid)}
                        className="rounded-xl p-2 text-gray-400 transition-all duration-150 active:scale-95 hover:bg-rose-500/10 hover:text-rose-400"
                        title="删除此账号"
                      >
                        <LogOut className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      <div className="lg:col-span-5 lg:sticky lg:top-8">
        <div className="glass-panel glow-pink flex flex-col items-center rounded-3xl p-6 transition-all duration-300 hover:shadow-2xl">
          <h3 className="mb-6 w-full text-xs font-bold tracking-wider text-gray-400 uppercase">
            扫码新增账号
          </h3>

          {qrcode ? (
            <div className="flex flex-col items-center space-y-6 w-full">
              <div className="group relative overflow-hidden rounded-3xl border-4 border-bili-pink/20 bg-white p-4 shadow-xl transition-all duration-300">
                <img
                  src={qrcode}
                  alt="login qrcode"
                  className="h-48 w-48 rounded-xl object-contain"
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <button
                    onClick={() => void onLoadQrcode()}
                    className="rounded-full bg-white/20 p-3 text-white backdrop-blur-md transition-all duration-150 active:scale-95 hover:bg-white/30"
                    title="刷新二维码"
                  >
                    <RefreshCw className="h-6 w-6" />
                  </button>
                  <span className="mt-2 text-[10px] font-bold text-gray-300">
                    点击刷新
                  </span>
                </div>
              </div>
              <div className="space-y-1 text-center">
                <p className="text-sm font-bold text-white">
                  使用哔哩哔哩APP扫码
                </p>
                <p className="text-xs text-gray-500">
                  二维码状态会自动检测，扫码并确认后将自动登录
                </p>
              </div>
              <div className="flex w-full space-x-2">
                <button
                  onClick={() => void onLoadQrcode()}
                  className="flex flex-1 items-center justify-center rounded-2xl border border-white/10 bg-white/5 py-3 text-xs font-semibold transition-all duration-150 active:scale-95 hover:border-white/20 hover:bg-white/10"
                >
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  刷新二维码
                </button>
                <button
                  onClick={() => void onPollLogin()}
                  className="glow-pink flex flex-1 items-center justify-center rounded-2xl bg-gradient-to-r from-bili-pink to-[#ff8bb2] py-3 text-xs font-bold text-white transition-all duration-150 active:scale-95 hover:opacity-95"
                >
                  <QrCode className="mr-2 h-3.5 w-3.5" />
                  立即检查
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center py-12 text-center w-full">
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-tr from-bili-pink/20 to-transparent">
                <QrCode className="h-10 w-10 text-bili-pink" />
              </div>
              <h4 className="mb-2 text-base font-bold text-white">
                获取快捷登录二维码
              </h4>
              <p className="mb-8 max-w-xs text-xs leading-relaxed text-gray-500">
                我们将通过B站官方API向您提供安全的授权登录二维码。登录后，您的
                Cookie 将以高级加密保存在系统 Keychain 中。
              </p>
              <button
                onClick={() => void onLoadQrcode()}
                className="glow-blue rounded-2xl bg-gradient-to-r from-bili-blue to-[#4fc3f7] px-8 py-3 text-xs font-bold text-white transition-all duration-200 active:scale-95 hover:opacity-95"
              >
                获取扫码登录二维码
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type StatBlockProps = {
  label: string;
  value: string | number;
  className?: string;
};

function StatBlock({ label, value, className }: StatBlockProps) {
  return (
    <div className="text-center md:text-left">
      <p className="text-[10px] font-medium text-gray-500 uppercase">{label}</p>
      <p className={`mt-0.5 text-base font-bold text-white ${className || ""}`}>
        {value}
      </p>
    </div>
  );
}
