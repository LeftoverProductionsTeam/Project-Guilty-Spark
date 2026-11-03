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

#[test] fn input_family_agreement_never_grants_conversion_or_live_writes() {
    use source_identity::RouteStatus::*;
    let dir=tempfile::tempdir().unwrap();
    for version in [5,6,7,609,13] {
        let path=dir.path().join(format!("native-{version}.map"));common::write_map(&path,version);
        let mut inspection=maps::inspect_map(&path,None).unwrap();let p=source(&path,&inspection);
        let facts=source_identity::describe(&p,&inspection).unwrap();
        let contract=&facts.contract;
        assert_eq!(contract.platform_ambiguous,matches!(version,6|7));
        assert_eq!(contract.runtime_family_candidates.contains(&RuntimeId::MccSteam),version==13);
        assert_eq!(contract.runtime_family_candidates.contains(&RuntimeId::OpenCe),matches!(version,5|609));
        assert_eq!(contract.runtime_family_candidates.contains(&RuntimeId::ChupathingyCe),matches!(version,5|7|609));
        assert_eq!(contract.compilation_targets[0].status,if version==5{Unsupported}else{RequiresPreflight});
        assert!(contract.compilation_targets.iter().skip(1).all(|route|route.status==Unsupported));
        assert!(contract.operations.iter().all(|route|route.operation!="liveWrite"));
        assert_eq!(contract.operations.iter().find(|route|route.operation=="compiledCacheEdit").unwrap().status,
            if version==13{RequiresPreflight}else{Unsupported});
        for compressed in [false,true] {
            inspection.header.extended=!compressed;inspection.header.compressed=compressed;
            assert!(!source_identity::mcc_conversion_source(&inspection));
            let contract=source_identity::format_contract(&p,&inspection);
            assert_eq!(contract.compilation_targets[0].status,Unsupported);
            let report=spark_core::build::compatibility(&p,&inspection,&Default::default());
            assert!(report.blockers.iter().any(|message|message.contains("no reviewed imported-cache MCC conversion route")));
        }
    }
}

#[test] fn runtime_map_directories_cover_native_custom_content_without_broad_searches() {
    assert!(spark_core::runtime::map_directories(RuntimeId::OpenCe).iter().any(|(path,_)|*path=="custom_maps"));
    for folder in ["maps_ce","maps_md","maps_pc","custom_maps"] {
        assert!(spark_core::runtime::map_directories(RuntimeId::ChupathingyCe).iter().any(|(path,_)|*path==folder));
    }
    assert!(!spark_core::runtime::map_directories(RuntimeId::MccSteam).iter().any(|(path,_)|*path=="maps"));
}
