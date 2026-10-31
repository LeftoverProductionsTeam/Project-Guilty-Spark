//! Owner-selected installed runtime inspection. Never launches or changes the game.
use spark_core::{
    project,
    runtime::{self, RuntimeId, RuntimeRegistration},
};
use std::{fs, path::Path};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let a = std::env::args().skip(1).collect::<Vec<_>>();
    if a.len() != 2 {
        return Err(
            "qa_classic_runtime <installed Halo Custom Edition directory> <fresh report.json>"
                .into(),
        );
    }
    let root = Path::new(&a[0]).canonicalize()?;
    let out = Path::new(&a[1]);
    if out.exists() {
        return Err("Report already exists; refuse overwrite".into());
    }
    let registration = RuntimeRegistration {
        id: "owner-ce-inspection".into(),
        runtime_id: RuntimeId::HaloCustomEdition,
        root: root.clone(),
        executable: root.join("haloce.exe"),
        data_root: Some(root),
        version: None,
        network_version: None,
    };
    let inspection = runtime::inspect_registration(&registration)?;
    let inventory = runtime::inventory_maps(&registration)?;
    let after = runtime::inventory_maps(&registration)?;
    let identical = serde_json::to_value(&inventory)? == serde_json::to_value(&after)?
        && inspection.executable_sha256
            == runtime::inspect_registration(&registration)?.executable_sha256;
    if !identical {
        return Err("Installed files changed during inspection".into());
    }
    if inventory.maps.is_empty()
        || inventory
            .maps
            .iter()
            .any(|m| !m.valid || m.cache_version != Some(609))
    {
        return Err("Installed maps did not all pass native CE cache classification".into());
    }
    let value = serde_json::json!({"schemaVersion":1,"kind":"owner-installed-custom-edition-inventory","registration":registration,"inspection":inspection,"inventory":inventory,"unchangedAcrossRepeatedHashes":identical,"gameLaunched":false,"gameplayVerified":false,"nativeBuilderProven":false});
    project::atomic_write(out, &serde_json::to_vec_pretty(&value)?, false)?;
    println!("PASS installed CE executable and {} native maps; {} pinned shared resources; repeated hashes unchanged; no game launch",inventory.maps.len(),inventory.resources.len());
    let _ = fs::metadata(out)?;
    Ok(())
}
