/**
 * TTS defaults shared between the frontend UI and the Rust backend.
 * Keep in sync with:
 * - `src-tauri/src/constants.rs` -> `DEFAULT_TTS_VOICE`
 * - `src-tauri/src/models.rs`    -> `default_tts_*()`
 */
export const DEFAULT_TTS_VOICE = "zh-CN-XiaoxiaoNeural";
export const DEFAULT_TTS_RATE = "+0%";
export const DEFAULT_TTS_PITCH = "+0Hz";
export const DEFAULT_TTS_VOLUME = 100;
export const DEFAULT_TTS_DEVICE = "default";
