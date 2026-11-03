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
    if a.len() < 5 {
        return Err("qa_bsp_workshop <H1A kit> <owned source tags> <Invader> <fresh acceptance directory> [--ce] [--logic] [--snapshot frozen-project.gsproject]".into());
    }
    let mut snapshot=None;let mut i=5;
    while i<a.len(){match a[i].as_str(){"--ce"|"--logic"=>i+=1,"--snapshot" if i+1<a.len()&&snapshot.is_none()=>{snapshot=Some(Path::new(&a[i+1]));i+=2;},_=>return Err("Unknown or incomplete acceptance argument".into())}}
    if snapshot.is_some()&&a.iter().any(|flag|flag=="--ce"||flag=="--logic"){return Err("A frozen snapshot is rebuilt exactly; do not combine it with template modifiers".into());}
    let ce = a.iter().any(|flag|flag=="--ce");
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
    if a.iter().any(|flag|flag=="--logic") {
        // Exact owned door mesh/collision readback is ±0.675 wide, 1.05 high,
        // with its closed face in the Y/Z plane. Fit the real corridor rather
        // than stretching the device or leaving a walk-around gap.
        let corridor=d.workshop.as_mut().unwrap().brushes.iter_mut().find(|b|b.id=="corridor").unwrap();
        corridor.scale=[1.,0.3375,0.35];
        for (i,start) in d.spawns.iter_mut().enumerate(){start.position=[4.+i as f32,0.,0.1];start.facing=0.;}
        // Owned stock SDK reference, not a synthetic native asset. All compiler
        // inputs are copied and hashed by the existing isolated build pipeline.
        d.placements.push(q::ForgePlacement {
            id:"benchmark-door".into(),name:"Corridor door".into(),
            tag_path:"levels/a10/devices/doors/door small/door small".into(),tag_class:"mach".into(),
            position:[14.,0.,0.],rotation:[0.,0.,0.],
            team:0,respawn_seconds:0,tag_id:None,source_project_id:None,source_sha256:None,
            visible:true,locked:false,published_asset_id:None,
        });
        d.logic=Some(serde_json::from_value(serde_json::json!({
            "schemaVersion":1,
            "triggers":[{"id":"benchmark-trigger","name":"Open corridor door","position":[14.,0.,1.5],"rotation":[0.,0.,0.],"dimensions":[6.,3.,3.],"visible":true,"locked":false}],
            "devices":[{"placementId":"benchmark-door","initialPosition":0.,"powered":true}],
            "rules":[{"id":"benchmark-open","name":"Enter → open corridor door","enabled":true,"once":false,
                "event":{"kind":"enter","triggerId":"benchmark-trigger"},
                "actions":[{"kind":"devicePosition","targetId":"benchmark-door","value":1.}]}]
        }))?);
    }
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
    let (portal_width,portal_height)=if d.logic.is_some(){(0.675,1.05)}else{(2.,3.)};
    d.workshop.as_mut().unwrap().portals = [8., 20.]
        .iter()
        .enumerate()
        .map(|(i, x)| w::Portal {
            id: format!("door-{i}"),
            material_id: "portal".into(),
            points: vec![[*x, -portal_width, 0.], [*x, portal_width, 0.], [*x, portal_width, portal_height], [*x, -portal_width, portal_height]],
        })
        .collect();
    let snapshot_hash=if let Some(path)=snapshot {
        // Rebuild the frozen pre-handoff source into a fresh diagnostic job.
        // Never replace the live project or its accepted external revisions.
        spark_core::reject_links(path)?;
        let hash=spark_core::maps::hash_file(path)?;
        p=project::load_project(path)?;
        d=p.quick_forge.clone().ok_or("Snapshot has no QuickForge source")?;
        if d.workshop.is_none(){return Err("Snapshot is not a BSP Workshop source".into());}
        Some(hash)
    }else{None};
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
            &serde_json::json!({"schemaVersion":1,"kind":"native-bsp-workshop-acceptance","geometry":report,"receipt":receipt,"sourceReopenedExactly":true,"snapshotSourceSha256":snapshot_hash,"gameplayVerified":false,"runtime":if ce{"halo-custom-edition"}else{"mcc-h1a"},"customEditionBuildVerified":ce&&receipt.status=="validated"}),
        )?,
    )?;
    if let (Some(path),Some(expected))=(snapshot,snapshot_hash){if spark_core::maps::hash_file(path)?!=expected{return Err("Frozen input changed during diagnostic rebuild".into());}}
    if receipt.status != "validated" {
        return Err(receipt.blockers.join("\n").into());
    }
    println!("{}", serde_json::to_string_pretty(&receipt)?);
    Ok(())
}
