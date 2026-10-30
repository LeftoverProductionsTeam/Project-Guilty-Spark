mod common;
use spark_core::{
    forge_build,
    library::Library,
    maps::{SceneObject, SourceModelReference},
    project,
};
use std::sync::{atomic::AtomicBool, Arc};
#[test]
fn preview_provenance_roundtrips_but_never_becomes_a_silent_cache_patch_or_game_build() {
    let root = tempfile::tempdir().unwrap();
    let input = root.path().join("source.map");
    common::write_map(&input, 13);
    let lib = Library::open(&root.path().join("library")).unwrap();
    let (mut p, inspection) = lib.import_map(&input, None).unwrap();
    let reference = SourceModelReference {
        project_id: p.id.clone(),
        source_sha256: inspection.sha256.clone(),
        tag_id: inspection.tags[1].id,
        path: inspection.tags[1].path.clone(),
        class: "scen".into(),
    };
    let object = SceneObject {
        id: uuid::Uuid::new_v4().to_string(),
        name: "Source preview".into(),
        kind: "Source model".into(),
        tag_id: None,
        asset_id: None,
        position: [0.; 3],
        rotation: [0.; 3],
        scale: [1.; 3],
        visible: true,
        source_offset: None,
        rotation_offset: None,
        source_model: Some(reference),
    };
    p.scene.push(object.clone());
    p.validate().unwrap();
    project::validate_edits(&p, &inspection).unwrap();
    lib.save(&p, Some(&inspection)).unwrap();
    assert!(lib
        .get(&p.id)
        .unwrap()
        .scene
        .last()
        .unwrap()
        .source_model
        .is_some());
    let serialized = serde_json::to_vec(&p).unwrap();
    let roundtrip: project::Project = serde_json::from_slice(&serialized).unwrap();
    assert_eq!(
        roundtrip
            .scene
            .last()
            .unwrap()
            .source_model
            .as_ref()
            .unwrap()
            .source_sha256,
        inspection.sha256
    );
    assert!(project::patched_cache(&p, &inspection)
        .unwrap_err()
        .to_string()
        .contains("preview"));
    let jobs = root.path().join("never-created-jobs");
    let error = forge_build::run_job(
        &p,
        &Default::default(),
        &jobs,
        &uuid::Uuid::new_v4().to_string(),
        false,
        vec![],
        Arc::new(AtomicBool::new(false)),
        |_| {},
    )
    .unwrap_err();
    assert!(error.to_string().contains("compiled Halo model"));
    assert!(!jobs.exists());
    p.scene
        .last_mut()
        .unwrap()
        .source_model
        .as_mut()
        .unwrap()
        .source_sha256 = "bad".into();
    assert!(p.validate().is_err());
    let mut legacy = serde_json::to_value(object).unwrap();
    legacy.as_object_mut().unwrap().remove("sourceModel");
    let legacy: SceneObject = serde_json::from_value(legacy).unwrap();
    assert!(legacy.source_model.is_none());
    assert!(serde_json::to_value(legacy)
        .unwrap()
        .get("sourceModel")
        .is_none());
    assert_eq!(
        spark_core::maps::hash_file(&input).unwrap(),
        inspection.sha256
    );
}
