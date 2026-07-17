import type { LocaleSetting } from "../../../utils/i18n";
import { t, tf } from "../../../utils/i18n";

type RoomNewsPanelProps = {
  locale: LocaleSetting;
  roomNews: string;
  onChangeRoomNews: (value: string) => void;
  onSubmitRoomNews: (event: React.FormEvent) => Promise<void>;
};

export function RoomNewsPanel({
  locale,
  roomNews,
  onChangeRoomNews,
  onSubmitRoomNews,
}: RoomNewsPanelProps) {
  return (
    <form onSubmit={(event) => void onSubmitRoomNews(event)} className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className="text-[10px] font-extrabold tracking-wider text-gray-500 uppercase">
          {t(locale, "ui.stream.room_news.label")}
        </label>
        <span className="rounded border border-white/10 bg-white/4 px-2 py-0.5 text-[10px] text-gray-400">
          {tf(locale, "ui.stream.room_news.length", { count: roomNews.trim().length })}
        </span>
      </div>
      <textarea
        value={roomNews}
        onChange={(event) => onChangeRoomNews(event.target.value)}
        maxLength={60}
        rows={3}
        placeholder={t(locale, "ui.stream.room_news.placeholder")}
        className="w-full resize-none rounded-lg border border-white/8 bg-white/1.5 px-3.5 py-2 text-xs text-white transition-all focus:border-bili-blue/40 focus:bg-white/3 focus:outline-none hover:border-white/12"
      />
      <div className="flex items-center justify-end">
        <button
          type="submit"
          className="flex h-9 items-center justify-center rounded-lg border border-bili-blue/20 bg-bili-blue/10 px-4 text-xs font-bold text-bili-blue transition-all hover:bg-bili-blue hover:text-white active:scale-95"
        >
          {t(locale, "ui.stream.room_news.update")}
        </button>
      </div>
    </form>
  );
}
