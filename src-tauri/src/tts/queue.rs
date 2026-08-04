use std::collections::{BinaryHeap, VecDeque};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tokio::sync::Notify;

use super::types::{TtsPriority, TtsSpeechTask};
use crate::models::PersistConfig;

static NEXT_TASK_ID: AtomicU64 = AtomicU64::new(1);
static QUEUE_MANAGER: OnceLock<TtsQueueManager> = OnceLock::new();

pub struct TtsQueueManager {
    queue: Mutex<BinaryHeap<TtsSpeechTask>>,
    notify: Notify,
    history: Mutex<VecDeque<Instant>>,
}

impl TtsQueueManager {
    pub fn global() -> &'static TtsQueueManager {
        QUEUE_MANAGER.get_or_init(|| TtsQueueManager {
            queue: Mutex::new(BinaryHeap::new()),
            notify: Notify::new(),
            history: Mutex::new(VecDeque::new()),
        })
    }

    /// Record message arrival and return current message frequency (msgs / sec in 5s window).
    pub fn record_and_check_frequency(&self) -> f64 {
        let now = Instant::now();
        let mut history = self.history.lock().unwrap_or_else(|p| p.into_inner());
        history.push_back(now);
        while let Some(&t) = history.front() {
            if now.duration_since(t) > Duration::from_secs(5) {
                history.pop_front();
            } else {
                break;
            }
        }
        history.len() as f64 / 5.0
    }

    /// Check whether a message with the given priority should be accepted for speech.
    /// If `tts_auto_priority_mode` is enabled and message rate exceeds threshold,
    /// normal priority messages are suppressed.
    pub fn should_accept_speech(&self, config: &PersistConfig, priority: TtsPriority) -> bool {
        if priority == TtsPriority::High {
            return true;
        }

        let rate = self.record_and_check_frequency();
        if !config.tts_auto_priority_mode {
            return true;
        }

        let threshold = config.tts_high_freq_threshold.max(1) as f64;
        let pending_count = {
            let q = self.queue.lock().unwrap_or_else(|p| p.into_inner());
            q.len()
        };

        if rate > threshold || pending_count >= 10 {
            crate::runtime_log!(
                "[tts] High message frequency detected ({:.1} msg/s, queue: {}). Auto-shedding normal priority speech.",
                rate,
                pending_count
            );
            return false;
        }

        true
    }

    pub fn push(&self, mut task: TtsSpeechTask) {
        task.task_id = NEXT_TASK_ID.fetch_add(1, Ordering::SeqCst);
        let mut q = self.queue.lock().unwrap_or_else(|p| p.into_inner());
        q.push(task);
        self.notify.notify_one();
    }

    pub async fn pop(&self) -> TtsSpeechTask {
        loop {
            {
                let mut q = self.queue.lock().unwrap_or_else(|p| p.into_inner());
                if let Some(task) = q.pop() {
                    return task;
                }
            }
            self.notify.notified().await;
        }
    }

    pub fn clear(&self) {
        let mut q = self.queue.lock().unwrap_or_else(|p| p.into_inner());
        q.clear();
    }
}
