use spark_core::quickforge::{self, EditorEnvironment};

#[test]
fn environment_is_roundtripped_and_bad_numbers_are_rejected() {
    let mut doc=quickforge::create_arena("Lighting QA", "smallIndoorArena").unwrap();
    let mut profile=EditorEnvironment::default();
    profile.fog_enabled=true;profile.fog_near=22.;profile.fog_far=175.;
    profile.sun_elevation=20.;doc.environment=Some(profile.clone());
    quickforge::validate_document(&doc).unwrap();
    let bytes=serde_json::to_vec(&doc).unwrap();
    let restored:quickforge::QuickForgeDocument=serde_json::from_slice(&bytes).unwrap();
    assert_eq!(restored.environment,Some(profile));
    let old=doc.clone();
    doc.environment.as_mut().unwrap().fog_far=5.;
    assert!(quickforge::validate_document(&doc).is_err());
    doc=old;
    doc.environment.as_mut().unwrap().sun_intensity=f32::NAN;
    assert!(quickforge::validate_document(&doc).is_err());
}
#[test]
fn overlapping_spawn_and_conflicting_tag_source_are_blocking() {
    let mut doc=quickforge::create_arena("Risk QA", "smallIndoorArena").unwrap();
    doc.spawns[1].position=doc.spawns[0].position;
    assert!(quickforge::validate(&doc).unwrap().issues.iter().any(|i|i.code=="DUPLICATE_SPAWN_POSITION"&&i.severity=="error"));
    doc.spawns[1].game_modes=vec!["race".into()];
    doc.spawns[0].game_modes=vec!["slayer".into()];
    assert!(!quickforge::validate(&doc).unwrap().issues.iter().any(|i|i.code=="DUPLICATE_SPAWN_POSITION"));
}
#[test]
fn source_export_is_complete_hashed_and_never_overwrites() {
    let temp=tempfile::tempdir().unwrap();
    let output=temp.path().join("final-source");
    let mut doc=quickforge::create_arena("Export QA", "smallIndoorArena").unwrap();
    let mut env=EditorEnvironment::default();env.sun_elevation=15.;doc.environment=Some(env);
    let receipt=quickforge::export_sources(&doc,&output).unwrap();
    assert_eq!(receipt.environment_plan_path.as_ref().unwrap(),&output.join("environment-intent.json"));
    let json=std::fs::read_to_string(output.join("environment-intent.json")).unwrap();
    assert!(json.contains("AUTHORING_ONLY_NOT_COMPILED"));
    assert!(receipt.blockers.iter().any(|b|b.contains("environment preview")));
    assert_eq!(spark_core::maps::hash_file(&receipt.jms_path).unwrap(),receipt.jms_sha256);
    let project=std::fs::read(output.join("quickforge-document.json")).unwrap();
    let round:quickforge::QuickForgeDocument=serde_json::from_slice(&project).unwrap();
    assert_eq!(round,doc);
    assert!(quickforge::export_sources(&doc,&output).is_err());
    assert_eq!(std::fs::read(output.join("quickforge-document.json")).unwrap(),project);
    assert!(!std::fs::read_dir(temp.path()).unwrap().any(|p|p.unwrap().file_name().to_string_lossy().starts_with(".spark-forge-export-")));
}

#[test]
fn two_sources_must_not_claim_the_same_tag_path() {
    let mut doc=quickforge::create_arena("Cross-map QA", "smallIndoorArena").unwrap();
    let source_id=uuid::Uuid::new_v4().to_string();
    let first=quickforge::ForgePlacement {
        id:"imported-1".into(),name:"Rock from map one".into(),
        tag_path:"scenery\\rocks\\rock".into(),tag_class:"scen".into(),
        position:[1.,2.,3.],rotation:[0.,0.,0.],team:-1,respawn_seconds:0,
        tag_id:None,source_project_id:Some(source_id.clone()),
        source_sha256:Some("a".repeat(64)),visible:true,locked:false,
    };
    let mut second=first.clone();
    second.id="imported-2".into();second.name="Rock from another cache".into();
    second.source_project_id=Some(uuid::Uuid::new_v4().to_string());
    second.source_sha256=Some("b".repeat(64));
    doc.placements=vec![first.clone(),second.clone()];
    let report=quickforge::validate(&doc).unwrap();
    assert!(!report.valid);
    assert!(report.issues.iter().any(|i| i.code=="CONFLICTING_TAG_ORIGINS" && i.severity=="error"));
    second.tag_path="scenery\\other\\rock".into();
    doc.placements[1]=second;
    assert!(!quickforge::validate(&doc).unwrap().issues.iter().any(|i| i.code=="CONFLICTING_TAG_ORIGINS"));
}
