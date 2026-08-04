use anyhow::{anyhow, Result};
use rodio::cpal::traits::{DeviceTrait, HostTrait};
use rodio::{Decoder, OutputStream, Sink, Source};
use std::io::Cursor;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, OnceLock};

struct AudioSession {
    // The stream must outlive the Sink; dropping it stops playback immediately.
    _stream: OutputStream,
    sink: Arc<Sink>,
    device_name: String,
}

enum PlayerCommand {
    Play {
        audio: Vec<u8>,
        device_name: String,
        volume: f32,
        response: Sender<Result<()>>,
    },
    Stop,
}

static PLAYER_COMMANDS: OnceLock<Sender<PlayerCommand>> = OnceLock::new();

fn player_commands() -> &'static Sender<PlayerCommand> {
    PLAYER_COMMANDS.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<PlayerCommand>();
        std::thread::Builder::new()
            .name("tts-audio-output".to_string())
            .spawn(move || {
                // CoreAudio's OutputStream is deliberately !Send on macOS, so
                // this thread owns it for its complete lifetime.
                let mut session: Option<AudioSession> = None;
                while let Ok(command) = rx.recv() {
                    match command {
                        PlayerCommand::Stop => {
                            if let Some(active) = session.take() {
                                active.sink.stop();
                            }
                        }
                        PlayerCommand::Play {
                            audio,
                            device_name,
                            volume,
                            response,
                        } => {
                            let result = (|| -> Result<()> {
                                if session
                                    .as_ref()
                                    .map(|active| active.device_name != device_name)
                                    .unwrap_or(true)
                                {
                                    // Device changes cannot migrate queued audio.
                                    if let Some(active) = session.take() {
                                        active.sink.stop();
                                    }
                                    session = Some(open_session(&device_name)?);
                                }
                                let decoder = Decoder::new_mp3(Cursor::new(audio))
                                    .map_err(|e| anyhow!("Failed to create MP3 decoder: {e}"))?;
                                session
                                    .as_ref()
                                    .expect("audio session was created above")
                                    .sink
                                    .append(decoder.amplify(volume));
                                Ok(())
                            })();
                            let _ = response.send(result);
                        }
                    }
                }
            })
            .expect("failed to start TTS audio output thread");
        tx
    })
}

pub fn stop_current_sink() {
    let _ = player_commands().send(PlayerCommand::Stop);
}

fn open_session(device_name: &str) -> Result<AudioSession> {
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

    let (stream, stream_handle) = match selected_device {
        Some(dev) => OutputStream::try_from_device(&dev)
            .or_else(|_| OutputStream::try_default())
            .map_err(|e| anyhow!("Failed to open audio output stream: {e}"))?,
        None => OutputStream::try_default()
            .map_err(|e| anyhow!("Failed to open default audio output stream: {e}"))?,
    };
    let sink = Arc::new(
        Sink::try_new(&stream_handle).map_err(|e| anyhow!("Failed to create audio Sink: {e}"))?,
    );

    Ok(AudioSession {
        _stream: stream,
        sink,
        device_name: device_name.to_string(),
    })
}

/// Opens the audio output and plays a fully synthesized MP3. The decoder only
/// reads from memory, so the real-time output callback can never block on TTS
/// network traffic.
pub fn play_audio(
    audio: Vec<u8>,
    epoch: u64,
    play_epoch: &AtomicU64,
    device_name: &str,
    volume_pct: u8,
) -> Result<()> {
    if audio.is_empty() {
        return Err(anyhow!("TTS returned no audio"));
    }
    // A stop may have been requested while synthesis was in progress.
    if epoch != play_epoch.load(Ordering::SeqCst) {
        return Ok(());
    }

    let volume = (volume_pct.min(100) as f32) / 100.0;
    let (response_tx, response_rx) = mpsc::channel();
    player_commands()
        .send(PlayerCommand::Play {
            audio,
            device_name: device_name.to_string(),
            volume,
            response: response_tx,
        })
        .map_err(|_| anyhow!("TTS audio output thread has stopped"))?;
    response_rx
        .recv()
        .map_err(|_| anyhow!("TTS audio output thread did not respond"))??;

    Ok(())
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
