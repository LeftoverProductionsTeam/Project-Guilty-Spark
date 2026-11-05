mod common;
use spark_core::{library::Library,maps};
#[test]
fn optional_session_reads_sources_in_place_without_writing_or_changing_persistent_libraries(){
    let temp=tempfile::tempdir().unwrap();let root=temp.path().join("uncreated-session");
    let original=temp.path().join("owned.map");let bytes=common::fixture(13);std::fs::write(&original,&bytes).unwrap();
    let memory=Library::memory(&root).unwrap();assert!(memory.is_session_only());
    let(mut p,inspection)=memory.import_map(&original,None).unwrap();
    assert_eq!(p.source.as_ref().unwrap().preserved_path,std::fs::canonicalize(&original).unwrap());
    assert_eq!(inspection.sha256,maps::hash_file(&original).unwrap());
    for n in 0..20{p.title=format!("Unsaved edit {n}");memory.save(&p,None).unwrap();}
    memory.set_setting("preferences",&serde_json::json!({"remember":false})).unwrap();
    assert_eq!(memory.get(&p.id).unwrap().title,"Unsaved edit 19");assert_eq!(memory.list().unwrap().len(),1);
    assert!(!root.exists());assert_eq!(std::fs::read(&original).unwrap(),bytes);
    drop(memory);let fresh=Library::memory(&root).unwrap();assert!(fresh.list().unwrap().is_empty());assert!(fresh.get(&p.id).is_err());assert!(!root.exists());
    let persistent=Library::open(&temp.path().join("explicit-library")).unwrap();assert!(!persistent.is_session_only());let saved=persistent.create("Explicit existing library").unwrap();assert!(persistent.project_dir(&saved.id).unwrap().join("project.gsproject").is_file());
}
