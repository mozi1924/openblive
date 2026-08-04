use anyhow::{anyhow, Result};
use edge_tts_rust::{EdgeTtsClient, SpeakOptions, SynthesisEvent};
use futures_util::StreamExt;
use rodio::cpal::traits::{DeviceTrait, HostTrait};
use rodio::{Decoder, OutputStream, Sink};
use serde::{Deserialize, Serialize};
use std::io::{Read, Seek, SeekFrom};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex, OnceLock};
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
    /// Where the task came from: "test" or "danmu".
    pub source: String,
    /// Generation counter used to invalidate queued tasks after a stop.
    pub epoch: u64,
}

static TTS_TX: OnceLock<mpsc::Sender<TtsSpeechTask>> = OnceLock::new();
static CLIENT_CACHE: OnceLock<Arc<Mutex<Option<EdgeTtsClient>>>> = OnceLock::new();

/// App handle used to emit `tts-playback` state events to the frontend.
static TTS_APP: OnceLock<tauri::AppHandle> = OnceLock::new();

/// Sink of the speech that is currently being played (if any). Lets a
/// `stop` request abort playback immediately instead of only draining the
/// queue.
static CURRENT_SINK: OnceLock<Arc<Mutex<Option<Arc<Sink>>>>> = OnceLock::new();

/// Generation counter. Bumped on every stop / test replay so tasks queued
/// before the stop are skipped by the worker and never played.
static PLAY_EPOCH: AtomicU64 = AtomicU64::new(0);

pub fn set_app_handle(app: &tauri::AppHandle) {
    let _ = TTS_APP.set(app.clone());
}

fn emit_playback_state(playing: bool, source: &str) {
    if let Some(app) = TTS_APP.get() {
        crate::state_event::emit_tts_playback_state(app, playing, source);
    }
}

fn get_current_sink() -> &'static Arc<Mutex<Option<Arc<Sink>>>> {
    CURRENT_SINK.get_or_init(|| Arc::new(Mutex::new(None)))
}

fn stop_current_sink() {
    if let Ok(guard) = get_current_sink().lock() {
        if let Some(sink) = guard.as_ref() {
            sink.stop();
        }
    }
}

/// Stops any currently playing speech (not paused) and invalidates all tasks
/// still waiting in the queue. The next `enqueue_test_speech` call plays
/// from the start again.
pub fn stop_tts() {
    PLAY_EPOCH.fetch_add(1, Ordering::SeqCst);
    stop_current_sink();
    emit_playback_state(false, "test");
}

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
            // Tasks enqueued before a stop were invalidated; skip them so a
            // stale queue can never start playing again after a stop.
            if task.epoch != PLAY_EPOCH.load(Ordering::SeqCst) {
                continue;
            }
            emit_playback_state(true, &task.source);
            let source = task.source.clone();
            if let Err(err) = process_speech_task(task).await {
                crate::runtime_warn!("[tts] speech processing error: {err}");
            }
            emit_playback_state(false, &source);
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
    // applied on the rodio Sink in `play_streamed_chunks`, not an Edge TTS
    // relative adjustment, so it is kept out of `SpeakOptions`.
    let options = SpeakOptions {
        voice: voice_name,
        rate,
        pitch,
        ..Default::default()
    };

    // Stream the synthesis: audio chunks are appended to a shared buffer as
    // they arrive and decoded by a single continuous MP3 decoder, so the
    // utterance starts playing as soon as the prebuffer fills instead of
    // waiting for the whole stream to be synthesized.
    let mut stream = client
        .stream(task.text.clone(), options)
        .await
        .map_err(|e| anyhow!("TTS stream init error: {e}"))?;

    let device_name = task.device.clone();
    let volume = task.volume;
    let epoch = task.epoch;

    let buffer = Arc::new(AudioBuffer::new());
    let playback = tokio::task::spawn_blocking({
        let buffer = buffer.clone();
        move || play_streamed_chunks(buffer, epoch, &device_name, volume)
    });

    while let Some(event) = stream.next().await {
        // A stop may have been requested while this task was streaming.
        if epoch != PLAY_EPOCH.load(Ordering::SeqCst) {
            break;
        }
        let SynthesisEvent::Audio(chunk) = event
            .map_err(|e| anyhow!("TTS stream read error: {e}"))?
        else {
            continue;
        };
        buffer.append(&chunk);
    }
    // Signal EOF so the playback thread can finish decoding the tail.
    buffer.finish();

    playback
        .await
        .map_err(|e| anyhow!("TTS playback task panicked: {e}"))??;

    Ok(())
}

/// Prebuffer threshold in bytes. Edge TTS chunks are 720 B ≈ 0.12 s of audio
/// at 24 kHz, so this is roughly 0.96 s of buffered audio — enough to absorb
/// network jitter while keeping first-word latency far below buffering the
/// whole utterance.
const PREBUFFER_BYTES: usize = 5760;

/// Grow-only byte buffer shared between the network loop (writer) and the
/// playback thread (reader). Reads block until data is available or EOF.
struct AudioBuffer {
    data: Mutex<Vec<u8>>,
    cond: Condvar,
    eof: AtomicBool,
}

impl AudioBuffer {
    fn new() -> Self {
        Self {
            data: Mutex::new(Vec::new()),
            cond: Condvar::new(),
            eof: AtomicBool::new(false),
        }
    }

    fn append(&self, bytes: &[u8]) {
        let mut data = self.data.lock().unwrap_or_else(|p| p.into_inner());
        data.extend_from_slice(bytes);
        self.cond.notify_all();
    }

    /// Signals end-of-stream; blocked readers return EOF instead of waiting.
    fn finish(&self) {
        self.eof.store(true, Ordering::SeqCst);
        self.cond.notify_all();
    }

    /// Blocks until at least `min_bytes` have been appended or EOF is set.
    fn wait_ready(&self, min_bytes: usize) {
        let mut data = self.data.lock().unwrap_or_else(|p| p.into_inner());
        while data.len() < min_bytes && !self.eof.load(Ordering::SeqCst) {
            data = self.cond.wait(data).unwrap_or_else(|p| p.into_inner());
        }
    }
}

/// `Read + Seek` view over an `AudioBuffer`, consumed by the MP3 decoder.
/// `seek` only moves within data received so far (the decoder probes and
/// rewinds at the start; it never jumps ahead of the stream).
struct StreamingAudioSource {
    buffer: Arc<AudioBuffer>,
    pos: usize,
}

impl Read for StreamingAudioSource {
    fn read(&mut self, out: &mut [u8]) -> std::io::Result<usize> {
        loop {
            let mut data = self.buffer.data.lock().unwrap_or_else(|p| p.into_inner());
            if self.pos < data.len() {
                let n = out.len().min(data.len() - self.pos);
                out[..n].copy_from_slice(&data[self.pos..self.pos + n]);
                self.pos += n;
                return Ok(n);
            }
            if self.buffer.eof.load(Ordering::SeqCst) {
                return Ok(0);
            }
            data = self.buffer.cond.wait(data).unwrap_or_else(|p| p.into_inner());
        }
    }
}

impl Seek for StreamingAudioSource {
    fn seek(&mut self, pos: SeekFrom) -> std::io::Result<u64> {
        let data = self.buffer.data.lock().unwrap_or_else(|p| p.into_inner());
        let len = data.len();
        let new_pos = match pos {
            SeekFrom::Start(p) => p as usize,
            SeekFrom::Current(delta) => (self.pos as i64 + delta).max(0) as usize,
            SeekFrom::End(delta) => (len as i64 + delta).max(0) as usize,
        };
        self.pos = new_pos.min(len);
        Ok(self.pos as u64)
    }
}

/// Opens the audio output, waits for the prebuffer, then decodes the shared
/// byte buffer with a single continuous MP3 decoder so playback is gapless.
fn play_streamed_chunks(
    buffer: Arc<AudioBuffer>,
    epoch: u64,
    device_name: &str,
    volume_pct: u8,
) -> Result<()> {
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

    let sink = Arc::new(
        Sink::try_new(&stream_handle).map_err(|e| anyhow!("Failed to create audio Sink: {e}"))?,
    );

    // Register the sink so a stop request can abort playback immediately.
    if let Ok(mut guard) = get_current_sink().lock() {
        *guard = Some(sink.clone());
    }

    let vol = (volume_pct.min(100) as f32) / 100.0;
    sink.set_volume(vol);

    // Wait for enough audio before starting so network bursts cannot starve
    // the sink mid-playback.
    buffer.wait_ready(PREBUFFER_BYTES);

    // A stop may have been requested while prebuffering; do not start playing.
    if epoch != PLAY_EPOCH.load(Ordering::SeqCst) {
        return Ok(());
    }

    let source = StreamingAudioSource {
        buffer,
        pos: 0,
    };
    let decoder =
        Decoder::new_mp3(source).map_err(|e| anyhow!("Failed to create MP3 decoder: {e}"))?;
    sink.append(decoder);
    sink.sleep_until_end();

    // Release the sink slot, but only if it still points at this session.
    if let Ok(mut guard) = get_current_sink().lock() {
        if guard.as_ref().map(|s| Arc::ptr_eq(s, &sink)).unwrap_or(false) {
            *guard = None;
        }
    }

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
            source: "danmu".to_string(),
            epoch: PLAY_EPOCH.load(Ordering::SeqCst),
        };
        let _ = tx.try_send(task);
    }
}

pub fn enqueue_test_speech(config: &crate::models::PersistConfig, custom_text: Option<String>) {
    init_tts_worker();
    // Invalidate any still-queued speech and cut off the current playback so
    // the test speech starts right away (fresh from the beginning).
    let epoch = PLAY_EPOCH.fetch_add(1, Ordering::SeqCst) + 1;
    stop_current_sink();
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
            source: "test".to_string(),
            epoch,
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
