mod common;
use spark_core::{maps,project::{Project,Source},runtime::RuntimeId,source_identity};
fn source(path:&std::path::Path,inspection:&maps::MapInspection)->Project {
    let mut project=Project::new("Owned source");
    project.source=Some(Source{original_path:path.into(),preserved_path:path.into(),sha256:inspection.sha256.clone(),cache_version:inspection.header.version,
        engine:inspection.header.engine.clone(),scenario_path:inspection.scenario_path.clone(),archive:None,resource_directory:None,resource_sha256:Default::default(),audio_resources:None});
    project
}
#[test] fn actual_format_controls_preview_search_and_preserves_all_native_source_facts() {
    let dir=tempfile::tempdir().unwrap();
    for version in [5,6,7,609,13] {
        let path=dir.path().join(format!("source-{version}.map"));common::write_map(&path,version);
        let inspection=maps::inspect_map(&path,None).unwrap();let p=source(&path,&inspection);
        let facts=source_identity::describe(&p,&inspection).unwrap();
        assert_eq!(facts.source.sha256,inspection.sha256);assert_eq!(facts.source.cache_version,version);
        assert_eq!(facts.readback.tags,inspection.tags.len());assert_eq!(facts.readback.collision_triangles,inspection.mesh.indices.len()/3);
        let expected=match version {609=>Some(RuntimeId::HaloCustomEdition),7=>Some(RuntimeId::HaloPc),6=>Some(RuntimeId::MccSteam),_=>None};
        assert_eq!(facts.candidate_preview_runtimes.first().copied(),expected);
        assert_eq!(maps::hash_file(&path).unwrap(),facts.source.sha256);
    }
}
#[test] fn stale_hash_format_or_scenario_never_becomes_a_shared_identity() {
    let dir=tempfile::tempdir().unwrap();let path=dir.path().join("source.map");common::write_map(&path,7);
    let inspection=maps::inspect_map(&path,None).unwrap();let p=source(&path,&inspection);
    for variant in 0..3 {let mut changed=p.clone();let source=changed.source.as_mut().unwrap();match variant {0=>source.sha256="f".repeat(64),1=>source.cache_version=13,_=>source.scenario_path="levels/other".into()};assert!(source_identity::describe(&changed,&inspection).is_err());}
    let mut extended=inspection.clone();extended.header.extended=true;
    assert!(source_identity::describe(&p,&extended).unwrap().candidate_preview_runtimes.is_empty());
    let mut compressed=inspection.clone();compressed.header.compressed=true;
    assert!(source_identity::describe(&p,&compressed).unwrap().candidate_preview_runtimes.is_empty());
}
#[test] fn native_build_preflight_reuses_the_same_identity_invariant() {
    let dir=tempfile::tempdir().unwrap();let path=dir.path().join("source.map");common::write_map(&path,7);
    let inspection=maps::inspect_map(&path,None).unwrap();let mut p=source(&path,&inspection);
    p.source.as_mut().unwrap().cache_version=13;
    let report=spark_core::build::compatibility(&p,&inspection,&Default::default());
    assert!(report.blockers.iter().any(|message|message.contains("source identity does not match")));
}
