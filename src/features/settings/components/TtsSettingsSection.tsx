import { useEffect, useState, useCallback } from "react";
import { Volume2, VolumeX, Play, Mic, Sliders, AudioLines } from "lucide-react";
import type { AppConfig, TtsVoice } from "../../../types/studio";
import type { LocaleSetting } from "../../../utils/i18n";
import { t } from "../../../utils/i18n";
import { studioApi } from "../../../services/studioApi";

type TtsSettingsSectionProps = {
  locale: LocaleSetting;
  appConfig: AppConfig;
  onChangeConfig: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
};

const RATE_OPTIONS = [
  { label: "-50%", value: "-50%" },
  { label: "-25%", value: "-25%" },
  { label: "-10%", value: "-10%" },
  { label: "正常 (0%)", value: "+0%" },
  { label: "+10%", value: "+10%" },
  { label: "+25%", value: "+25%" },
  { label: "+50%", value: "+50%" },
  { label: "+100%", value: "+100%" },
];

const PITCH_OPTIONS = [
  { label: "-10Hz", value: "-10Hz" },
  { label: "-5Hz", value: "-5Hz" },
  { label: "正常 (0Hz)", value: "+0Hz" },
  { label: "+5Hz", value: "+5Hz" },
  { label: "+10Hz", value: "+10Hz" },
];

export function TtsSettingsSection({
  locale,
  appConfig,
  onChangeConfig,
}: TtsSettingsSectionProps) {
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [devices, setDevices] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [voicesRes, devicesRes] = await Promise.all([
        studioApi.getTtsVoices().catch(() => null),
        studioApi.getAudioOutputDevices().catch(() => null),
      ]);
      if (voicesRes?.data?.voices) {
        setVoices(voicesRes.data.voices);
      }
      if (devicesRes?.data?.devices) {
        setDevices(devicesRes.data.devices);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleTestSpeech = async () => {
    if (testing) return;
    setTesting(true);
    try {
      await studioApi.testTtsSpeech("这是一条直播信息流朗读测试消息，用于验证当前发音人和声音设置。");
    } catch {
      // ignore
    } finally {
      setTimeout(() => setTesting(false), 1500);
    }
  };

  return (
    <div className="p-6 transition-all duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/5">
        <div className="flex items-center space-x-3.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20">
            <Volume2 className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-200">
              {t(locale, "ui.settings.tts.title")}
            </h3>
            <p className="mt-0.5 text-xs text-gray-400">
              {t(locale, "ui.settings.tts.desc")}
            </p>
          </div>
        </div>

        {/* Enable Switch */}
        <label className="relative inline-flex items-center cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={appConfig.tts_enabled}
            onChange={(e) => onChangeConfig("tts_enabled", e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          <span className="ml-3 text-xs font-medium text-gray-300">
            {t(locale, "ui.settings.tts.enable")}
          </span>
        </label>
      </div>

      {appConfig.tts_enabled && (
        <div className="mt-6 space-y-6 animate-fadeIn">
          {/* Main Controls Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Voice Selection */}
            <div>
              <label className="flex items-center gap-2 text-xs font-medium text-gray-300 mb-2">
                <Mic className="h-3.5 w-3.5 text-blue-400" />
                {t(locale, "ui.settings.tts.voice")}
              </label>
              <select
                value={appConfig.tts_voice || "zh-CN-XiaoxiaoNeural"}
                onChange={(e) => onChangeConfig("tts_voice", e.target.value)}
                className="w-full bg-[#0d121d] border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500/50 transition-colors"
              >
                {voices.map((voice) => (
                  <option key={voice.short_name} value={voice.short_name}>
                    {voice.friendly_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Audio Output Device Selection */}
            <div>
              <label className="flex items-center gap-2 text-xs font-medium text-gray-300 mb-2">
                <AudioLines className="h-3.5 w-3.5 text-purple-400" />
                {t(locale, "ui.settings.tts.device")}
              </label>
              <select
                value={appConfig.tts_device || "default"}
                onChange={(e) => onChangeConfig("tts_device", e.target.value)}
                className="w-full bg-[#0d121d] border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500/50 transition-colors"
              >
                {devices.map((device) => (
                  <option key={device} value={device}>
                    {device === "default"
                      ? t(locale, "ui.settings.tts.device.default")
                      : device}
                  </option>
                ))}
              </select>
            </div>

            {/* Volume Slider */}
            <div>
              <div className="flex items-center justify-between text-xs font-medium text-gray-300 mb-2">
                <span className="flex items-center gap-2">
                  {appConfig.tts_volume === 0 ? (
                    <VolumeX className="h-3.5 w-3.5 text-gray-400" />
                  ) : (
                    <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
                  )}
                  {t(locale, "ui.settings.tts.volume")}
                </span>
                <span className="text-gray-400">{appConfig.tts_volume}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={appConfig.tts_volume ?? 100}
                onChange={(e) => onChangeConfig("tts_volume", Number(e.target.value))}
                className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>

            {/* Rate & Pitch controls */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-300 mb-2">
                  <Sliders className="h-3.5 w-3.5 text-amber-400" />
                  {t(locale, "ui.settings.tts.rate")}
                </label>
                <select
                  value={appConfig.tts_rate || "+0%"}
                  onChange={(e) => onChangeConfig("tts_rate", e.target.value)}
                  className="w-full bg-[#0d121d] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500/50"
                >
                  {RATE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-gray-300 mb-2">
                  <Sliders className="h-3.5 w-3.5 text-pink-400" />
                  {t(locale, "ui.settings.tts.pitch")}
                </label>
                <select
                  value={appConfig.tts_pitch || "+0Hz"}
                  onChange={(e) => onChangeConfig("tts_pitch", e.target.value)}
                  className="w-full bg-[#0d121d] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-gray-200 focus:outline-none focus:border-blue-500/50"
                >
                  {PITCH_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Category Filtering Checkboxes */}
          <div className="pt-4 border-t border-white/5">
            <h4 className="text-xs font-semibold text-gray-300 mb-3">
              {t(locale, "ui.settings.tts.category.title")}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="flex items-center gap-2.5 bg-[#0d121d]/60 border border-white/5 p-3 rounded-lg cursor-pointer hover:bg-[#0d121d] transition-colors">
                <input
                  type="checkbox"
                  checked={appConfig.tts_read_danmu ?? true}
                  onChange={(e) => onChangeConfig("tts_read_danmu", e.target.checked)}
                  className="rounded border-white/20 bg-gray-900 text-blue-600 focus:ring-0"
                />
                <span className="text-xs text-gray-300">
                  {t(locale, "ui.settings.tts.category.danmu")}
                </span>
              </label>

              <label className="flex items-center gap-2.5 bg-[#0d121d]/60 border border-white/5 p-3 rounded-lg cursor-pointer hover:bg-[#0d121d] transition-colors">
                <input
                  type="checkbox"
                  checked={appConfig.tts_read_gift ?? true}
                  onChange={(e) => onChangeConfig("tts_read_gift", e.target.checked)}
                  className="rounded border-white/20 bg-gray-900 text-blue-600 focus:ring-0"
                />
                <span className="text-xs text-gray-300">
                  {t(locale, "ui.settings.tts.category.gift")}
                </span>
              </label>

              <label className="flex items-center gap-2.5 bg-[#0d121d]/60 border border-white/5 p-3 rounded-lg cursor-pointer hover:bg-[#0d121d] transition-colors">
                <input
                  type="checkbox"
                  checked={appConfig.tts_read_superchat ?? true}
                  onChange={(e) => onChangeConfig("tts_read_superchat", e.target.checked)}
                  className="rounded border-white/20 bg-gray-900 text-blue-600 focus:ring-0"
                />
                <span className="text-xs text-gray-300">
                  {t(locale, "ui.settings.tts.category.superchat")}
                </span>
              </label>

              <label className="flex items-center gap-2.5 bg-[#0d121d]/60 border border-white/5 p-3 rounded-lg cursor-pointer hover:bg-[#0d121d] transition-colors">
                <input
                  type="checkbox"
                  checked={appConfig.tts_read_interact ?? false}
                  onChange={(e) => onChangeConfig("tts_read_interact", e.target.checked)}
                  className="rounded border-white/20 bg-gray-900 text-blue-600 focus:ring-0"
                />
                <span className="text-xs text-gray-300">
                  {t(locale, "ui.settings.tts.category.interact")}
                </span>
              </label>
            </div>
          </div>

          {/* Test Speech Button */}
          <div className="flex justify-end pt-2">
            <button
              onClick={() => void handleTestSpeech()}
              disabled={testing}
              className="flex items-center gap-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 px-4 py-2 rounded-lg text-xs font-medium transition-all active:scale-95 disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              {testing
                ? t(locale, "ui.settings.tts.test.testing")
                : t(locale, "ui.settings.tts.test.btn")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
