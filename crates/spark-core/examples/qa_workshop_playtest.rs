//! Explicit owner-run interactive acceptance of an existing verified receipt.
//! Loading or exiting the runtime does not certify player actions.
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let a: Vec<_> = std::env::args_os().collect();
    if a.len() != 3 && !(a.len()==4 && a[3]=="--debug") {
        return Err("qa_workshop_playtest <validated quickforge-receipt.json> <installed H1A kit> [--debug]".into());
    }
    #[cfg(windows)]
    {
        let path = std::path::Path::new(&a[1]);
        spark_core::reject_links(path)?;
        if std::fs::metadata(path)?.len() > 4 * 1024 * 1024 {
            return Err("Receipt exceeds bounded size".into());
        }
        let receipt = serde_json::from_slice(&std::fs::read(path)?)?;
        spark_core::forge_build::workshop_playtest_with_debug(&receipt, std::path::Path::new(&a[2]),a.len()==4)?;
    }
    #[cfg(not(windows))]
    return Err("H1A Standalone acceptance requires Windows".into());
    Ok(())
}
