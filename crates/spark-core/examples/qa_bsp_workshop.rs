//! Owner-run end-to-end Workshop build, using the production isolated compiler.
use spark_core::{
    bsp_workshop as w,
    forge_build::{self, ForgeToolchain},
    project::{self, Project},
    quickforge as q,
};
use std::{
    fs,
    path::Path,
    sync::{atomic::AtomicBool, Arc},
};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let a: Vec<_> = std::env::args().collect();
    if a.len() != 5 && !(a.len() == 6 && a[5] == "--ce") {
        return Err("qa_bsp_workshop <H1A kit> <owned source tags> <Invader> <fresh acceptance directory> [--ce]".into());
    }
    let ce = a.len() == 6;
    let root = Path::new(&a[4]);
    if root.exists() {
        return Err("Acceptance directory must be fresh".into());
    }
    fs::create_dir_all(root)?;
    let mut p = Project::new("BSP Workshop two rooms");
    let mut d = w::example()?;
    d.name = format!("bsp_workshop_{}", &p.id[..8]);
    d.sky_path = Some("levels/test/bloodgulch/bloodgulch".into());
    d.materials[0].name = "example_tutorial_metal_floor".into();
    d.materials[0].shader_path =
        Some("levels/test/tutorial/shaders/example_tutorial_metal_floor".into());
    if ce {
        d.runtime_id = spark_core::runtime::RuntimeId::HaloCustomEdition;
        d.materials[0].name = "cap_metal".into();
        d.materials[0].shader_path = Some("levels/test/bloodgulch/shaders/cap_metal".into());
        let target_id = uuid::Uuid::new_v4().to_string();
        p.active_build_target = Some(target_id.clone());
        p.build_targets.push(project::EngineBuildTarget {
            id: target_id,
            name: "Owner-extracted CE acceptance tagset".into(),
            runtime_id: d.runtime_id,
            builder: "invader-ce".into(),
            hek_directory: Some(a[1].clone().into()),
            hek_flavor: Some("h1aEk".into()),
            tags_directory: Some(a[2].clone().into()),
            invader_directory: Some(a[3].clone().into()),
            ce_compatible_tagset: true,
            open_sauce: false,
        });
    }
    d.materials.push(q::ForgeMaterial {
        id: "portal".into(),
        name: "+exactportal".into(),
        shader_path: None,
        color: [0., 1., 1.],
    });
    d.workshop.as_mut().unwrap().portals = [8., 20.]
        .iter()
        .enumerate()
        .map(|(i, x)| w::Portal {
            id: format!("door-{i}"),
            material_id: "portal".into(),
            points: vec![[*x, -2., 0.], [*x, 2., 0.], [*x, 2., 3.], [*x, -2., 3.]],
        })
        .collect();
    let report = q::validate(&d)?;
    if !report.valid {
        return Err(format!("{:?}", report.issues).into());
    }
    p.quick_forge = Some(d.clone());
    let saved = root.join("workshop.gsproject");
    project::save_project(&saved, &p)?;
    let reopened = project::load_project(&saved)?;
    if reopened.quick_forge != p.quick_forge {
        return Err("Saved Workshop source changed on reopen".into());
    }
    let tools = ForgeToolchain {
        hek_directory: Some(a[1].clone().into()),
        hek_tags_directory: Some(a[2].clone().into()),
        invader_directory: Some(a[3].clone().into()),
        hek_flavor: Some("h1aEk".into()),
    };
    let receipt = forge_build::run_job(
        &reopened,
        &tools,
        root,
        &uuid::Uuid::new_v4().to_string(),
        false,
        vec![],
        Arc::new(AtomicBool::new(false)),
        |e| eprintln!("{}: {}", e.phase, e.message),
    )?;
    fs::write(
        root.join("acceptance.json"),
        serde_json::to_vec_pretty(
            &serde_json::json!({"schemaVersion":1,"kind":"native-bsp-workshop-acceptance","geometry":report,"receipt":receipt,"sourceReopenedExactly":true,"gameplayVerified":false,"runtime":if ce{"halo-custom-edition"}else{"mcc-h1a"},"customEditionBuildVerified":ce&&receipt.status=="validated"}),
        )?,
    )?;
    if receipt.status != "validated" {
        return Err(receipt.blockers.join("\n").into());
    }
    println!("{}", serde_json::to_string_pretty(&receipt)?);
    Ok(())
}
