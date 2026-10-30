//! Real owner-run player walkthrough. Native compilation does not pre-fill a pass.
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let a: Vec<_> = std::env::args().collect();
    if a.len() != 3 {
        return Err("qa_bsp_workshop_playtest <acceptance.json> <H1A kit>".into());
    }
    let bytes = std::fs::read(&a[1])?;
    if bytes.len() > 8 * 1024 * 1024 {
        return Err("Acceptance receipt exceeds limit".into());
    }
    let value: serde_json::Value = serde_json::from_slice(&bytes)?;
    let receipt: spark_core::forge_build::QuickForgeBuildReceipt =
        serde_json::from_value(value.get("receipt").ok_or("No native receipt")?.clone())?;
    #[cfg(windows)]
    spark_core::forge_build::workshop_playtest(&receipt, std::path::Path::new(&a[2]))?;
    #[cfg(not(windows))]
    return Err("The installed Windows Standalone is required".into());
    Ok(())
}
