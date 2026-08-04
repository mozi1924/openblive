use anyhow::{anyhow, Result};
use edge_tts_rust::{EdgeTtsClient, SpeakOptions, SynthesisEvent};
use futures_util::StreamExt;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use super::player::{play_streamed_chunks, AudioBuffer};
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
    let new_client = EdgeTtsClient::new().map_err(|e| anyhow!("Failed to init EdgeTtsClient: {e}"))?;
    *guard = Some(new_client.clone());
    Ok(new_client)
}

pub async fn process_speech_task(task: TtsSpeechTask, play_epoch: &'static AtomicU64) -> Result<()> {
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
        move || play_streamed_chunks(buffer, epoch, play_epoch, &device_name, volume)
    });

    while let Some(event) = stream.next().await {
        if epoch != play_epoch.load(Ordering::SeqCst) {
            break;
        }
        let SynthesisEvent::Audio(chunk) = event
            .map_err(|e| anyhow!("TTS stream read error: {e}"))?
        else {
            continue;
        };
        buffer.append(&chunk);
    }
    buffer.finish();

    playback
        .await
        .map_err(|e| anyhow!("TTS playback task panicked: {e}"))??;

    Ok(())
}
