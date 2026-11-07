// Opt-in, read-only QA for the exact publisher OpenCE builds335/343 and matching
// private PDB. Does not inject, patch, launch, transmit game bytes, or execute
// remote commands. Upstream engine source is not included in this example.
// Usage: cargo run -p guilty-spark --example qa_opence_ai -- <owned test exe>
// <verified symbols directory> [<owned process id> <host|client>]
// Position snapshots are not atomic engine/network messages or human acceptance.
#[cfg(windows)]
#[path = "qa_opence_ai/symbols.rs"]
mod symbols;
#[cfg(windows)]
fn main() {
    symbols::run();
}
#[cfg(not(windows))]
fn main() {
    eprintln!("This opt-in native observer requires Windows.");
    std::process::exit(1);
}
