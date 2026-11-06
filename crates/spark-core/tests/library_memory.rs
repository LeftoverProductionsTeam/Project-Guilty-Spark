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

#[test]
fn failed_explicit_save_keeps_descriptor_and_history_together() {
    use spark_core::workspace_history::{Session,Head,Snapshot};
    let temp=tempfile::tempdir().unwrap();let library=Library::workspace(&temp.path().join("library")).unwrap();
    let mut saved=library.create("Accepted Save").unwrap();let dir=library.project_dir(&saved.id).unwrap().join("window-history");
    let mut history=Session::default();let a=uuid::Uuid::new_v4().to_string();
    let mut head=Head{current:a.clone(),past:vec![],future:vec![],dirty:true,limit:100};
    history.commit(&dir,&saved,0,head.clone(),vec![Snapshot{key:a.clone(),project:saved.clone()}]).unwrap();
    let file=library.save_with_history(&mut history,&saved).unwrap().project_path;
    let accepted=std::fs::read(&file).unwrap();saved.title="New unsaved edit".into();let b=uuid::Uuid::new_v4().to_string();
    head.past.push(a);head.current=b.clone();history.commit(&dir,&saved,1,head,vec![Snapshot{key:b.clone(),project:saved.clone()}]).unwrap();
    // Another writer owns this path. Undo must refuse it without publishing the descriptor first.
    std::fs::write(dir.join(format!("{b}.json")),b"conflicting external snapshot").unwrap();
    let result=library.save_with_history(&mut history,&saved);
    assert!(result.is_err());assert_eq!(std::fs::read(&file).unwrap(),accepted,"failed Save published a different descriptor than the acknowledged history");
    let reopened=spark_core::project::load_project(&file).unwrap();let mut restarted=Session::default();
    let view=restarted.read(&dir,&reopened).unwrap().unwrap();
    assert_eq!(view.snapshots.iter().find(|s|s.key==view.head.current).unwrap().project.title,reopened.title);
    assert_eq!(history.read(&dir,&saved).unwrap().unwrap().revision,2);
}

#[test]
fn a_clean_reopen_restores_only_matching_recorded_native_build_metadata() {
    use spark_core::{project::{Project,BuildRecord},forge_build::QuickForgeBuildReceipt,quickforge};
    let temp=tempfile::tempdir().unwrap();let root=temp.path().join("library");let library=Library::workspace(&root).unwrap();
    let mut p=library.create("Native metadata restart").unwrap();p.quick_forge=Some(quickforge::create_arena("Native metadata restart","smallIndoorArena").unwrap());
    library.save(&p,None).unwrap();let file=library.save_explicit(&p,None).unwrap().project_path;let original=std::fs::read(&file).unwrap();
    let record=BuildRecord{id:uuid::Uuid::new_v4().to_string(),timestamp:String::new(),status:"validated".into(),target:"mcc-cea".into(),output:Some(root.join("synthetic-not-playable.map")),sha256:Some("a".repeat(64)),message:"Metadata only; actual artifact validation remains mandatory".into(),project_fingerprint:p.fingerprint().unwrap()};
    let mut receipt=QuickForgeBuildReceipt{schema_version:1,job_id:record.id.clone(),project_id:p.id.clone(),project_fingerprint:p.fingerprint().unwrap(),source_document_sha256:None,current:None,status:"validated".into(),duration_ms:0,sources:None,blockers:vec![],warnings:vec![],build:Some(record.clone()),tool_identities:Default::default()};
    library.set_setting(&format!("quickforge.receipt.{}",p.id),&receipt).unwrap();
    // Compiler completion records native metadata without implicitly saving an
    // author's RAM edits. A clean restart must recover the matching metadata
    // from that existing receipt, not rewrite the source or scan all job trees.
    p.builds.push(record.clone());library.save(&p,None).unwrap();drop(library);
    let reopened=Library::workspace(&root).unwrap();assert_eq!(reopened.get(&p.id).unwrap().builds[0].id,record.id);
    assert_eq!(std::fs::read(&file).unwrap(),original);drop(reopened);
    for invalid in ["foreign","stale","failed"] {
        let library=Library::workspace(&root).unwrap();let mut bad=receipt.clone();
        match invalid {"foreign"=>bad.project_id=Project::new("Other").id,"stale"=>bad.project_fingerprint="b".repeat(64),_=>bad.status="failed".into()}
        library.set_setting(&format!("quickforge.receipt.{}",p.id),&bad).unwrap();drop(library);
        assert!(Library::workspace(&root).unwrap().get(&p.id).unwrap().builds.is_empty(),"{invalid} receipt must not become a current build");
    }
    // Native operations must still verify the actual owned output and source;
    // this metadata-only fixture intentionally creates no playable map.
    receipt.status="exported".into();let library=Library::workspace(&root).unwrap();library.set_setting(&format!("quickforge.receipt.{}",p.id),&receipt).unwrap();drop(library);
    assert!(Library::workspace(&root).unwrap().get(&p.id).unwrap().builds.is_empty());
}
