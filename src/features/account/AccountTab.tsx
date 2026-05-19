import { LogOut, QrCode, RefreshCw, ShieldAlert, Users, Heart, Coins, Sparkles, UserPlus, Trash2 } from "lucide-react";
import type { User } from "../../types/studio";
import type { LocaleSetting } from "../../utils/i18n";
import { t, tf } from "../../utils/i18n";

type AccountTabProps = {
  locale: LocaleSetting;
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
  locale,
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
      {/* Left Column: Account Info & Switcher */}
      <div className="space-y-6 lg:col-span-7">
        
        {/* Current Active Account */}
        <div className="glass-panel glow-blue overflow-hidden rounded-3xl border border-white/5 bg-gradient-to-br from-[#111927] via-[#0d111a] to-[#151c2c] p-6 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[10px] font-extrabold tracking-widest text-bili-blue uppercase">
              CURRENT SESSION
            </span>
            <span className="rounded-full bg-bili-blue/10 px-2.5 py-0.5 text-[10px] font-bold text-bili-blue border border-bili-blue/20">
              {t(locale, "ui.account.current_badge")}
            </span>
          </div>

          {currentUser ? (
            <div className="space-y-6">
              <div className="flex items-center space-x-5">
                <div className="relative">
                  <img
                    src={currentUser.face}
                    alt={currentUser.uname}
                    className="h-16 w-16 rounded-2xl border-2 border-bili-blue/30 object-cover shadow-md transition-transform duration-300 hover:scale-105"
                  />
                  <div className="absolute -bottom-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-lg bg-gradient-to-r from-bili-blue to-teal-400 text-[8px] font-black text-white shadow-sm border border-[#0d111a]">
                    LV{currentUser.level}
                  </div>
                </div>
                
                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                    <h4 className="text-lg font-bold text-white tracking-wide">
                      {currentUser.uname}
                    </h4>
                    {currentUser.login_invalid ? (
                      <span className="rounded-lg bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 text-[9px] font-bold text-rose-300 animate-pulse">
                        {t(locale, "ui.account.login_invalid")}
                      </span>
                    ) : (
                      <span className="rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[9px] font-bold text-emerald-300">
                        {t(locale, "ui.account.online")}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-500 font-mono">
                    UID: {currentUser.uid}
                  </p>
                </div>
                
                <button
                  onClick={() => void onRefreshCurrentUser()}
                  className="rounded-xl border border-white/5 bg-white/5 p-2.5 text-gray-400 transition-all duration-150 active:scale-95 hover:bg-white/10 hover:text-white"
                  title={t(locale, "ui.account.refresh_user")}
                >
                  <RefreshCw className="h-4.5 w-4.5" />
                </button>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard
                  icon={<Users className="h-4 w-4 text-bili-blue" />}
                  label={t(locale, "ui.account.stat.follower")}
                  value={currentUser.follower}
                />
                <StatCard
                  icon={<Heart className="h-4 w-4 text-rose-400" />}
                  label={t(locale, "ui.account.stat.following")}
                  value={currentUser.following ?? "-"}
                />
                <StatCard
                  icon={<Coins className="h-4 w-4 text-amber-500" />}
                  label={t(locale, "ui.account.stat.money")}
                  value={currentUser.money ? currentUser.money.toLocaleString() : "-"}
                  className="text-amber-500"
                />
                <StatCard
                  icon={<Sparkles className="h-4 w-4 text-bili-pink" />}
                  label={t(locale, "ui.account.stat.bcoin")}
                  value={currentUser.bcoin ? currentUser.bcoin.toLocaleString() : "-"}
                  className="text-bili-pink"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => void onLogout(currentUser.uid)}
                  className="flex items-center rounded-xl border border-rose-500/20 bg-rose-500/10 px-4.5 py-2.5 text-xs font-semibold text-rose-400 transition-all duration-150 active:scale-95 hover:bg-rose-500/20 hover:text-rose-300"
                >
                  <LogOut className="mr-1.5 h-3.5 w-3.5" />
                  {t(locale, "ui.account.logout_current")}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-yellow-500/10 bg-yellow-500/5 text-yellow-500">
                <ShieldAlert className="h-7 w-7 animate-pulse" />
              </div>
              <h4 className="text-sm font-bold text-white">{t(locale, "ui.account.empty_current.title")}</h4>
              <p className="mt-2 max-w-xs text-xs text-gray-500 leading-relaxed">
                {t(locale, "ui.account.empty_current.desc")}
              </p>
            </div>
          )}
        </div>

        {/* Account Switcher */}
        <div className="glass-panel rounded-3xl p-6">
          <div className="mb-5 flex items-center justify-between">
            <span className="text-[10px] font-extrabold tracking-widest text-gray-400 uppercase">
              SAVED ACCOUNTS
            </span>
            <span className="text-[10px] font-bold text-gray-500">
              {tf(locale, "ui.account.saved_count", { count: accounts.length })}
            </span>
          </div>

          {accounts.length <= 1 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center border-2 border-dashed border-white/5 rounded-2xl bg-white/2">
              <p className="text-xs text-gray-500">
                {t(locale, "ui.account.saved_empty")}
              </p>
            </div>
          ) : (
            <div className="max-h-[320px] overflow-y-auto pr-1 space-y-3">
              {accounts
                .filter((user) => user.uid !== currentUser?.uid)
                .map((user) => (
                  <div
                    key={user.uid}
                    className="group flex items-center justify-between rounded-2xl border border-white/5 bg-white/2.5 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-bili-blue/20 hover:bg-white/5 hover:shadow-md"
                  >
                    <div className="flex items-center space-x-4 min-w-0 flex-1">
                      <div className="relative">
                        <img
                          src={user.face}
                          alt={user.uname}
                          className="h-10 w-10 rounded-xl border border-white/10 object-cover shadow-sm"
                        />
                        <span className="absolute -bottom-1 -right-1 rounded-md bg-[#131b26] px-1 text-[7px] font-bold text-bili-blue border border-white/5">
                          L{user.level}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate text-sm font-bold text-white transition-colors group-hover:text-bili-blue">
                          {user.uname}
                        </h4>
                        <p className="mt-0.5 truncate text-[10px] text-gray-500 font-mono">
                          UID: {user.uid}
                        </p>
                        {user.login_invalid ? (
                          <p className="mt-1 text-[9px] font-semibold text-rose-400 animate-pulse">
                            {t(locale, "ui.account.invalid_hint")}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 ml-4 flex-shrink-0">
                      <button
                        onClick={() => void onSwitchAccount(user.uid)}
                        disabled={Boolean(user.login_invalid)}
                        className={`rounded-xl px-4 py-2 text-xs font-bold transition-all duration-150 active:scale-95 ${
                          user.login_invalid
                            ? "bg-rose-500/10 text-rose-400 cursor-not-allowed"
                            : "bg-bili-blue/10 text-bili-blue border border-bili-blue/20 hover:bg-bili-blue hover:text-white"
                        }`}
                      >
                        {user.login_invalid ? t(locale, "ui.account.switch.invalid") : t(locale, "ui.account.switch")}
                      </button>
                      <button
                        onClick={() => void onLogout(user.uid)}
                        className="rounded-xl border border-transparent p-2 text-gray-500 transition-all duration-150 hover:border-rose-500/15 hover:bg-rose-500/10 hover:text-rose-400"
                        title={t(locale, "ui.account.delete")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Column: QR Code scanner */}
      <div className="lg:col-span-5 lg:sticky lg:top-8">
        <div className="glass-panel glow-pink flex flex-col items-center rounded-3xl p-6 transition-all duration-300 hover:shadow-2xl">
          <div className="mb-6 flex w-full items-center justify-between">
            <span className="text-[10px] font-extrabold tracking-widest text-bili-pink uppercase">
              ADD ACCOUNT
            </span>
            <span className="rounded-full bg-bili-pink/10 px-2 py-0.5 text-[10px] font-bold text-bili-pink border border-bili-pink/20">
              {t(locale, "ui.account.add.badge")}
            </span>
          </div>

          {qrcode ? (
            <div className="flex flex-col items-center space-y-6 w-full">
              {/* QR Container with Cyber Scanline */}
              <div className="group relative overflow-hidden rounded-3xl border-4 border-bili-pink/25 bg-white p-4 shadow-xl transition-all duration-300">
                <img
                  src={qrcode}
                  alt="login qrcode"
                  className="h-48 w-48 rounded-xl object-contain"
                />
                
                {/* Laser Scanline */}
                <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-bili-pink to-transparent shadow-[0_0_8px_var(--color-bili-pink)] pointer-events-none opacity-80"
                     style={{
                       animation: "scanline 2s linear infinite"
                     }}
                />

                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 opacity-0 transition-opacity duration-200 group-hover:opacity-100 backdrop-blur-sm">
                  <button
                    onClick={() => void onLoadQrcode()}
                    className="rounded-full bg-white/20 p-3 text-white backdrop-blur-md transition-all duration-150 active:scale-95 hover:bg-white/30"
                    title={t(locale, "ui.account.qr.refresh")}
                  >
                    <RefreshCw className="h-6 w-6" />
                  </button>
                  <span className="mt-2 text-[10px] font-bold text-gray-300">
                    {t(locale, "ui.account.qr.click_refresh")}
                  </span>
                </div>
              </div>
              
              <style>{`
                @keyframes scanline {
                  0% { top: 0%; }
                  50% { top: 100%; }
                  100% { top: 0%; }
                }
              `}</style>

              <div className="space-y-1.5 text-center">
                <p className="text-sm font-bold text-white">
                  {t(locale, "ui.account.qr.scan_title")}
                </p>
                <p className="text-[11px] leading-relaxed text-gray-500 max-w-xs mx-auto">
                  {t(locale, "ui.account.qr.scan_desc")}
                </p>
              </div>

              <div className="flex w-full space-x-2">
                <button
                  onClick={() => void onLoadQrcode()}
                  className="flex flex-1 items-center justify-center rounded-2xl border border-white/8 bg-white/5 py-3 text-xs font-semibold text-gray-300 transition-all duration-150 active:scale-95 hover:border-white/15 hover:bg-white/10 hover:text-white"
                >
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  {t(locale, "ui.account.qr.refresh_btn")}
                </button>
                <button
                  onClick={() => void onPollLogin()}
                  className="btn-secondary flex flex-1 items-center justify-center rounded-2xl py-3 text-xs font-bold text-white active:scale-95"
                >
                  <QrCode className="mr-2 h-3.5 w-3.5" />
                  {t(locale, "ui.account.qr.poll_btn")}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center py-10 text-center w-full">
              {/* Dotted Scan Area */}
              <div className="mb-6 flex h-40 w-40 items-center justify-center rounded-3xl border-2 border-dashed border-bili-pink/20 bg-white/[0.02] transition-colors hover:border-bili-pink/40">
                <div className="animate-float flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-tr from-bili-pink/15 to-transparent">
                  <UserPlus className="h-9 w-9 text-bili-pink" />
                </div>
              </div>
              
              <h4 className="mb-2.5 text-base font-bold text-white">
                {t(locale, "ui.account.qr.get_title")}
              </h4>
              <p className="mb-8 max-w-xs text-xs leading-relaxed text-gray-500">
                {t(locale, "ui.account.qr.get_desc")}
              </p>
              
              <button
                onClick={() => void onLoadQrcode()}
                className="btn-primary flex items-center justify-center rounded-2xl px-8 py-3.5 text-xs font-bold text-white active:scale-95"
              >
                <QrCode className="mr-2 h-4 w-4" />
                {t(locale, "ui.account.qr.get_btn")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type StatCardProps = {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  className?: string;
};

function StatCard({ icon, label, value, className }: StatCardProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-white/5 bg-white/2 px-3 py-3 text-center transition-all duration-200 hover:border-white/8 hover:bg-white/4">
      <div className="mb-1">{icon}</div>
      <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`mt-0.5 text-sm font-bold text-white truncate w-full ${className || ""}`}>
        {value}
      </p>
    </div>
  );
}
