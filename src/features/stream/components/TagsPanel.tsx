import { Plus, X } from "lucide-react";
import type { LocaleSetting } from "../../../utils/i18n";
import { t } from "../../../utils/i18n";

type TagsPanelProps = {
  locale: LocaleSetting;
  tags: string[];
  tagInput: string;
  sectionStatus: { tone: "green" | "yellow" | "red"; label: string; detail: string };
  onChangeTagInput: React.Dispatch<React.SetStateAction<string>>;
  onAddTag: () => void;
  onRemoveTag: (tag: string) => void;
};

export function TagsPanel({
  locale,
  tags,
  tagInput,
  sectionStatus,
  onChangeTagInput,
  onAddTag,
  onRemoveTag,
}: TagsPanelProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <label className="text-[10px] font-extrabold tracking-wider text-gray-500 uppercase">
          {t(locale, "ui.stream.tags.title")}
        </label>
        <div className="flex items-center gap-1.5 rounded-md border border-white/8 bg-white/3 px-2 py-0.5 text-[10px]">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              sectionStatus.tone === "green"
                ? "bg-emerald-400"
                : sectionStatus.tone === "red"
                  ? "bg-rose-400"
                  : "bg-amber-400"
            }`}
          />
          <span className="text-gray-300 font-medium">{sectionStatus.label}</span>
        </div>
      </div>

      {/* Display Current Tags */}
      <div className="min-h-11 rounded-lg border border-white/5 bg-white/1.5 p-2">
        {tags.length === 0 ? (
          <p className="px-1.5 py-1 text-xs text-gray-500 font-medium">
            {t(locale, "ui.stream.tags.empty")}
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded border border-bili-blue/20 bg-bili-blue/8 px-2 py-0.5 text-xs font-semibold text-bili-blue"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => onRemoveTag(tag)}
                  className="ml-1.5 rounded p-0.5 text-bili-blue/60 transition-colors hover:bg-bili-blue/20 hover:text-bili-blue"
                  title={t(locale, "ui.stream.tags.delete")}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Tag inputs */}
      <div className="flex gap-2">
        <input
          type="text"
          value={tagInput}
          onChange={(event) => onChangeTagInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onAddTag();
            }
          }}
          placeholder={t(locale, "ui.stream.tags.placeholder")}
          className="flex-1 rounded-lg border border-white/8 bg-white/1.5 px-3.5 py-2 text-xs text-white transition-all focus:border-bili-blue/40 focus:bg-white/3 focus:outline-none"
        />
        <button
          type="button"
          onClick={onAddTag}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/8 bg-white/3 text-gray-300 hover:bg-white/6 hover:text-white"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
