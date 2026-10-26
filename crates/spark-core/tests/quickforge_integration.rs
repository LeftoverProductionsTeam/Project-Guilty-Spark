use spark_core::{forge_build::{self, ForgeToolchain}, library::Library, maps, project::{self,Project}, quickforge};
use std::{fs,sync::{Arc,atomic::AtomicBool}};

fn arena()->Project {
    let mut p=Project::new("Guilty Spark Test Arena");
    p.quick_forge=Some(quickforge::create_arena(&p.title,"sealedArena").unwrap());p
}
#[test]
fn original_arena_roundtrips_and_changes_invalidate_build_identity() {
    let temp=tempfile::tempdir().unwrap();let lib=Library::open(temp.path()).unwrap();let p=arena();
    lib.save(&p,None).unwrap();let mut reloaded=lib.get(&p.id).unwrap();
    assert_eq!(p.quick_forge,reloaded.quick_forge);assert_eq!(lib.list().unwrap()[0].engine,"QuickForge");
    let original=p.fingerprint().unwrap();reloaded.quick_forge.as_mut().unwrap().geometry[1].dimensions[0]+=1.;
    assert_ne!(original,reloaded.fingerprint().unwrap());lib.save(&reloaded,None).unwrap();
    let descriptor=temp.path().join("arena.gsproject");project::save_project(&descriptor,&reloaded).unwrap();
    let imported=lib.import_project(&descriptor).unwrap();assert_eq!(imported.quick_forge,reloaded.quick_forge);
    assert!(imported.source.is_none());assert!(imported.builds.is_empty());
}
#[test]
fn source_export_and_missing_compiler_are_never_playable_results() {
    let temp=tempfile::tempdir().unwrap();let p=arena();let before=p.fingerprint().unwrap();
    let run=|export|forge_build::run_job(&p,&ForgeToolchain::default(),temp.path(),&uuid::Uuid::new_v4().to_string(),export,vec![],Arc::new(AtomicBool::new(false)),|_|{}).unwrap();
    let export=run(true);assert_eq!(export.status,"exported");assert!(export.build.is_none());
    let sources=export.sources.unwrap();assert!(sources.jms_path.is_file());assert_eq!(maps::hash_file(&sources.jms_path).unwrap(),sources.jms_sha256);
    assert!(sources.directory.join("project.gsproject").is_file());
    let attempted=run(false);assert_eq!(attempted.status,"blocked");assert!(attempted.build.is_none());
    assert!(attempted.blockers.iter().any(|s|s.contains("Editing Kit Tool")));
    assert!(!temp.path().join(&attempted.job_id).join("receipt.json").exists());
    assert_eq!(before,p.fingerprint().unwrap());
    assert!(temp.path().join(&attempted.job_id).join("quickforge-receipt.json").is_file());
}
#[test]
fn cancelled_job_cannot_export_or_compile_and_records_the_cancellation() {
    let temp=tempfile::tempdir().unwrap();let p=arena();let id=uuid::Uuid::new_v4().to_string();
    let receipt=forge_build::run_job(&p,&ForgeToolchain::default(),temp.path(),&id,false,vec![],Arc::new(AtomicBool::new(true)),|_|{}).unwrap();
    assert_eq!(receipt.status,"cancelled");assert!(receipt.build.is_none());assert!(receipt.sources.is_none());
    assert!(!temp.path().join(id).join("workspace").exists());
}
#[test]
fn dependencies_and_generated_destinations_are_bounded() {
    let temp=tempfile::tempdir().unwrap();
    assert!(forge_build::dependency_path(temp.path(),"../stock","weap").is_err());
    assert!(forge_build::dependency_path(temp.path(),"weapons/pistol","exe").is_err());
    assert_eq!(forge_build::dependency_path(temp.path(),"weapons/pistol","weapon").unwrap(),temp.path().join("weapons/pistol.weapon"));
    let doc=quickforge::create_arena("Arena","sealedArena").unwrap();
    let existing=temp.path().join("keep");fs::create_dir(&existing).unwrap();fs::write(existing.join("owner.txt"),"unchanged").unwrap();
    assert!(quickforge::export_sources(&doc,&existing).is_err());assert_eq!(fs::read_to_string(existing.join("owner.txt")).unwrap(),"unchanged");
}
