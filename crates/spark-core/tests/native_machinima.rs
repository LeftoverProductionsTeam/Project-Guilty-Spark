use spark_core::{creative::{CameraShot,CreatorStudio,EngineMachinima},project::Project};
mod common;
#[test]
fn existing_cache_validation_refuses_pending_native_take_before_any_job_or_copy(){
    use spark_core::{build::{self,Toolchain},maps};
    use std::sync::{Arc,atomic::AtomicBool};
    let dir=tempfile::tempdir().unwrap();let path=dir.path().join("fixture.map");std::fs::write(&path,common::fixture(13)).unwrap();
    let mut inspection=maps::inspect_map(&path,None).unwrap();inspection.header.build="synthetic gate fixture".into();
    let mut p=Project::new("Pending camera");p.scene=inspection.objects.clone();
    p.studio=Some(serde_json::from_value(serde_json::json!({"schemaVersion":1,"missions":[],"shots":[],"server":{"name":"Test","runtime":"mcc","maxPlayers":1,"publicListing":false,"rotation":[]},"playtests":[],"engineMachinima":{"enabled":true,"playback":"fixed","autoStart":false}})).unwrap());
    let jobs=dir.path().join("jobs");
    let result=build::validate_existing_cache(&p,&inspection,&Toolchain::default(),&jobs,&uuid::Uuid::new_v4().to_string(),Arc::new(AtomicBool::new(false)),|_|{});
    assert!(result.unwrap_err().to_string().contains("changes require extraction and rebuilding"));assert!(!jobs.exists());
}
#[test]
fn build_receipts_track_native_camera_and_recovery_inputs_but_preserve_old_metadata_hashes(){
    let mut p=Project::new("Native fingerprint test");let original=p.fingerprint().unwrap();p.conversion_profile=Some("faithful".into());assert_eq!(p.fingerprint().unwrap(),original);p.conversion_profile=Some("zombie-recovery".into());assert_ne!(p.fingerprint().unwrap(),original);p.conversion_profile=None;
    let mut studio:CreatorStudio=serde_json::from_value(serde_json::json!({"schemaVersion":1,"missions":[],"shots":[],"server":{"name":"Test","runtime":"mcc","maxPlayers":1,"publicListing":false,"rotation":[]},"playtests":[]})).unwrap();
    studio.shots.push(CameraShot{id:"one".into(),name:"Camera".into(),duration_ms:1000,camera_position:[0.,-5.,2.],look_at:[0.,0.,1.],fov:70.,subtitle:String::new(),camera_marker:None,roll:None,easing:None});p.studio=Some(studio);assert_eq!(p.fingerprint().unwrap(),original);
    p.studio.as_mut().unwrap().engine_machinima=Some(EngineMachinima{enabled:true,playback:"fixed".into(),camera_id:Some("one".into()),auto_start:false});let take=p.fingerprint().unwrap();assert_ne!(take,original);p.studio.as_mut().unwrap().shots[0].camera_position[0]=-0.;assert_eq!(p.fingerprint().unwrap(),take);p.studio.as_mut().unwrap().shots[0].camera_position[0]=3.;assert_ne!(p.fingerprint().unwrap(),take);let moved=p.fingerprint().unwrap();p.studio.as_mut().unwrap().server.name="Only authoring metadata changed".into();assert_eq!(p.fingerprint().unwrap(),moved);
}

#[test]
fn existing_cache_validation_refuses_unbuilt_rules_and_changed_inspection_without_creating_jobs(){
    use spark_core::{build::{self,Toolchain},maps,project::Source};
    use std::sync::{Arc,atomic::AtomicBool};
    let dir=tempfile::tempdir().unwrap();let path=dir.path().join("fixture.map");std::fs::write(&path,common::fixture(609)).unwrap();
    let mut inspection=maps::inspect_map(&path,None).unwrap();inspection.header.build="synthetic gate fixture".into();
    let mut p=Project::new("Existing CE");p.scene=inspection.objects.clone();
    p.source=Some(Source{original_path:path.clone(),preserved_path:path.clone(),sha256:inspection.sha256.clone(),cache_version:609,engine:inspection.header.engine.clone(),scenario_path:inspection.scenario_path.clone(),archive:None,resource_directory:None,resource_sha256:Default::default(),audio_resources:None});
    let jobs=dir.path().join("jobs");
    let check=|p:&Project,i:&maps::MapInspection|build::validate_existing_cache(p,i,&Toolchain::default(),&jobs,&uuid::Uuid::new_v4().to_string(),Arc::new(AtomicBool::new(false)),|_|{}).unwrap_err().to_string();
    let mut changed=p.clone();changed.firefight=Some(spark_core::firefight::default_config());
    assert!(check(&changed,&inspection).contains("changes require extraction and rebuilding"));
    inspection.sha256="f".repeat(64);assert!(check(&p,&inspection).contains("source identity"));
    inspection.header.compressed=true;assert!(check(&p,&inspection).contains("standard MCC13 or CE609"));
    inspection.header.compressed=false;inspection.header.version=7;assert!(check(&p,&inspection).contains("standard MCC13 or CE609"));
    assert!(!jobs.exists());
}
#[test]
#[ignore="Requires an explicitly owned real CE cache, installed Invader and disposable jobs"]
fn installed_existing_ce_cache_validates_exact_output_and_preserves_source(){
    use spark_core::{build::{self,Toolchain},maps,project::Source};
    use std::{path::PathBuf,sync::{Arc,atomic::AtomicBool}};
    let source=PathBuf::from(std::env::var_os("SPARK_NATIVE_CE_SOURCE_CACHE").expect("Owned CE cache"));
    let jobs=PathBuf::from(std::env::var_os("SPARK_NATIVE_CE_SOURCE_JOBS").expect("Disposable jobs"));
    let invader=PathBuf::from(std::env::var_os("SPARK_NATIVE_CE_SOURCE_INVADER").expect("Installed Invader"));
    let before=maps::hash_file(&source).unwrap();let inspection=maps::inspect_map(&source,None).unwrap();assert_eq!(inspection.header.version,609);
    let mut p=Project::new("Unchanged native CE");p.scene=inspection.objects.clone();
    p.source=Some(Source{original_path:source.clone(),preserved_path:source.clone(),sha256:before.clone(),cache_version:609,engine:inspection.header.engine.clone(),scenario_path:inspection.scenario_path.clone(),archive:None,resource_directory:None,resource_sha256:Default::default(),audio_resources:None});
    let record=build::validate_existing_cache(&p,&inspection,&Toolchain{invader_directory:Some(invader),..Default::default()},&jobs,&uuid::Uuid::new_v4().to_string(),Arc::new(AtomicBool::new(false)),|e|println!("{}",e.message)).unwrap();
    assert_eq!(record.target,"ce-existing");assert_eq!(record.status,"validated");assert_eq!(record.sha256.as_deref(),Some(before.as_str()));
    assert_eq!(maps::hash_file(record.output.as_ref().unwrap()).unwrap(),before);assert_eq!(maps::hash_file(&source).unwrap(),before);
    println!("Existing CE609 validation exact readback: {before}; original unchanged; no compilation/gameplay claim");
}
