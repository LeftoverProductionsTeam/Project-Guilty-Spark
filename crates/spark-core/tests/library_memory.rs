mod common;
use spark_core::{library::Library,maps};
#[test]
fn runtime_material_previews_stay_read_only_and_outside_the_editable_workspace_library(){
    let temp=tempfile::tempdir().unwrap();let root=temp.path().join("application");let input=temp.path().join("owned.map");
    let bytes=common::fixture(13);std::fs::write(&input,&bytes).unwrap();let library=Library::workspace(&root).unwrap();
    let(mut preview,_)=library.preview_map(&input,None).unwrap();preview.title="Bound preview metadata".into();
    library.save(&preview,None).unwrap();assert!(library.is_preview(&preview.id).unwrap());
    assert_eq!(library.get(&preview.id).unwrap().title,preview.title);assert!(library.list().unwrap().is_empty());
    assert!(!root.join("projects").exists());assert!(library.save_explicit(&preview,None).is_err());
    assert_eq!(std::fs::read(input).unwrap(),bytes);
}
#[test]
fn production_workspace_twenty_open_edit_discard_cycles_allocate_no_project_copies(){
    let temp=tempfile::tempdir().unwrap();let root=temp.path().join("application");let input=temp.path().join("owned.map");
    let bytes=common::fixture(13);std::fs::write(&input,&bytes).unwrap();let library=Library::workspace(&root).unwrap();
    for index in 0..20{
        let(mut project,inspection)=library.import_map(&input,None).unwrap();assert_eq!(inspection.sha256,maps::hash_file(&input).unwrap());
        assert!(!library.is_saved(&project.id).unwrap());assert_eq!(project.source.as_ref().unwrap().preserved_path,std::fs::canonicalize(&input).unwrap());
        project.title=format!("Unsaved {index}");let receipt=library.save(&project,None).unwrap();assert!(receipt.session_only);
        let origin_key=format!("mapResourceOrigins.{}",project.id);
        library.set_setting(&origin_key,&Some(input.clone())).unwrap();
        assert_eq!(library.setting::<Option<std::path::PathBuf>>(&origin_key).unwrap(),Some(input.clone()));
        assert_eq!(library.get(&project.id).unwrap().title,project.title);assert!(library.settings_reference_path(&input).unwrap());
        library.discard_session(&project.id).unwrap();assert!(library.list().unwrap().is_empty());assert!(!root.join("projects").exists());
        assert_eq!(library.setting::<Option<std::path::PathBuf>>(&origin_key).unwrap(),None);
    }
    assert_eq!(std::fs::read(input).unwrap(),bytes);drop(library);assert!(Library::workspace(&root).unwrap().list().unwrap().is_empty());
}
#[test]
fn explicit_save_survives_restart_but_later_edits_and_external_overwrites_do_not(){
    let temp=tempfile::tempdir().unwrap();let root=temp.path().join("application");let input=temp.path().join("owned.map");
    let bytes=common::fixture(13);std::fs::write(&input,&bytes).unwrap();let library=Library::workspace(&root).unwrap();
    let(mut project,_)=library.import_map(&input,None).unwrap();project.title="Deliberate Save".into();
    let receipt=library.save_explicit(&project,None).unwrap();assert!(!receipt.session_only);assert!(!receipt.project_path.with_file_name("source.map").exists());
    let saved=std::fs::read(&receipt.project_path).unwrap();project.title="Unsaved later edit".into();library.save(&project,None).unwrap();
    assert_eq!(std::fs::read(&receipt.project_path).unwrap(),saved);library.discard_session(&project.id).unwrap();assert_eq!(library.get(&project.id).unwrap().title,"Deliberate Save");
    let mut outside=library.get(&project.id).unwrap();outside.title="External author".into();spark_core::project::save_project(&receipt.project_path,&outside).unwrap();
    let external=std::fs::read(&receipt.project_path).unwrap();assert!(library.save_explicit(&project,None).unwrap_err().to_string().contains("changed outside"));assert_eq!(std::fs::read(&receipt.project_path).unwrap(),external);
    drop(library);let reopened=Library::workspace(&root).unwrap();assert_eq!(reopened.get(&project.id).unwrap().title,"External author");
    let mut changed=bytes.clone();changed[100]^=1;std::fs::write(&input,&changed).unwrap();assert!(reopened.save_explicit(&outside,None).unwrap_err().to_string().contains("source map changed"));assert_eq!(std::fs::read(&receipt.project_path).unwrap(),external);
}
#[test]
fn memory_descriptor_assets_and_cross_project_copies_remain_verified_references(){
    use spark_core::{project::{Project,Asset},asset_transfer};
    let temp=tempfile::tempdir().unwrap();let root=temp.path().join("application");let obj=temp.path().join("owned.obj");
    let bytes=b"v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n";std::fs::write(&obj,bytes).unwrap();
    let mut incoming=Project::new("OBJ source");incoming.assets.push(Asset{id:uuid::Uuid::new_v4().to_string(),name:"Triangle".into(),kind:"obj".into(),sha256:maps::hash_file(&obj).unwrap(),path:obj.clone(),vertices:3,triangles:1,has_uvs:false,materials:vec![]});
    let descriptor=temp.path().join("incoming.gsproject");spark_core::project::save_project(&descriptor,&incoming).unwrap();
    let library=Library::workspace(&root).unwrap();let source=library.import_project(&descriptor).unwrap();let target=library.create("Destination").unwrap();
    let(_,copied,mesh)=asset_transfer::copy_obj(&library,&source.id,&source.assets[0].id,&target.id).unwrap();
    assert_ne!(copied.id,source.assets[0].id);assert_eq!(copied.path,std::fs::canonicalize(&obj).unwrap());assert_eq!(mesh.mesh.indices.len(),3);assert!(!root.join("projects").exists());
    std::fs::write(&obj,b"changed").unwrap();assert!(asset_transfer::copy_obj(&library,&source.id,&source.assets[0].id,&target.id).is_err());assert_eq!(library.get(&target.id).unwrap().assets.len(),1);
}
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
