//! Explicit owner-run native custom asset build; does not claim game acceptance.
use spark_core::{
    assets, bsp_workshop,
    forge_build::{self, ForgeToolchain},
    maps, model_build,
    project::{self, Asset, Project},
};
use std::{
    fs,
    path::Path,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, Mutex,
    },
};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = std::env::args().collect::<Vec<_>>();
    if args.len() != 5 && !(args.len() == 6 && args[5] == "--tamper-output") {
        return Err(
            "qa_imported_model <H1A kit> <owned tags> <Invader> <fresh acceptance directory> [--tamper-output]"
                .into(),
        );
    }
    let root = Path::new(&args[4]);
    if root.exists() {
        return Err("Acceptance directory must be fresh".into());
    }
    fs::create_dir_all(root)?;
    let path = root.canonicalize()?.join("original_wedge.obj");
    fs::write(&path, include_bytes!("../tests/fixtures/static_wedge.obj"))?;
    let imported = assets::parse_obj(include_str!("../tests/fixtures/static_wedge.obj"))?;
    let mut p = Project::new("Native custom scenery acceptance");
    let mut d = bsp_workshop::example()?;
    d.name = format!("custom_{}", &p.id[..8]);
    d.sky_path = Some("levels/test/bloodgulch/bloodgulch".into());
    d.materials[0].name = "example_tutorial_metal_floor".into();
    d.materials[0].shader_path =
        Some("levels/test/tutorial/shaders/example_tutorial_metal_floor".into());
    p.quick_forge = Some(d);
    let sha = maps::hash_file(&path)?;
    p.assets.push(Asset {
        id: uuid::Uuid::new_v4().to_string(),
        name: "Original wedge".into(),
        kind: "obj".into(),
        path,
        sha256: sha.clone(),
        vertices: imported.mesh.positions.len() / 3,
        triangles: 8,
        has_uvs: true,
        materials: imported.materials,
    });
    for (i, (position, rotation, scale)) in [
        ([3., 3., 0.1], [0.4, -0.15, 0.12], [1.3, 0.75, 1.4]),
        ([-3., 3., 0.1], [0.4, -0.15, 0.12], [1.3, 0.75, 1.4]),
        ([24., 2., 0.2], [0., 0., 0.], [2., 0.8, 0.5]),
    ]
    .into_iter()
    .enumerate()
    {
        p.scene.push(maps::SceneObject {
            id: format!("mesh-{i}"),
            name: format!("Custom wedge {i}"),
            kind: "Workshop mesh".into(),
            asset_id: Some(p.assets[0].id.clone()),
            position,
            rotation,
            scale,
            visible: true,
            tag_id: None,
            source_offset: None,
            rotation_offset: None,
            source_model: None,
        });
    }
    let saved = root.join("custom.gsproject");
    project::save_project(&saved, &p)?;
    let reopened = project::load_project(&saved)?;
    assert_eq!(p.fingerprint()?, reopened.fingerprint()?);
    let plan = model_build::plan(&reopened)?;
    assert_eq!(plan.models.len(), 2);
    let tamper = args.len() == 6;
    let job_id = uuid::Uuid::new_v4().to_string();
    let output = root
        .canonicalize()?
        .join(&job_id)
        .join("output")
        .join(format!("{}.map", plan.document.name));
    let checks = AtomicUsize::new(0);
    let injected = AtomicBool::new(false);
    let injection_error = Mutex::new(None::<String>);
    let receipt = forge_build::run_job(
        &reopened,
        &ForgeToolchain {
            hek_directory: Some(args[1].clone().into()),
            hek_tags_directory: Some(args[2].clone().into()),
            invader_directory: Some(args[3].clone().into()),
            hek_flavor: Some("h1aEk".into()),
        },
        root,
        &job_id,
        false,
        vec![],
        Arc::new(AtomicBool::new(false)),
        |e| {
            eprintln!("{}: {}", e.phase, e.message);
            if tamper
                && e.phase == "verify"
                && ["0", "false"].contains(&e.message.trim())
                && checks.fetch_add(1, Ordering::SeqCst) == 2
            {
                // Only this fresh job's output is changed, after the three genuine native checks.
                let result = (|| -> std::io::Result<()> {
                    let mut bytes = fs::read(&output)?;
                    let last = bytes
                        .last_mut()
                        .ok_or_else(|| std::io::Error::other("Empty output"))?;
                    *last ^= 1;
                    fs::write(&output, bytes)
                })();
                match result {
                    Ok(()) => injected.store(true, Ordering::SeqCst),
                    Err(error) => *injection_error.lock().unwrap() = Some(error.to_string()),
                }
            }
        },
    )?;
    let source_preserved = maps::hash_file(&p.assets[0].path)? == sha;
    if tamper {
        if !injected.load(Ordering::SeqCst) {
            return Err(format!(
                "Negative-test injection did not run: {:?}",
                injection_error.lock().unwrap()
            )
            .into());
        }
        if receipt.status != "failed"
            || !receipt
                .blockers
                .iter()
                .any(|b| b.contains("Compiled output changed during verification"))
        {
            return Err(format!(
                "Altered native output was not rejected by its final hash guard: {:?}",
                receipt.blockers
            )
            .into());
        }
        if !source_preserved {
            return Err("Original OBJ changed".into());
        }
        fs::write(
            root.join("expected-refusal.json"),
            serde_json::to_vec_pretty(
                &serde_json::json!({"schemaVersion":1,"kind":"owned-native-output-corruption-refusal","negativeTestPassed":true,"realCompilerAndQueries":true,"privateNewOutputOnly":true,"originalSourcePreserved":true,"toolAttributedToHarness":true,"injectedAfterThreeNativeQueries":checks.load(Ordering::SeqCst)==3,"receipt":receipt}),
            )?,
        )?;
        println!("PASS corrupted fresh native output rejected after three real compiler verification queries; original source preserved");
        return Ok(());
    }
    fs::write(
        root.join("acceptance.json"),
        serde_json::to_vec_pretty(
            &serde_json::json!({"schemaVersion":1,"kind":"native-custom-obj-scenery","receipt":receipt,"sourcePreserved":source_preserved,"savedAndReopenedExactly":true,"models":plan.models,"placements":3,"gameplayVerified":false}),
        )?,
    )?;
    if receipt.status != "validated" {
        return Err(receipt.blockers.join("\n").into());
    }
    assert!(source_preserved);
    println!("{}", serde_json::to_string(&receipt)?);
    Ok(())
}
