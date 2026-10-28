#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod app;
mod tool_cache;
mod legacy_companions;
mod live_mcc;
mod steam_bridge;
fn main() {
    app::run();
}
