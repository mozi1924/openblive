pub mod engine;
pub mod player;
pub mod queue;
pub mod types;
pub mod voices;

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::OnceLock;

#[allow(unused_imports)]
pub use player::list_audio_output_devices;
#[allow(unused_imports)]
pub use types::{TtsPriority, TtsSpeechTask, TtsVoice};
#[allow(unused_imports)]
pub use voices::{list_supported_voices, list_voices_dynamic};

static TTS_APP: OnceLock<tauri::AppHandle> = OnceLock::new();
static PLAY_EPOCH: AtomicU64 = AtomicU64::new(0);
static WORKER_STARTED: AtomicBool = AtomicBool::new(false);

pub fn set_app_handle(app: &tauri::AppHandle) {
    let _ = TTS_APP.set(app.clone());
}

fn emit_playback_state(playing: bool, source: &str) {
    if let Some(app) = TTS_APP.get() {
        crate::state_event::emit_tts_playback_state(app, playing, source);
    }
}

pub fn stop_tts() {
    PLAY_EPOCH.fetch_add(1, Ordering::SeqCst);
    player::stop_current_sink();
    queue::TtsQueueManager::global().clear();
    emit_playback_state(false, "test");
}

pub fn init_tts_worker() {
    if WORKER_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }

    tauri::async_runtime::spawn(async move {
        let q_mgr = queue::TtsQueueManager::global();
        loop {
            let task = q_mgr.pop().await;
            if task.text.trim().is_empty() {
                continue;
            }
            if task.epoch != PLAY_EPOCH.load(Ordering::SeqCst) {
                continue;
            }
            emit_playback_state(true, &task.source);
            let source = task.source.clone();
            if let Err(err) = engine::process_speech_task(task, &PLAY_EPOCH).await {
                crate::runtime_warn!("[tts] speech processing error: {err}");
            }
            emit_playback_state(false, &source);
        }
    });
}

pub fn enqueue_speech_with_priority(
    config: &crate::models::PersistConfig,
    text: String,
    priority: TtsPriority,
) {
    if !config.tts_enabled || text.trim().is_empty() {
        return;
    }
    init_tts_worker();

    let q_mgr = queue::TtsQueueManager::global();
    if !q_mgr.should_accept_speech(config, priority) {
        return;
    }

    let task = TtsSpeechTask {
        text,
        voice: config.tts_voice.clone(),
        rate: config.tts_rate.clone(),
        pitch: config.tts_pitch.clone(),
        volume: config.tts_volume,
        device: config.tts_device.clone(),
        source: "danmu".to_string(),
        priority,
        task_id: 0,
        epoch: PLAY_EPOCH.load(Ordering::SeqCst),
    };

    q_mgr.push(task);
}

#[allow(dead_code)]
pub fn enqueue_speech(config: &crate::models::PersistConfig, text: String) {
    enqueue_speech_with_priority(config, text, TtsPriority::Normal);
}

pub fn enqueue_test_speech(config: &crate::models::PersistConfig, custom_text: Option<String>) {
    init_tts_worker();
    let epoch = PLAY_EPOCH.fetch_add(1, Ordering::SeqCst) + 1;
    player::stop_current_sink();

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
        priority: TtsPriority::High,
        task_id: 0,
        epoch,
    };

    queue::TtsQueueManager::global().push(task);
}
