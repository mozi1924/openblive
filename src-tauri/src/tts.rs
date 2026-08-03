use anyhow::{anyhow, Result};
use edge_tts_rust::{EdgeTtsClient, SpeakOptions};
use rodio::cpal::traits::{DeviceTrait, HostTrait};
use rodio::{Decoder, OutputStream, Sink};
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::sync::{Arc, Mutex, OnceLock};
use tokio::sync::mpsc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TtsVoice {
    pub short_name: String,
    pub friendly_name: String,
    pub locale: String,
    pub gender: String,
}

#[derive(Debug, Clone)]
pub struct TtsSpeechTask {
    pub text: String,
    pub voice: String,
    pub rate: String,
    pub pitch: String,
    pub volume: u8,
    pub device: String,
}

static TTS_TX: OnceLock<mpsc::Sender<TtsSpeechTask>> = OnceLock::new();
static CLIENT_CACHE: OnceLock<Arc<Mutex<Option<EdgeTtsClient>>>> = OnceLock::new();

fn get_client_cache() -> &'static Arc<Mutex<Option<EdgeTtsClient>>> {
    CLIENT_CACHE.get_or_init(|| Arc::new(Mutex::new(None)))
}

fn get_or_create_client() -> Result<EdgeTtsClient> {
    let cache = get_client_cache();
    let mut guard = cache.lock().unwrap_or_else(|p| p.into_inner());
    if let Some(ref client) = *guard {
        return Ok(client.clone());
    }
    let new_client = EdgeTtsClient::new().map_err(|e| anyhow!("Failed to init EdgeTtsClient: {e}"))?;
    *guard = Some(new_client.clone());
    Ok(new_client)
}

pub fn init_tts_worker() {
    if TTS_TX.get().is_some() {
        return;
    }
    let (tx, mut rx) = mpsc::channel::<TtsSpeechTask>(100);
    if TTS_TX.set(tx).is_err() {
        return;
    }

    tauri::async_runtime::spawn(async move {
        while let Some(task) = rx.recv().await {
            if task.text.trim().is_empty() {
                continue;
            }
            if let Err(err) = process_speech_task(task).await {
                crate::runtime_warn!("[tts] speech processing error: {err}");
            }
        }
    });
}

async fn process_speech_task(task: TtsSpeechTask) -> Result<()> {
    let client = get_or_create_client()?;

    // Fall back to shared defaults when a field is empty. The voice default is
    // the app-level constant; rate/pitch defaults are taken from the crate's
    // own `SpeakOptions` defaults so they stay in sync with the library.
    let defaults = SpeakOptions::default();
    let voice_name = if task.voice.trim().is_empty() {
        crate::constants::DEFAULT_TTS_VOICE.to_string()
    } else {
        task.voice.trim().to_string()
    };
    let rate = if task.rate.trim().is_empty() {
        defaults.rate.clone()
    } else {
        task.rate.trim().to_string()
    };
    let pitch = if task.pitch.trim().is_empty() {
        defaults.pitch.clone()
    } else {
        task.pitch.trim().to_string()
    };

    // Note: `volume` is intentionally left at the crate default ("+0%") here.
    // The user-configurable `tts_volume` (0-100) is an absolute playback gain
    // applied on the rodio Sink in `play_audio_bytes`, not an Edge TTS
    // relative adjustment, so it is kept out of `SpeakOptions`.
    let options = SpeakOptions {
        voice: voice_name,
        rate,
        pitch,
        ..Default::default()
    };

    let audio_data = client
        .synthesize(&task.text, options)
        .await
        .map_err(|e| anyhow!("TTS synthesize error: {e}"))?;

    if audio_data.audio.is_empty() {
        return Ok(());
    }

    let device_name = task.device.clone();
    let volume = task.volume;
    let audio_bytes = audio_data.audio;

    tokio::task::spawn_blocking(move || {
        if let Err(err) = play_audio_bytes(&audio_bytes, &device_name, volume) {
            crate::runtime_warn!("[tts] audio playback error: {err}");
        }
    })
    .await?;

    Ok(())
}

fn play_audio_bytes(bytes: &[u8], device_name: &str, volume_pct: u8) -> Result<()> {
    let host = rodio::cpal::default_host();
    let mut selected_device = None;

    if !device_name.is_empty() && device_name != "default" {
        if let Ok(output_devices) = host.output_devices() {
            for dev in output_devices {
                if let Ok(name) = dev.name() {
                    if name == device_name {
                        selected_device = Some(dev);
                        break;
                    }
                }
            }
        }
    }

    let (_stream, stream_handle) = match selected_device {
        Some(dev) => OutputStream::try_from_device(&dev)
            .or_else(|_| OutputStream::try_default())
            .map_err(|e| anyhow!("Failed to open audio output stream: {e}"))?,
        None => OutputStream::try_default()
            .map_err(|e| anyhow!("Failed to open default audio output stream: {e}"))?,
    };

    let sink = Sink::try_new(&stream_handle)
        .map_err(|e| anyhow!("Failed to create audio Sink: {e}"))?;

    let cursor = Cursor::new(bytes.to_vec());
    let source = Decoder::new(cursor).map_err(|e| anyhow!("Failed to decode MP3 audio: {e}"))?;

    let vol = (volume_pct.min(100) as f32) / 100.0;
    sink.set_volume(vol);
    sink.append(source);
    sink.sleep_until_end();

    Ok(())
}

pub fn enqueue_speech(config: &crate::models::PersistConfig, text: String) {
    if !config.tts_enabled || text.trim().is_empty() {
        return;
    }
    init_tts_worker();
    if let Some(tx) = TTS_TX.get() {
        let task = TtsSpeechTask {
            text,
            voice: config.tts_voice.clone(),
            rate: config.tts_rate.clone(),
            pitch: config.tts_pitch.clone(),
            volume: config.tts_volume,
            device: config.tts_device.clone(),
        };
        let _ = tx.try_send(task);
    }
}

pub fn enqueue_test_speech(config: &crate::models::PersistConfig, custom_text: Option<String>) {
    init_tts_worker();
    if let Some(tx) = TTS_TX.get() {
        let text = custom_text
            .filter(|t| !t.trim().is_empty())
            .unwrap_or_else(|| "这是一条直播信息流朗读测试消息。".to_string());
        let task = TtsSpeechTask {
            text,
            voice: config.tts_voice.clone(),
            rate: config.tts_rate.clone(),
            pitch: config.tts_pitch.clone(),
            volume: config.tts_volume,
            device: config.tts_device.clone(),
        };
        let _ = tx.try_send(task);
    }
}

pub fn list_audio_output_devices() -> Vec<String> {
    let host = rodio::cpal::default_host();
    let mut devices = vec!["default".to_string()];
    if let Ok(output_devices) = host.output_devices() {
        for dev in output_devices {
            if let Ok(name) = dev.name() {
                if !devices.contains(&name) {
                    devices.push(name);
                }
            }
        }
    }
    devices
}

static FETCHED_VOICES_CACHE: OnceLock<Arc<tokio::sync::Mutex<Option<Vec<TtsVoice>>>>> = OnceLock::new();

fn get_voices_cache() -> &'static Arc<tokio::sync::Mutex<Option<Vec<TtsVoice>>>> {
    FETCHED_VOICES_CACHE.get_or_init(|| Arc::new(tokio::sync::Mutex::new(None)))
}

pub async fn list_voices_dynamic() -> Vec<TtsVoice> {
    let cache = get_voices_cache();
    {
        let guard = cache.lock().await;
        if let Some(ref cached) = *guard {
            return cached.clone();
        }
    }

    let mut fetched_voices = Vec::new();
    if let Ok(client) = get_or_create_client() {
        if let Ok(remote_voices) = client.list_voices().await {
            for v in remote_voices {
                let friendly_name = v.friendly_name.clone().unwrap_or_else(|| {
                    format!("{} ({}, {})", v.short_name, v.gender, v.locale)
                });
                fetched_voices.push(TtsVoice {
                    short_name: v.short_name,
                    friendly_name,
                    locale: v.locale,
                    gender: v.gender,
                });
            }
        }
    }

    if fetched_voices.is_empty() {
        fetched_voices = list_supported_voices();
    } else {
        sort_voices_default(&mut fetched_voices);
    }

    let mut guard = cache.lock().await;
    *guard = Some(fetched_voices.clone());
    fetched_voices
}

/// Orders voices the way the settings UI should show them: Chinese voices
/// first, then everything else, each group sorted by short name.
fn sort_voices_default(voices: &mut [TtsVoice]) {
    voices.sort_by(|a, b| {
        let a_is_zh = a.locale.starts_with("zh");
        let b_is_zh = b.locale.starts_with("zh");
        if a_is_zh != b_is_zh {
            b_is_zh.cmp(&a_is_zh)
        } else {
            a.short_name.cmp(&b.short_name)
        }
    });
}

/// Fallback voice list used only when the live voice list cannot be fetched
/// (e.g. offline). It intentionally mirrors the current Microsoft Edge TTS
/// catalogue and is verified against `GET .../voices/list` — voices that have
/// been retired by Microsoft are not listed here. The dynamic fetch in
/// `list_voices_dynamic` is the source of truth.
pub fn list_supported_voices() -> Vec<TtsVoice> {
    let mut voices = vec![
        TtsVoice {
            short_name: "zh-CN-XiaoxiaoNeural".to_string(),
            friendly_name: "Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)".to_string(),
            locale: "zh-CN".to_string(),
            gender: "Female".to_string(),
        },
        TtsVoice {
            short_name: "zh-CN-XiaoyiNeural".to_string(),
            friendly_name: "Microsoft Xiaoyi Online (Natural) - Chinese (Mainland)".to_string(),
            locale: "zh-CN".to_string(),
            gender: "Female".to_string(),
        },
        TtsVoice {
            short_name: "zh-CN-YunjianNeural".to_string(),
            friendly_name: "Microsoft Yunjian Online (Natural) - Chinese (Mainland)".to_string(),
            locale: "zh-CN".to_string(),
            gender: "Male".to_string(),
        },
        TtsVoice {
            short_name: "zh-CN-YunxiNeural".to_string(),
            friendly_name: "Microsoft Yunxi Online (Natural) - Chinese (Mainland)".to_string(),
            locale: "zh-CN".to_string(),
            gender: "Male".to_string(),
        },
        TtsVoice {
            short_name: "zh-CN-YunxiaNeural".to_string(),
            friendly_name: "Microsoft Yunxia Online (Natural) - Chinese (Mainland)".to_string(),
            locale: "zh-CN".to_string(),
            gender: "Male".to_string(),
        },
        TtsVoice {
            short_name: "zh-CN-YunyangNeural".to_string(),
            friendly_name: "Microsoft Yunyang Online (Natural) - Chinese (Mainland)".to_string(),
            locale: "zh-CN".to_string(),
            gender: "Male".to_string(),
        },
        TtsVoice {
            short_name: "zh-CN-liaoning-XiaobeiNeural".to_string(),
            friendly_name: "Microsoft Xiaobei Online (Natural) - Chinese (Northeastern Mandarin)"
                .to_string(),
            locale: "zh-CN-liaoning".to_string(),
            gender: "Female".to_string(),
        },
        TtsVoice {
            short_name: "zh-CN-shaanxi-XiaoniNeural".to_string(),
            friendly_name: "Microsoft Xiaoni Online (Natural) - Chinese (Zhongyuan Mandarin Shaanxi)"
                .to_string(),
            locale: "zh-CN-shaanxi".to_string(),
            gender: "Female".to_string(),
        },
        TtsVoice {
            short_name: "zh-HK-HiuGaaiNeural".to_string(),
            friendly_name: "Microsoft HiuGaai Online (Natural) - Chinese (Cantonese Traditional)"
                .to_string(),
            locale: "zh-HK".to_string(),
            gender: "Female".to_string(),
        },
        TtsVoice {
            short_name: "zh-HK-HiuMaanNeural".to_string(),
            friendly_name: "Microsoft HiuMaan Online (Natural) - Chinese (Hong Kong SAR)".to_string(),
            locale: "zh-HK".to_string(),
            gender: "Female".to_string(),
        },
        TtsVoice {
            short_name: "zh-HK-WanLungNeural".to_string(),
            friendly_name: "Microsoft WanLung Online (Natural) - Chinese (Hong Kong SAR)".to_string(),
            locale: "zh-HK".to_string(),
            gender: "Male".to_string(),
        },
        TtsVoice {
            short_name: "zh-TW-HsiaoChenNeural".to_string(),
            friendly_name: "Microsoft HsiaoChen Online (Natural) - Chinese (Taiwan)".to_string(),
            locale: "zh-TW".to_string(),
            gender: "Female".to_string(),
        },
        TtsVoice {
            short_name: "zh-TW-HsiaoYuNeural".to_string(),
            friendly_name: "Microsoft HsiaoYu Online (Natural) - Chinese (Taiwanese Mandarin)"
                .to_string(),
            locale: "zh-TW".to_string(),
            gender: "Female".to_string(),
        },
        TtsVoice {
            short_name: "zh-TW-YunJheNeural".to_string(),
            friendly_name: "Microsoft YunJhe Online (Natural) - Chinese (Taiwan)".to_string(),
            locale: "zh-TW".to_string(),
            gender: "Male".to_string(),
        },
        TtsVoice {
            short_name: "en-US-AndrewNeural".to_string(),
            friendly_name: "Microsoft Andrew Online (Natural) - English (United States)".to_string(),
            locale: "en-US".to_string(),
            gender: "Male".to_string(),
        },
        TtsVoice {
            short_name: "en-US-AvaNeural".to_string(),
            friendly_name: "Microsoft Ava Online (Natural) - English (United States)".to_string(),
            locale: "en-US".to_string(),
            gender: "Female".to_string(),
        },
        TtsVoice {
            short_name: "en-US-EmmaNeural".to_string(),
            friendly_name: "Microsoft Emma Online (Natural) - English (United States)".to_string(),
            locale: "en-US".to_string(),
            gender: "Female".to_string(),
        },
        TtsVoice {
            short_name: "ja-JP-KeitaNeural".to_string(),
            friendly_name: "Microsoft Keita Online (Natural) - Japanese (Japan)".to_string(),
            locale: "ja-JP".to_string(),
            gender: "Male".to_string(),
        },
        TtsVoice {
            short_name: "ja-JP-NanamiNeural".to_string(),
            friendly_name: "Microsoft Nanami Online (Natural) - Japanese (Japan)".to_string(),
            locale: "ja-JP".to_string(),
            gender: "Female".to_string(),
        },
    ];
    sort_voices_default(&mut voices);
    voices
}
