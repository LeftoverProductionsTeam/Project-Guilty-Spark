//! Export original arena sources and an executable, dependency-aware command plan.
//! Usage: cargo run -p spark-core --example qa_quickforge -- <fresh-output-directory>
use spark_core::quickforge::{self, ForgePlacement};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let output = std::env::args_os()
        .nth(1)
        .ok_or("Supply a fresh output directory")?;
    let mut doc = quickforge::create_arena("Guilty Spark Test Arena", "smallIndoorArena")?;
    if std::env::args().any(|a| a == "--schema-fixture") {
        // These names deliberately describe parser fixtures, never playable assets.
        doc.sky_path = Some("fixtures\\sky".into());
        doc.materials[0].shader_path = Some("fixtures\\surface".into());
        for (i, class) in ["scen", "weap", "eqip", "vehi", "bipd", "itmc"]
            .into_iter()
            .enumerate()
        {
            doc.placements.push(ForgePlacement {
                id: format!("fixture-{i}"),
                name: format!("Schema fixture {class}"),
                tag_path: format!("fixtures\\asset_{class}"),
                tag_class: class.into(),
                position: [-8.0 + i as f32 * 2.0, 0.0, 0.1],
                rotation: [0.1, 0.2, 0.3],
                team: 0,
                respawn_seconds: 30,
                tag_id: None,
                source_project_id: None,
                source_sha256: None,
                visible: true,
                locked: false,
            });
        }
        for (i, kind) in ["ctfFlag", "hill", "oddball", "raceCheckpoint"]
            .into_iter()
            .enumerate()
        {
            doc.objectives.push(quickforge::ForgeObjective {
                id: format!("objective-{i}"),
                name: kind.into(),
                kind: kind.into(),
                position: [0., -10. + i as f32, 0.1],
                facing: 0.4,
                team: 0,
                sequence: i as u16,
                visible: true,
                locked: false,
            });
        }
    }
    let export = quickforge::export_sources(&doc, std::path::Path::new(&output))?;
    println!("{}", serde_json::to_string_pretty(&export)?);
    Ok(())
}
