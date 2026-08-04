use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TtsVoice {
    pub short_name: String,
    pub friendly_name: String,
    pub locale: String,
    pub gender: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum TtsPriority {
    Normal = 0,
    High = 1,
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
    /// Priority tier: Normal or High.
    pub priority: TtsPriority,
    /// Task sequence ID to maintain FIFO order among tasks with equal priority.
    pub task_id: u64,
    /// Generation counter used to invalidate queued tasks after a stop.
    pub epoch: u64,
}

impl PartialEq for TtsSpeechTask {
    fn eq(&self, other: &Self) -> bool {
        self.priority == other.priority && self.task_id == other.task_id
    }
}

impl Eq for TtsSpeechTask {}

impl PartialOrd for TtsSpeechTask {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for TtsSpeechTask {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        // BinaryHeap is a Max-Heap.
        // Higher priority comes out first. For equal priority, lower task_id (earlier task) comes out first.
        self.priority
            .cmp(&other.priority)
            .then_with(|| other.task_id.cmp(&self.task_id))
    }
}
