use anyhow::{anyhow, Result};
use rodio::cpal::traits::{DeviceTrait, HostTrait};
use rodio::{Decoder, OutputStream, Sink};
use std::io::{Read, Seek, SeekFrom};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex, OnceLock};

pub const PREBUFFER_BYTES: usize = 5760;

static CURRENT_SINK: OnceLock<Arc<Mutex<Option<Arc<Sink>>>>> = OnceLock::new();

pub fn get_current_sink() -> &'static Arc<Mutex<Option<Arc<Sink>>>> {
    CURRENT_SINK.get_or_init(|| Arc::new(Mutex::new(None)))
}

pub fn stop_current_sink() {
    if let Ok(guard) = get_current_sink().lock() {
        if let Some(sink) = guard.as_ref() {
            sink.stop();
        }
    }
}

/// Grow-only byte buffer shared between the network loop (writer) and the
/// playback thread (reader). Reads block until data is available or EOF.
pub struct AudioBuffer {
    data: Mutex<Vec<u8>>,
    cond: Condvar,
    eof: AtomicBool,
}

impl AudioBuffer {
    pub fn new() -> Self {
        Self {
            data: Mutex::new(Vec::new()),
            cond: Condvar::new(),
            eof: AtomicBool::new(false),
        }
    }

    pub fn append(&self, bytes: &[u8]) {
        let mut data = self.data.lock().unwrap_or_else(|p| p.into_inner());
        data.extend_from_slice(bytes);
        self.cond.notify_all();
    }

    /// Signals end-of-stream; blocked readers return EOF instead of waiting.
    pub fn finish(&self) {
        self.eof.store(true, Ordering::SeqCst);
        self.cond.notify_all();
    }

    /// Blocks until at least `min_bytes` have been appended or EOF is set.
    pub fn wait_ready(&self, min_bytes: usize) {
        let mut data = self.data.lock().unwrap_or_else(|p| p.into_inner());
        while data.len() < min_bytes && !self.eof.load(Ordering::SeqCst) {
            data = self.cond.wait(data).unwrap_or_else(|p| p.into_inner());
        }
    }
}

/// `Read + Seek` view over an `AudioBuffer`, consumed by the MP3 decoder.
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
pub fn play_streamed_chunks(
    buffer: Arc<AudioBuffer>,
    epoch: u64,
    play_epoch: &AtomicU64,
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

    // Wait for enough audio before starting so network bursts cannot starve the sink mid-playback.
    buffer.wait_ready(PREBUFFER_BYTES);

    // A stop may have been requested while prebuffering; do not start playing.
    if epoch != play_epoch.load(Ordering::SeqCst) {
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
