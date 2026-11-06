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

#[test]
fn background_previews_reuse_verified_sources_in_ram_without_importing_or_mutating_saved_projects(){
    let temp=tempfile::tempdir().unwrap();let root=temp.path().join("application");
    let original=temp.path().join("owned.map");let bytes=common::fixture(13);std::fs::write(&original,&bytes).unwrap();
    let library=Library::open(&root).unwrap();let saved=library.create("Existing saved work").unwrap();
    let before=library.list().unwrap();let saved_bytes=std::fs::read(&before[0].project_path).unwrap();
    let(mut preview,inspection)=library.preview_map(&original,None).unwrap();let id=preview.id.clone();
    assert!(library.is_preview(&id).unwrap());assert!(!library.is_session_only());
    assert_eq!(inspection.sha256,maps::hash_file(&original).unwrap());
    assert_eq!(preview.source.as_ref().unwrap().preserved_path,std::fs::canonicalize(&original).unwrap());
    for _ in 0..10{assert_eq!(library.preview_map(&original,None).unwrap().0.id,id);}
    preview.title="RAM-only preview metadata".into();library.save(&preview,None).unwrap();
    assert_eq!(library.get(&id).unwrap().title,preview.title);assert_eq!(library.list().unwrap().len(),1);
    assert_eq!(library.list().unwrap()[0].id,saved.id);assert!(!library.project_dir(&id).unwrap().exists());
    assert!(library.settings_reference_path(&original).unwrap(),"active preview source must protect cleanup references");
    let mut changed=preview.clone();changed.source.as_mut().unwrap().sha256="f".repeat(64);
    assert!(library.save(&changed,None).is_err());assert_eq!(library.get(&id).unwrap().source.unwrap().sha256,inspection.sha256);
    assert_eq!(std::fs::read(&before[0].project_path).unwrap(),saved_bytes);
    drop(library);let reopened=Library::open(&root).unwrap();assert!(!reopened.is_preview(&id).unwrap());
    assert!(reopened.get(&id).is_err());assert_eq!(reopened.list().unwrap().len(),1);
    assert!(!reopened.settings_reference_path(&original).unwrap());assert_eq!(std::fs::read(&original).unwrap(),bytes);
}

#[test]
fn background_preview_capacity_refuses_growth_without_evicting_in_use_sources(){
    let temp=tempfile::tempdir().unwrap();let root=temp.path().join("application");let library=Library::open(&root).unwrap();
    let bytes=common::fixture(13);let mut ids=vec![];
    for index in 0..32{let path=temp.path().join(format!("owned-{index}.map"));std::fs::write(&path,&bytes).unwrap();ids.push(library.preview_map(&path,None).unwrap().0.id);}
    let extra=temp.path().join("extra.map");std::fs::write(&extra,&bytes).unwrap();
    assert!(library.preview_map(&extra,None).unwrap_err().to_string().contains("32-map/128 MiB"));
    assert!(library.list().unwrap().is_empty());assert!(!root.join("projects").exists());
    for id in ids{assert!(library.get(&id).is_ok());}
    assert_eq!(std::fs::read(extra).unwrap(),bytes);
}
