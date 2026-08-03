import { useEffect, useState, useCallback } from "react";
import {
  Volume2,
  VolumeX,
  Play,
  Square,
  Mic,
  Sliders,
  AudioLines,
  Filter,
  MessageSquare,
  Gift,
  Sparkles,
  UserCheck,
  ChevronDown,
} from "lucide-react";
import type { AppConfig, TtsPlaybackEvent, TtsVoice } from "../../../types/studio";
import type { LocaleSetting } from "../../../utils/i18n";
import { t } from "../../../utils/i18n";
import { studioApi } from "../../../services/studioApi";
import { useTauriEvent } from "../../../hooks/useTauriEvent";
import {
  DEFAULT_TTS_VOICE,
  DEFAULT_TTS_RATE,
  DEFAULT_TTS_PITCH,
  DEFAULT_TTS_VOLUME,
  DEFAULT_TTS_DEVICE,
} from "../../../constants/tts";

type TtsSettingsSectionProps = {
  locale: LocaleSetting;
  appConfig: AppConfig;
  onChangeConfig: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
};

const RATE_VALUES = ["-50%", "-25%", "-10%", "+0%", "+10%", "+25%", "+50%", "+100%"];

const PITCH_VALUES = ["-10Hz", "-5Hz", "+0Hz", "+5Hz", "+10Hz"];

const optionCardClass =
  "flex min-h-20 items-start rounded-xl border p-3.5 text-left transition-all duration-200";

const selectClass =
  "h-10 w-full appearance-none rounded-lg border border-white/8 bg-[#0b111c] px-3.5 pr-9 text-xs text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-all hover:border-white/12 focus:border-bili-blue/40 focus:outline-none cursor-pointer";

const inputClass =
  "w-full rounded-lg border border-white/8 bg-[#090b0f] px-3.5 py-2.5 text-xs text-white outline-none transition-all hover:border-white/12 focus:border-bili-blue/40";

export function TtsSettingsSection({
  locale,
  appConfig,
  onChangeConfig,
}: TtsSettingsSectionProps) {
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [devices, setDevices] = useState<string[]>([]);
  const [playing, setPlaying] = useState(false);
  const [testText, setTestText] = useState(() => t(locale, "ui.settings.tts.test.placeholder"));

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

  // Reflect backend playback state: the test button turns into "playing"
  // only after the backend actually started a test speech, and reverts when
  // the speech finishes naturally or is stopped.
  useTauriEvent(studioApi.listenTtsPlayback, (event: TtsPlaybackEvent) => {
    if (event.playing) {
      setPlaying(event.source === "test");
    } else {
      setPlaying(false);
    }
  });

  const handlePlayTest = async () => {
    try {
      await studioApi.testTtsSpeech(testText.trim() || t(locale, "ui.settings.tts.test.placeholder"));
    } catch {
      // ignore
    }
  };

  const handleStopTest = async () => {
    setPlaying(false);
    try {
      await studioApi.stopTtsSpeech();
    } catch {
      // ignore
    }
  };

  const rateOptions = RATE_VALUES.map((value) => ({
    value,
    label:
      value === "+0%" ? t(locale, "ui.settings.tts.rate.normal") : value,
  }));

  const pitchOptions = PITCH_VALUES.map((value) => ({
    value,
    label:
      value === "+0Hz" ? t(locale, "ui.settings.tts.pitch.normal") : value,
  }));

  return (
    <section className="space-y-4.5 p-5">
      <div>
        <div className="flex items-center space-x-2">
          <Volume2 className="h-4 w-4 text-bili-blue" />
          <span className="text-[10px] font-extrabold tracking-widest text-gray-400 uppercase">
            TTS READOUT SETTINGS
          </span>
        </div>
        <p className="mt-1 text-xs font-medium text-gray-500">
          {t(locale, "ui.settings.tts.desc")}
        </p>
      </div>

      {/* Enablement Toggle Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onChangeConfig("tts_enabled", true)}
          className={`${optionCardClass} ${
            appConfig.tts_enabled
              ? "border-bili-blue/35 bg-bili-blue/5 text-white"
              : "border-white/5 bg-white/2 text-gray-400 hover:border-white/10 hover:bg-white/4"
          }`}
        >
          <Volume2
            className={`mr-3 mt-0.5 h-5 w-5 shrink-0 ${
              appConfig.tts_enabled ? "text-bili-blue" : "text-gray-500"
            }`}
          />
          <div>
            <span className="block text-xs font-bold text-gray-200">
              {t(locale, "ui.settings.tts.enable")}
            </span>
            <span className="mt-1 block text-[10px] font-medium leading-normal text-gray-500">
              {t(locale, "ui.settings.tts.enable_desc")}
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onChangeConfig("tts_enabled", false)}
          className={`${optionCardClass} ${
            !appConfig.tts_enabled
              ? "border-bili-blue/35 bg-bili-blue/5 text-white"
              : "border-white/5 bg-white/2 text-gray-400 hover:border-white/10 hover:bg-white/4"
          }`}
        >
          <VolumeX
            className={`mr-3 mt-0.5 h-5 w-5 shrink-0 ${
              !appConfig.tts_enabled ? "text-bili-blue" : "text-gray-500"
            }`}
          />
          <div>
            <span className="block text-xs font-bold text-gray-200">
              {t(locale, "ui.settings.tts.disable")}
            </span>
            <span className="mt-1 block text-[10px] font-medium leading-normal text-gray-500">
              {t(locale, "ui.settings.tts.disable_desc")}
            </span>
          </div>
        </button>
      </div>

      {appConfig.tts_enabled && (
        <div className="space-y-4 pt-2">
          {/* Main Controls Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Voice Selection */}
            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-[10px] font-bold tracking-wide text-gray-400 uppercase">
                <Mic className="h-3.5 w-3.5 text-bili-blue" />
                {t(locale, "ui.settings.tts.voice")}
              </label>
              <div className="relative">
                <select
                  value={appConfig.tts_voice || DEFAULT_TTS_VOICE}
                  onChange={(e) => onChangeConfig("tts_voice", e.target.value)}
                  className={selectClass}
                >
                  {voices.length > 0 ? (
                    voices.map((voice) => (
                      <option
                        key={voice.short_name}
                        value={voice.short_name}
                        className="bg-[#090b0f]"
                      >
                        {voice.friendly_name}
                      </option>
                    ))
                  ) : (
                    <option value={DEFAULT_TTS_VOICE} className="bg-[#090b0f]">
                      {DEFAULT_TTS_VOICE}
                    </option>
                  )}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              </div>
            </div>

            {/* Audio Output Device Selection */}
            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-[10px] font-bold tracking-wide text-gray-400 uppercase">
                <AudioLines className="h-3.5 w-3.5 text-purple-400" />
                {t(locale, "ui.settings.tts.device")}
              </label>
              <div className="relative">
                <select
                  value={appConfig.tts_device || DEFAULT_TTS_DEVICE}
                  onChange={(e) => onChangeConfig("tts_device", e.target.value)}
                  className={selectClass}
                >
                  {devices.map((device) => (
                    <option key={device} value={device} className="bg-[#090b0f]">
                      {device === "default"
                        ? t(locale, "ui.settings.tts.device.default")
                        : device}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              </div>
            </div>

            {/* Rate Adjustment */}
            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-[10px] font-bold tracking-wide text-gray-400 uppercase">
                <Sliders className="h-3.5 w-3.5 text-amber-400" />
                {t(locale, "ui.settings.tts.rate")}
              </label>
              <div className="relative">
                <select
                  value={appConfig.tts_rate || DEFAULT_TTS_RATE}
                  onChange={(e) => onChangeConfig("tts_rate", e.target.value)}
                  className={selectClass}
                >
                  {rateOptions.map((opt) => (
                    <option key={opt.value} value={opt.value} className="bg-[#090b0f]">
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              </div>
            </div>

            {/* Pitch Adjustment */}
            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-[10px] font-bold tracking-wide text-gray-400 uppercase">
                <Sliders className="h-3.5 w-3.5 text-bili-pink" />
                {t(locale, "ui.settings.tts.pitch")}
              </label>
              <div className="relative">
                <select
                  value={appConfig.tts_pitch || DEFAULT_TTS_PITCH}
                  onChange={(e) => onChangeConfig("tts_pitch", e.target.value)}
                  className={selectClass}
                >
                  {pitchOptions.map((opt) => (
                    <option key={opt.value} value={opt.value} className="bg-[#090b0f]">
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              </div>
            </div>
          </div>

          {/* Volume Slider Card */}
          <div className="rounded-xl border border-white/6 bg-white/[0.02] px-4 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold text-gray-200">
                  {t(locale, "ui.settings.tts.volume")}
                </p>
                <p className="mt-1 text-[10px] font-medium text-gray-500">
                  {t(locale, "ui.settings.tts.volume_desc")}
                </p>
              </div>
              <span className="rounded-full border border-bili-blue/15 bg-bili-blue/10 px-2.5 py-1 text-[10px] font-black text-bili-blue">
                {appConfig.tts_volume ?? DEFAULT_TTS_VOLUME}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={appConfig.tts_volume ?? DEFAULT_TTS_VOLUME}
              onChange={(e) => onChangeConfig("tts_volume", Number(e.target.value))}
              className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-full bg-white/8 accent-bili-blue"
            />
          </div>

          {/* Category Filtering Grid */}
          <div className="border-t border-white/6 pt-4 space-y-3">
            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4 text-emerald-400" />
              <span className="text-[10px] font-extrabold tracking-widest text-gray-400 uppercase">
                {t(locale, "ui.settings.tts.category.title")}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <button
                type="button"
                onClick={() => onChangeConfig("tts_read_danmu", !appConfig.tts_read_danmu)}
                className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all duration-200 ${
                  appConfig.tts_read_danmu ?? true
                    ? "border-emerald-500/35 bg-emerald-500/8 text-white"
                    : "border-white/5 bg-white/2 text-gray-400 hover:border-white/10 hover:bg-white/4"
                }`}
              >
                <MessageSquare
                  className={`h-4 w-4 shrink-0 ${
                    appConfig.tts_read_danmu ?? true ? "text-emerald-400" : "text-gray-500"
                  }`}
                />
                <span className="text-xs font-bold text-gray-200">
                  {t(locale, "ui.settings.tts.category.danmu")}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onChangeConfig("tts_read_gift", !appConfig.tts_read_gift)}
                className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all duration-200 ${
                  appConfig.tts_read_gift ?? true
                    ? "border-emerald-500/35 bg-emerald-500/8 text-white"
                    : "border-white/5 bg-white/2 text-gray-400 hover:border-white/10 hover:bg-white/4"
                }`}
              >
                <Gift
                  className={`h-4 w-4 shrink-0 ${
                    appConfig.tts_read_gift ?? true ? "text-emerald-400" : "text-gray-500"
                  }`}
                />
                <span className="text-xs font-bold text-gray-200">
                  {t(locale, "ui.settings.tts.category.gift")}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onChangeConfig("tts_read_superchat", !appConfig.tts_read_superchat)}
                className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all duration-200 ${
                  appConfig.tts_read_superchat ?? true
                    ? "border-emerald-500/35 bg-emerald-500/8 text-white"
                    : "border-white/5 bg-white/2 text-gray-400 hover:border-white/10 hover:bg-white/4"
                }`}
              >
                <Sparkles
                  className={`h-4 w-4 shrink-0 ${
                    appConfig.tts_read_superchat ?? true ? "text-emerald-400" : "text-gray-500"
                  }`}
                />
                <span className="text-xs font-bold text-gray-200">
                  {t(locale, "ui.settings.tts.category.superchat")}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onChangeConfig("tts_read_interact", !appConfig.tts_read_interact)}
                className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all duration-200 ${
                  appConfig.tts_read_interact ?? false
                    ? "border-emerald-500/35 bg-emerald-500/8 text-white"
                    : "border-white/5 bg-white/2 text-gray-400 hover:border-white/10 hover:bg-white/4"
                }`}
              >
                <UserCheck
                  className={`h-4 w-4 shrink-0 ${
                    appConfig.tts_read_interact ?? false ? "text-emerald-400" : "text-gray-500"
                  }`}
                />
                <span className="text-xs font-bold text-gray-200">
                  {t(locale, "ui.settings.tts.category.interact")}
                </span>
              </button>
            </div>
          </div>

          {/* Test Speech Action Row */}
          <div className="space-y-3 border-t border-white/6 pt-4">
            <label className="flex flex-col gap-2">
              <span className="flex items-center gap-1.5 text-[10px] font-bold tracking-wide text-gray-400 uppercase">
                <Play className="h-3.5 w-3.5 text-bili-blue" />
                {t(locale, "ui.settings.tts.test.text")}
              </span>
              <input
                className={inputClass}
                value={testText}
                onChange={(event) => setTestText(event.target.value)}
                placeholder={t(locale, "ui.settings.tts.test.placeholder")}
              />
            </label>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-[10px] font-medium text-gray-500">
                {t(locale, "ui.settings.tts.test.desc")}
              </p>
              <button
                type="button"
                onClick={() => {
                  if (playing) {
                    void handleStopTest();
                  } else {
                    void handlePlayTest();
                  }
                }}
                className={`flex h-9 min-w-[110px] items-center justify-center rounded-lg border px-4 text-xs font-bold transition-all active:scale-95 ${
                  playing
                    ? "border-red-500/40 bg-red-500/15 text-red-400 hover:bg-red-500/25"
                    : "border-bili-blue/30 bg-bili-blue/10 text-bili-blue hover:bg-bili-blue/20"
                }`}
              >
                {playing ? (
                  <Square className="mr-1.5 h-3 w-3 fill-current shrink-0" />
                ) : (
                  <Play className="mr-1.5 h-3.5 w-3.5 fill-current shrink-0" />
                )}
                {playing
                  ? t(locale, "ui.settings.tts.test.stop")
                  : t(locale, "ui.settings.tts.test.play")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
