#[macro_export]
macro_rules! runtime_info {
    ($($arg:tt)*) => {
        tauri_plugin_log::log::info!($($arg)*);
    };
}

#[macro_export]
macro_rules! runtime_warn {
    ($($arg:tt)*) => {
        tauri_plugin_log::log::warn!($($arg)*);
    };
}

#[macro_export]
macro_rules! runtime_error {
    ($($arg:tt)*) => {
        tauri_plugin_log::log::error!($($arg)*);
    };
}

#[macro_export]
macro_rules! runtime_log {
    ($($arg:tt)*) => {
        $crate::runtime_info!($($arg)*);
    };
}
