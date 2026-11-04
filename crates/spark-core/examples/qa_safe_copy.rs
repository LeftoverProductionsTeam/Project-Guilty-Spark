//! Private engineering helper: all recursive QA copies use the same native
//! path admission, quota ledger, leases and atomic file adoption as production.
use spark_core::{native_staging, Result};
use std::{
    io::{Read, Write},
    path::PathBuf,
    sync::atomic::AtomicBool,
};
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    source: PathBuf,
    destination: PathBuf,
    plan: native_staging::Inventory,
    max_bytes: u64,
}
fn run() -> Result<()> {
    let mut bytes = vec![];
    std::io::stdin()
        .take(32 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > 32 * 1024 * 1024 {
        return Err(spark_core::SparkError::Invalid(
            "QA copy request exceeds 32 MiB".into(),
        ));
    }
    let r: Request = serde_json::from_slice(&bytes)?;
    let sum = r
        .plan
        .files
        .iter()
        .try_fold(0u64, |n, f| n.checked_add(f.bytes))
        .ok_or_else(|| spark_core::SparkError::Invalid("QA copy overflow".into()))?;
    if sum != r.plan.bytes
        || sum > r.max_bytes
        || r.max_bytes > 4 * 1024 * 1024 * 1024
        || r.plan.files.len() > 200000
    {
        return Err(spark_core::SparkError::Invalid(
            "QA copy exceeds its explicitly configured budget".into(),
        ));
    }
    let hashes = native_staging::copy(
        &r.source,
        &r.destination,
        &r.plan,
        &AtomicBool::new(false),
        |_, _, _, _| {},
    )?;
    std::io::stdout().write_all(&serde_json::to_vec(&serde_json::json!({"files":hashes.len(),"bytes":sum,"sourceHashes":hashes,"mutableHardlinks":false}))?)?;
    Ok(())
}
fn main() {
    if std::env::args().nth(1).as_deref() == Some("--measure") {
        let root = PathBuf::from(std::env::args_os().nth(2).expect("source path"));
        let time = std::time::Instant::now();
        let slow = spark_core::storage::measure(&root).expect("read-only allocation inventory");
        let full = time.elapsed().as_millis();
        let time = std::time::Instant::now();
        let estimate = spark_core::storage::estimate_tree(&root).expect("bounded polling estimate");
        println!(
            "{}",
            serde_json::json!({"readOnly":true,"root":root,"fullInventoryMs":full,"boundedPollMs":time.elapsed().as_millis(),"measurement":slow,"pollReservedCost":estimate})
        );
        return;
    }
    if let Err(e) = run() {
        eprintln!("QA copy refused: {e}");
        std::process::exit(1);
    }
}
