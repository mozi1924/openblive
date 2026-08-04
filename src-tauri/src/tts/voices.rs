use std::sync::Arc;
use tokio::sync::Mutex;
use std::sync::OnceLock;

use super::engine::get_or_create_client;
use super::types::TtsVoice;

static FETCHED_VOICES_CACHE: OnceLock<Arc<Mutex<Option<Vec<TtsVoice>>>>> = OnceLock::new();

fn get_voices_cache() -> &'static Arc<Mutex<Option<Vec<TtsVoice>>>> {
    FETCHED_VOICES_CACHE.get_or_init(|| Arc::new(Mutex::new(None)))
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

/// Fallback voice list used only when the live voice list cannot be fetched offline.
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
            friendly_name: "Microsoft Xiaobei Online (Natural) - Chinese (Northeastern Mandarin)".to_string(),
            locale: "zh-CN-liaoning".to_string(),
            gender: "Female".to_string(),
        },
        TtsVoice {
            short_name: "zh-CN-shaanxi-XiaoniNeural".to_string(),
            friendly_name: "Microsoft Xiaoni Online (Natural) - Chinese (Zhongyuan Mandarin Shaanxi)".to_string(),
            locale: "zh-CN-shaanxi".to_string(),
            gender: "Female".to_string(),
        },
        TtsVoice {
            short_name: "zh-HK-HiuGaaiNeural".to_string(),
            friendly_name: "Microsoft HiuGaai Online (Natural) - Chinese (Cantonese Traditional)".to_string(),
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
            friendly_name: "Microsoft HsiaoYu Online (Natural) - Chinese (Taiwanese Mandarin)".to_string(),
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
