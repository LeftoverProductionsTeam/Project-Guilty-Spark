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
    let result=build::validate_existing_mcc(&p,&inspection,&Toolchain::default(),&jobs,&uuid::Uuid::new_v4().to_string(),Arc::new(AtomicBool::new(false)),|_|{});
    assert!(result.unwrap_err().to_string().contains("changes require extraction and rebuilding"));assert!(!jobs.exists());
}
#[test]
fn build_receipts_track_native_camera_and_recovery_inputs_but_preserve_old_metadata_hashes(){
    let mut p=Project::new("Native fingerprint test");let original=p.fingerprint().unwrap();p.conversion_profile=Some("faithful".into());assert_eq!(p.fingerprint().unwrap(),original);p.conversion_profile=Some("zombie-recovery".into());assert_ne!(p.fingerprint().unwrap(),original);p.conversion_profile=None;
    let mut studio:CreatorStudio=serde_json::from_value(serde_json::json!({"schemaVersion":1,"missions":[],"shots":[],"server":{"name":"Test","runtime":"mcc","maxPlayers":1,"publicListing":false,"rotation":[]},"playtests":[]})).unwrap();
    studio.shots.push(CameraShot{id:"one".into(),name:"Camera".into(),duration_ms:1000,camera_position:[0.,-5.,2.],look_at:[0.,0.,1.],fov:70.,subtitle:String::new(),camera_marker:None,roll:None,easing:None});p.studio=Some(studio);assert_eq!(p.fingerprint().unwrap(),original);
    p.studio.as_mut().unwrap().engine_machinima=Some(EngineMachinima{enabled:true,playback:"fixed".into(),camera_id:Some("one".into()),auto_start:false});let take=p.fingerprint().unwrap();assert_ne!(take,original);p.studio.as_mut().unwrap().shots[0].camera_position[0]=-0.;assert_eq!(p.fingerprint().unwrap(),take);p.studio.as_mut().unwrap().shots[0].camera_position[0]=3.;assert_ne!(p.fingerprint().unwrap(),take);let moved=p.fingerprint().unwrap();p.studio.as_mut().unwrap().server.name="Only authoring metadata changed".into();assert_eq!(p.fingerprint().unwrap(),moved);
}
