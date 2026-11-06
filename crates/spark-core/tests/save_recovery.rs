mod common;
use spark_core::{library::Library,project::{self,Project},workspace_history::{self,Session,Head,Snapshot}};
use std::{fs,path::{Path,PathBuf},process::Command};

fn select(history:&mut Session,dir:&Path,p:&Project) {
    let old=history.read(dir,p).unwrap();let key=uuid::Uuid::new_v4().to_string();
    let mut head=old.as_ref().map(|s|s.head.clone()).unwrap_or(Head{current:key.clone(),past:vec![],future:vec![],dirty:true,limit:100});
    if old.is_some(){head.past.push(head.current.clone());}head.current=key.clone();head.future.clear();head.dirty=true;
    history.commit(dir,p,old.map_or(0,|s|s.revision),head,vec![Snapshot{key,project:p.clone()}]).unwrap();
}
fn current(view:&workspace_history::View)->&Project {&view.snapshots.iter().find(|s|s.key==view.head.current).unwrap().project}
fn accepted(root:&Path)->(Library,Project,Session,PathBuf) {
    let library=Library::workspace(root).unwrap();let p=library.create("Accepted").unwrap();let dir=library.project_dir(&p.id).unwrap().join("window-history");
    let mut history=Session::default();select(&mut history,&dir,&p);library.save_with_history(&mut history,&p).unwrap();(library,p,history,dir)
}

#[test]
fn save_process_interruption_worker() {
    let Some(root)=std::env::var_os("SPARK_SAVE_CRASH_ROOT") else{return};let root=PathBuf::from(root);
    let id=std::env::var("SPARK_SAVE_CRASH_PROJECT").unwrap();let phase=std::env::var("SPARK_SAVE_CRASH_PHASE").unwrap();
    let library=Library::workspace(&root).unwrap();let mut p=if phase=="first" {let mut p=Project::new("First interrupted Save");p.id=id;library.save(&p,None).unwrap();p}else{library.get(&id).unwrap()};
    p.title="New explicit Save".into();let dir=library.project_dir(&p.id).unwrap().join("window-history");let mut history=Session::default();select(&mut history,&dir,&p);
    // The test child terminates at the actual journal/descriptor boundary,
    // bypassing destructors. The next process uses normal production recovery.
    let _:spark_core::Result<()>=history.save_with(&dir,&p,||{
        if phase=="before" {std::process::exit(23);}
        if phase=="first" {
            // An uncommitted index row models SQLite rollback on process exit.
            let mut db=rusqlite::Connection::open(root.join("library.sqlite3")).unwrap();let tx=db.transaction().unwrap();
            tx.execute("INSERT INTO projects(id,summary) VALUES(?1,'{}')",[&p.id]).unwrap();
            project::save_project(&dir.parent().unwrap().join("project.gsproject"),&p).unwrap();std::process::exit(23);
        }
        library.save_explicit(&p,None).unwrap();std::process::exit(23);
    });
    panic!("interruption worker returned unexpectedly");
}
#[test]
fn independent_process_crashes_recover_the_matching_descriptor_and_undo() {
    for phase in ["before","after","first"] {
        let temp=tempfile::tempdir().unwrap();let root=temp.path().join("library");
        let id=if phase=="first"{Library::workspace(&root).unwrap();uuid::Uuid::new_v4().to_string()}else{let(_,p,_,_)=accepted(&root);p.id};
        let status=Command::new(std::env::current_exe().unwrap()).args(["--exact","save_process_interruption_worker","--nocapture"])
            .env("SPARK_SAVE_CRASH_ROOT",&root).env("SPARK_SAVE_CRASH_PROJECT",&id).env("SPARK_SAVE_CRASH_PHASE",phase).status().unwrap();
        assert_eq!(status.code(),Some(23),"child must actually terminate at the selected boundary");
        let library=Library::workspace(&root).unwrap();assert!(library.is_saved(&id).unwrap());
        let p=library.get(&id).unwrap();let dir=library.project_dir(&id).unwrap().join("window-history");let mut history=Session::default();
        let recovered=history.read(&dir,&p).unwrap().unwrap();assert_eq!(p.title,if phase=="before"{"Accepted"}else{"New explicit Save"});
        assert_eq!(current(&recovered).title,p.title);assert!(!recovered.head.dirty);
        if phase=="after" {assert_eq!(recovered.head.past.len(),1);assert_eq!(recovered.snapshots.iter().find(|s|s.key==recovered.head.past[0]).unwrap().project.title,"Accepted");}
        assert_eq!(library.list().unwrap().len(),1);
    }
}
#[test]
fn external_descriptor_write_between_journal_and_publication_is_retained() {
    let temp=tempfile::tempdir().unwrap();let(library,mut p,mut history,dir)=accepted(temp.path());
    let previous=fs::read(dir.join("head.json")).unwrap();p.title="Local edit".into();select(&mut history,&dir,&p);let mut external=p.clone();external.title="External author".into();
    let file=dir.parent().unwrap().join("project.gsproject");
    let result=history.save_with(&dir,&p,||{project::save_project(&file,&external)?;library.save_explicit(&p,None)});
    assert!(result.is_err());assert_eq!(project::load_project(&file).unwrap().title,"External author");assert!(history.read(&dir,&p).unwrap().unwrap().head.dirty);
    let mut restarted=Session::default();assert!(restarted.read(&dir,&external).err().unwrap().to_string().contains("different revisions"));
    // Existing Import project is the explicit review path: a separate RAM
    // identity, not an overwrite/rebind of either author's old document.
    let reviewed=library.import_project(&file).unwrap();assert_ne!(reviewed.id,p.id);assert_eq!(reviewed.title,external.title);
    assert!(!library.project_dir(&reviewed.id).unwrap().exists());
    assert_ne!(fs::read(dir.join("head.json")).unwrap(),previous); // both choices, never a blind rollback over the external author
    assert_eq!(fs::read_dir(&dir).unwrap().filter(|p|p.as_ref().unwrap().path().extension().is_some_and(|s|s=="json")).count(),3);
}
#[test]
fn same_bytes_replacement_and_hardlinked_metadata_cannot_be_overwritten() {
    let temp=tempfile::tempdir().unwrap();let(library,mut p,mut history,dir)=accepted(temp.path());let file=dir.parent().unwrap().join("project.gsproject");
    let accepted=fs::read(&file).unwrap();let replacement=temp.path().join("replacement");fs::write(&replacement,&accepted).unwrap();fs::rename(&replacement,&file).unwrap();
    p.title="Local".into();select(&mut history,&dir,&p);assert!(library.save_with_history(&mut history,&p).is_err());assert_eq!(fs::read(&file).unwrap(),accepted);
    let other=temp.path().join("alias");fs::hard_link(&file,&other).unwrap();assert!(library.save_explicit(&p,None).is_err());assert_eq!(fs::read(&other).unwrap(),accepted);
}
#[test]
fn rejected_snapshot_or_index_write_keeps_the_earlier_save_and_ram_edits() {
    let temp=tempfile::tempdir().unwrap();let(library,mut p,mut history,dir)=accepted(temp.path());let file=dir.parent().unwrap().join("project.gsproject");let original=fs::read(&file).unwrap();
    p.title="Edit".into();select(&mut history,&dir,&p);
    let db=rusqlite::Connection::open(temp.path().join("library.sqlite3")).unwrap();db.execute_batch("CREATE TRIGGER refuse_save BEFORE UPDATE ON projects BEGIN SELECT RAISE(ABORT,'injected index failure'); END;").unwrap();
    assert!(library.save_with_history(&mut history,&p).is_err());assert_eq!(fs::read(&file).unwrap(),original);
    let mut reopened=Session::default();assert_eq!(current(&reopened.read(&dir,&p).unwrap().unwrap()).title,"Accepted");assert!(history.read(&dir,&p).unwrap().unwrap().head.dirty);
    db.execute_batch("DROP TRIGGER refuse_save").unwrap();library.save_with_history(&mut history,&p).unwrap();
    assert_eq!(current(&Session::default().read(&dir,&p).unwrap().unwrap()).title,"Edit");
}
#[test]
fn changed_source_rejects_save_even_after_recovery_preparation() {
    let temp=tempfile::tempdir().unwrap();let map=temp.path().join("owned.map");fs::write(&map,common::fixture(13)).unwrap();
    let library=Library::workspace(&temp.path().join("library")).unwrap();let(mut p,_)=library.import_map(&map,None).unwrap();let dir=library.project_dir(&p.id).unwrap().join("window-history");
    let mut history=Session::default();select(&mut history,&dir,&p);library.save_with_history(&mut history,&p).unwrap();let file=dir.parent().unwrap().join("project.gsproject");let original=fs::read(&file).unwrap();let saved_title=p.title.clone();
    p.title="Local".into();select(&mut history,&dir,&p);
    let result=history.save_with(&dir,&p,||{fs::write(&map,b"changed original source")?;library.save_explicit(&p,None)});
    assert!(result.unwrap_err().to_string().contains("source map changed"));assert_eq!(fs::read(&file).unwrap(),original);
    assert_eq!(current(&Session::default().read(&dir,&p).unwrap().unwrap()).title,saved_title);
}
#[test]
fn unsent_edit_cannot_mark_another_undo_selection_saved_and_unknown_orphans_are_not_adopted() {
    let temp=tempfile::tempdir().unwrap();let(library,mut p,mut history,dir)=accepted(temp.path());let before=fs::read(dir.join("head.json")).unwrap();p.title="Not acknowledged".into();
    assert!(library.save_with_history(&mut history,&p).unwrap_err().to_string().contains("acknowledged Undo selection"));assert_eq!(fs::read(dir.join("head.json")).unwrap(),before);
    let orphan=Project::new("Unknown descriptor");let foreign=temp.path().join("projects").join(&orphan.id);fs::create_dir(&foreign).unwrap();project::save_project(&foreign.join("project.gsproject"),&orphan).unwrap();
    drop(library);let reopened=Library::workspace(temp.path()).unwrap();assert_eq!(reopened.list().unwrap().len(),1);assert!(foreign.exists());assert!(!reopened.is_saved(&orphan.id).unwrap());
}

#[test]
fn an_unchanged_save_preserves_native_owned_assets_and_prior_undo() {
    let temp=tempfile::tempdir().unwrap();let(library,mut p,mut history,dir)=accepted(temp.path());
    let obj=temp.path().join("owned.obj");fs::write(&obj,b"v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n").unwrap();
    p.assets.push(project::Asset{id:uuid::Uuid::new_v4().to_string(),name:"Accepted native import".into(),kind:"obj".into(),sha256:spark_core::maps::hash_file(&obj).unwrap(),path:obj,vertices:3,triangles:1,has_uvs:false,materials:vec![]});
    library.save(&p,None).unwrap();library.save_with_history(&mut history,&p).unwrap();
    let saved=project::load_project(&dir.parent().unwrap().join("project.gsproject")).unwrap();assert_eq!(saved.assets.len(),1);
    let view=history.read(&dir,&p).unwrap().unwrap();assert!(!view.head.dirty);assert_eq!(view.revision,1);assert_eq!(current(&view).title,p.title);
}

#[test]
fn external_edit_while_save_waits_for_the_index_is_not_overwritten() {
    let temp=tempfile::tempdir().unwrap();let(library,mut p,mut history,dir)=accepted(temp.path());
    let file=dir.parent().unwrap().join("project.gsproject");let before=fs::read(dir.join("head.json")).unwrap();
    p.title="Local waiting Save".into();select(&mut history,&dir,&p);
    let mut external=p.clone();external.title="External edit during database wait".into();
    let db=rusqlite::Connection::open(temp.path().join("library.sqlite3")).unwrap();
    db.execute_batch("BEGIN IMMEDIATE;").unwrap();
    let worker=std::thread::spawn(move||library.save_with_history(&mut history,&p).map_err(|e|e.to_string()));
    // Save has prepared its real journal but cannot publish its index while
    // this independent connection holds the write transaction. No timing guess
    // or production-only fault hook is needed to reach the vulnerable interval.
    let deadline=std::time::Instant::now()+std::time::Duration::from_secs(3);
    while fs::read(dir.join("head.json")).unwrap()==before && std::time::Instant::now()<deadline {
        std::thread::sleep(std::time::Duration::from_millis(5));
    }
    assert_ne!(fs::read(dir.join("head.json")).unwrap(),before,"Save must reach actual journal publication before the external writer");
    project::save_project(&file,&external).unwrap();db.execute_batch("COMMIT;").unwrap();
    let result=worker.join().unwrap();
    assert_eq!(project::load_project(&file).unwrap().title,external.title,"A delayed Save must preserve the external author's descriptor");
    assert!(result.unwrap_err().contains("outside"));
}

#[test]
fn a_post_save_clean_head_acknowledgment_retains_the_durable_revision() {
    let temp=tempfile::tempdir().unwrap();let(library,p,mut history,dir)=accepted(temp.path());
    let saved=history.read(&dir,&p).unwrap().unwrap();assert!(!saved.head.dirty);
    // The real frontend applies its Saved receipt after native publication.
    // Repeating that exact clean head must not invent a RAM-only revision.
    let acknowledged=history.commit(&dir,&p,saved.revision,saved.head.clone(),vec![]).unwrap();
    let restarted=Session::default().read(&dir,&p).unwrap().unwrap();
    assert_eq!(acknowledged,restarted.revision,"A normal restart must retain the acknowledged clean revision");
    assert!(history.commit(&dir,&p,saved.revision-1,saved.head.clone(),vec![]).is_err());
    let mut changed=p.clone();changed.title="Real later edit".into();select(&mut history,&dir,&changed);
    assert!(history.read(&dir,&p).unwrap().unwrap().revision>saved.revision);
    library.save_with_history(&mut history,&changed).unwrap();
}

#[test]
fn a_first_save_before_an_undo_head_keeps_the_later_session_baseline_current() {
    let temp=tempfile::tempdir().unwrap();let library=Library::workspace(temp.path()).unwrap();
    let mut p=library.create("Created before its first view").unwrap();
    let dir=library.project_dir(&p.id).unwrap().join("window-history");let mut history=Session::default();
    library.save_with_history(&mut history,&p).unwrap();
    assert!(history.read(&dir,&p).unwrap().is_none());
    p.title="Later acknowledged edit".into();select(&mut history,&dir,&p);
    library.save_with_history(&mut history,&p).unwrap();
    let saved=project::load_project(&dir.parent().unwrap().join("project.gsproject")).unwrap();
    assert_eq!(saved.title,p.title);
    let view=Session::default().read(&dir,&saved).unwrap().unwrap();
    assert_eq!(current(&view).title,p.title);assert!(!view.head.dirty);
}
