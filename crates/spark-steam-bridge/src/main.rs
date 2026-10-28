//! Separate Steam test process. The editor and Halo keep their own app identities.
#[cfg(windows)]
mod windows;
#[cfg(windows)]
fn main() {
    if let Err(error) = windows::run() {
        eprintln!("Spark Steam bridge: {error}");
        std::process::exit(1);
    }
}
#[cfg(not(windows))]
fn main() {
    eprintln!("The Steam bridge currently requires Windows");
    std::process::exit(1);
}
