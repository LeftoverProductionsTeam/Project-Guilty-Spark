//! Owner-run test: generate a small original wave on an owned map's actual rig.
//! No game skeleton, mesh, animation or compiled tag is bundled with this example.
use spark_core::{
    animations::{self, AnimationAssignment, AnimationClip, AnimationNode},
    build::Toolchain,
    creative::{CameraShot, CreatorStudio, EngineMachinima},
    engine_machinima, maps, project,
};
use std::{fs, path::Path};
fn main() -> spark_core::Result<()> {
    let a: Vec<_> = std::env::args().collect();
    if a.len() != 6 {
        eprintln!("qa_animation_take <saved source project> <owned conversion job> <Invader folder> <H1A kit> <SDK tags>");
        std::process::exit(2);
    }
    let mut p = project::load_project(Path::new(&a[1]))?;
    p.animations.clear();
    p.animation_assignments.clear();
    let source = p.source.as_ref().unwrap().clone();
    let inspection =
        maps::inspect_map(&source.preserved_path, source.resource_directory.as_deref())?;
    let model = inspection
        .tags
        .iter()
        .find(|t| {
            t.class == "mod2"
                && ["characters/cyborg_mp/cyborg_mp", "characters/cyborg/cyborg"]
                    .contains(&t.path.replace('\\', "/").to_ascii_lowercase().as_str())
        })
        .expect("Owned map Spartan model required");
    let biped = inspection
        .tags
        .iter()
        .find(|t| {
            t.class == "bipd"
                && t.references
                    .iter()
                    .any(|r| r.target_id == model.id && r.label == "Model")
        })
        .unwrap();
    let (_, mesh) = spark_core::render::preview_owned_object_model(
        &source.preserved_path,
        &source.sha256,
        &inspection,
        biped.id,
    )?;
    let rig = mesh
        .rig
        .as_ref()
        .expect("Actual Spartan rig must be available");
    let bone = rig
        .nodes
        .iter()
        .position(|n| n.name.to_ascii_lowercase().contains("upperarm"))
        .or_else(|| {
            rig.nodes
                .iter()
                .position(|n| n.name.to_ascii_lowercase().contains("head"))
        })
        .expect("A named acting bone is required");
    let mut clip = AnimationClip {
        name: "spark wave".into(),
        fps: 30.,
        frame_count: 31,
        checksum: rig.checksum,
        nodes: rig
            .nodes
            .iter()
            .map(|n| AnimationNode {
                name: n.name.clone(),
                parent: n.parent,
            })
            .collect(),
        transforms: vec![],
    };
    for frame in 0..31 {
        for (i, node) in rig.nodes.iter().enumerate() {
            clip.transforms.extend(node.position);
            let mut q = node.rotation;
            if i == bone {
                let angle = 0.5 * (frame as f32 * std::f32::consts::TAU / 30.).sin();
                let s = (angle * 0.5).sin();
                let c = (angle * 0.5).cos();
                q = [
                    q[0] * c + q[1] * s,
                    q[1] * c - q[0] * s,
                    q[2] * c + q[3] * s,
                    q[3] * c - q[2] * s,
                ];
            }
            clip.transforms.extend(q);
            clip.transforms.push(1.);
        }
    }
    let workspace = fs::canonicalize(&a[2])?;
    let generated = workspace.join("spark-wave.jma");
    fs::write(&generated, animations::jma_source(&clip)?)?;
    let tools = Toolchain {
        invader_directory: Some(fs::canonicalize(&a[3])?),
        h1a_directory: Some(fs::canonicalize(&a[4])?),
        base_tags_directory: Some(fs::canonicalize(&a[5])?),
        ..Default::default()
    };
    let root = Path::new(&a[1]).parent().unwrap();
    let asset = animations::import_owned(root, &generated, &tools, &p.id, |e| {
        eprintln!("{} {}", e.phase, e.message)
    })?;
    p.animations.push(asset.clone());
    p.animation_assignments.push(AnimationAssignment {
        id: uuid::Uuid::new_v4().to_string(),
        asset_id: asset.id.clone(),
        target_tag_id: biped.id,
        target_tag_path: biped.path.clone(),
        source_sha256: source.sha256.clone(),
        mode: "custom".into(),
        play_on_take: true,
    });
    let anchor = p
        .scene
        .iter()
        .find(|o| o.kind == "Player spawn")
        .map(|o| o.position)
        .unwrap_or([0., 0., 0.]);
    let mut studio: CreatorStudio = serde_json::from_value(
        serde_json::json!({"schemaVersion":1,"missions":[],"shots":[],"server":{"name":"Camera test","runtime":"mcc","maxPlayers":1,"publicListing":false,"rotation":[]},"playtests":[]}),
    )?;
    studio.shots.push(CameraShot {
        id: "native-camera".into(),
        name: "Native actor camera".into(),
        duration_ms: 3000,
        camera_position: [anchor[0] + 4., anchor[1] - 5., anchor[2] + 3.],
        look_at: [anchor[0], anchor[1], anchor[2] + 1.],
        fov: 70.,
        subtitle: String::new(),
        camera_marker: None,
        roll: Some(0.),
        easing: Some("linear".into()),
    });
    studio.engine_machinima = Some(EngineMachinima {
        enabled: true,
        playback: "fixed".into(),
        camera_id: Some("native-camera".into()),
        auto_start: true,
    });
    p.studio = Some(studio);
    engine_machinima::prepare_workspace_animations(&p, &inspection, &workspace, &tools, |e| {
        eprintln!("{} {}", e.phase, e.message)
    })?;
    engine_machinima::prepare_workspace_take(
        &p,
        &source.scenario_path,
        &workspace,
        &tools
            .invader_directory
            .as_ref()
            .unwrap()
            .join("invader-edit.exe"),
        inspection.scripts.len(),
        |e| eprintln!("{} {}", e.phase, e.message),
    )?;
    fs::write(
        workspace.join("animation-preview-fixture.json"),
        serde_json::to_vec(
            &serde_json::json!({"mesh":mesh,"clip":clip,"asset":asset,"targetTagId":biped.id,"bone":bone}),
        )?,
    )?;
    project::save_project(&workspace.join("animation-test-project.gsproject"), &p)?;
    println!(
        "{}",
        serde_json::json!({"bones":rig.nodes.len(),"vertices":rig.indices.len()/2,"checksum":rig.checksum,"bone":rig.nodes[bone].name,"frames":31,"nativeScripts":"compiled; engine load pending"})
    );
    Ok(())
}
