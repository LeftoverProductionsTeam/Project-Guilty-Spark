#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod app;
mod tool_cache;
mod legacy_companions;
fn main() {
    app::run();
}
