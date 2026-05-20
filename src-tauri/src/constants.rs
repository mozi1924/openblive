pub const DEFAULT_APP_KEY: &str = "aae92bc66f3edfab";
pub const DEFAULT_APP_SEC: &str = "af125a0d5279fd576c1b4418a3e8276d";
pub const DEFAULT_HTTP_USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";
pub const DEFAULT_LIVEHIME_VERSION: &str = "7.54.0.10521";
pub const DEFAULT_LIVEHIME_BUILD: u64 = 10521;
pub const DEFAULT_LIVE_PLATFORM: &str = "pc_link";

pub type CmdResult = std::result::Result<serde_json::Value, String>;
