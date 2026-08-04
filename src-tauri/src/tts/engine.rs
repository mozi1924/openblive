use anyhow::{anyhow, Result};
use edge_tts_rust::{EdgeTtsClient, SpeakOptions};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use super::player::play_audio;
use super::types::TtsSpeechTask;

static CLIENT_CACHE: OnceLock<Arc<Mutex<Option<EdgeTtsClient>>>> = OnceLock::new();

pub fn get_client_cache() -> &'static Arc<Mutex<Option<EdgeTtsClient>>> {
    CLIENT_CACHE.get_or_init(|| Arc::new(Mutex::new(None)))
}

pub fn get_or_create_client() -> Result<EdgeTtsClient> {
    let cache = get_client_cache();
    let mut guard = cache.lock().unwrap_or_else(|p| p.into_inner());
    if let Some(ref client) = *guard {
        return Ok(client.clone());
    }
    let new_client =
        EdgeTtsClient::new().map_err(|e| anyhow!("Failed to init EdgeTtsClient: {e}"))?;
    *guard = Some(new_client.clone());
    Ok(new_client)
}

pub async fn process_speech_task(
    task: TtsSpeechTask,
    play_epoch: &'static AtomicU64,
) -> Result<()> {
    let client = get_or_create_client()?;

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

    let options = SpeakOptions {
        voice: voice_name,
        rate,
        pitch,
        ..Default::default()
    };

    // Do not expose the network stream directly to rodio. Rodio pulls samples on
    // its real-time audio thread; a Read implementation that waits for the next
    // websocket chunk can therefore starve the output callback and cause audible
    // stutters. edge-tts-rust collects the websocket stream asynchronously here,
    // then rodio receives an in-memory MP3 source with non-blocking reads.
    let result = client
        .synthesize(task.text.clone(), options)
        .await
        .map_err(|e| anyhow!("TTS synthesis error: {e}"))?;

    if task.epoch != play_epoch.load(Ordering::SeqCst) {
        return Ok(());
    }

    let device_name = task.device.clone();
    let volume = task.volume;
    let epoch = task.epoch;

    play_audio(result.audio, epoch, play_epoch, &device_name, volume)?;

    Ok(())
}
