import { BookOpen, HeartHandshake, Layers3, Wrench, Link as LinkIcon } from "lucide-react";
import type { LocaleSetting } from "../../utils/i18n";
import { t } from "../../utils/i18n";

type ProjectTabProps = {
  locale: LocaleSetting;
};

const techStacks = [
  {
    name: "Tauri v2 (Rust)",
    descKey: "ui.project.stack.tauri",
    icon: Layers3,
  },
  {
    name: "React 19 + Vite 7",
    descKey: "ui.project.stack.react",
    icon: BookOpen,
  },
  {
    name: "TypeScript + Tailwind CSS",
    descKey: "ui.project.stack.ts",
    icon: Wrench,
  },
] as const;

const acknowledgements = [
  { name: "bilibili-api-collect", url: "https://github.com/socialsisteryi/bilibili-api-collect" },
  { name: "ChaceQC/bilibili_live_stream_code", url: "https://github.com/ChaceQC/bilibili_live_stream_code" },
  { name: "TNXG/bilibili_live_stream", url: "https://github.com/TNXG/bilibili_live_stream" },
  { name: "Radekyspec/StartLive", url: "https://github.com/Radekyspec/StartLive" },
  { name: "xfgryujk/blivechat", url: "https://github.com/xfgryujk/blivechat" },
] as const;

export function ProjectTab({ locale }: ProjectTabProps) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 pb-6">
      <section className="flat-panel rounded-2xl border border-white/5 p-6">
        <div className="mb-3 flex items-center gap-2 text-bili-blue">
          <BookOpen className="h-4 w-4" />
          <span className="text-[10px] font-extrabold tracking-widest text-gray-400 uppercase">
            {t(locale, "ui.project.about.badge")}
          </span>
        </div>
        <h3 className="text-base font-bold text-white">OpenBLive Studio</h3>
        <p className="mt-2 text-xs leading-6 text-gray-300">{t(locale, "ui.project.about.desc")}</p>
      </section>

      <section className="flat-panel rounded-2xl border border-white/5 p-6">
        <div className="mb-4 flex items-center gap-2 text-cyan-300">
          <LinkIcon className="h-4 w-4" />
          <span className="text-[10px] font-extrabold tracking-widest text-gray-400 uppercase">
            {t(locale, "ui.project.links.badge")}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <a
            href="https://github.com/mozi1924/openblive"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-white/8 bg-white/2 px-4 py-3 transition-colors hover:border-bili-blue/40 hover:bg-bili-blue/8"
          >
            <p className="text-xs font-semibold text-bili-blue">{t(locale, "ui.project.links.repo.title")}</p>
            <p className="mt-1 text-[11px] text-gray-400">{t(locale, "ui.project.links.repo.desc")}</p>
          </a>
          <a
            href="https://mozi1924.com/about/"
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-white/8 bg-white/2 px-4 py-3 transition-colors hover:border-bili-blue/40 hover:bg-bili-blue/8"
          >
            <p className="text-xs font-semibold text-bili-blue">{t(locale, "ui.project.links.site.title")}</p>
            <p className="mt-1 text-[11px] text-gray-400">{t(locale, "ui.project.links.site.desc")}</p>
          </a>
        </div>
      </section>

      <section className="flat-panel rounded-2xl border border-white/5 p-6">
        <div className="mb-4 flex items-center gap-2 text-bili-pink">
          <Layers3 className="h-4 w-4" />
          <span className="text-[10px] font-extrabold tracking-widest text-gray-400 uppercase">
            {t(locale, "ui.project.stack.badge")}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {techStacks.map(({ name, descKey, icon: Icon }) => (
            <div key={name} className="rounded-xl border border-white/8 bg-white/2 p-4">
              <div className="mb-2 flex items-center gap-2 text-white">
                <Icon className="h-4 w-4 text-bili-blue" />
                <h4 className="text-xs font-semibold">{name}</h4>
              </div>
              <p className="text-[11px] leading-5 text-gray-400">{t(locale, descKey)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="flat-panel rounded-2xl border border-white/5 p-6">
        <div className="mb-4 flex items-center gap-2 text-emerald-300">
          <HeartHandshake className="h-4 w-4" />
          <span className="text-[10px] font-extrabold tracking-widest text-gray-400 uppercase">
            {t(locale, "ui.project.ack.badge")}
          </span>
        </div>
        <ul className="space-y-2">
          {acknowledgements.map((item) => (
            <li key={item.name} className="rounded-xl border border-white/8 bg-white/2 px-4 py-3 text-xs text-gray-300">
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-bili-blue hover:text-bili-blue/80"
              >
                <LinkIcon className="h-3.5 w-3.5" />
                {item.name}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
