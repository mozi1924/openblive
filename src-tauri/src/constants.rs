pub const DEFAULT_APP_KEY: &str = "aae92bc66f3edfab";
pub const DEFAULT_APP_SEC: &str = "af125a0d5279fd576c1b4418a3e8276d";
pub const DEFAULT_LIVEHIME_VERSION: &str = "7.63.0.10783";
pub const DEFAULT_LIVEHIME_BUILD: u64 = 10783;
pub const DEFAULT_LIVE_PLATFORM: &str = "pc_link";

/// Default Edge TTS voice used when the user has not chosen one.
/// Keep in sync with the backend's `default_tts_voice()` and the
/// frontend `src/constants/tts.ts`.
pub const DEFAULT_TTS_VOICE: &str = "zh-CN-XiaoxiaoNeural";

pub type CmdResult = std::result::Result<serde_json::Value, String>;
