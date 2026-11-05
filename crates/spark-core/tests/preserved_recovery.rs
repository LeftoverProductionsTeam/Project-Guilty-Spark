//! Opt-in acceptance against a freshly restored, owner-selected historical copy.
//! No Halo data or private history fixtures are distributed with this test.
use spark_core::{project, workspace_history};
use std::{env, path::PathBuf};

#[test]
#[ignore = "requires SPARK_RECOVERED_PROJECT_DIR pointing to a fresh artifacts/qa historical restore"]
fn historical_project_and_acknowledged_undo_reopen_through_native_readers() {
    let directory = PathBuf::from(env::var_os("SPARK_RECOVERED_PROJECT_DIR").expect("explicit restored project"));
    let workspace = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..").canonicalize().unwrap();
    let directory = directory.canonicalize().unwrap();
    assert!(directory.starts_with(workspace.join("artifacts/qa")), "only the owned QA copy may be edited");
    let project = project::load_project(&directory.join("project.gsproject")).unwrap();
    project.validate().unwrap();
    let history = directory.join("window-history");
    let original = workspace_history::read(&history, &project).unwrap().expect("restored acknowledged history");
    assert!(!original.head.past.is_empty());
    let mut undo = original.head.clone();
    let previous = undo.past.pop().unwrap();
    undo.future.insert(0, undo.current.clone());
    undo.current = previous.clone();
    let revision = workspace_history::commit(&history, &project, original.revision, undo, vec![]).unwrap();
    let reopened = workspace_history::read(&history, &project).unwrap().unwrap();
    assert_eq!(reopened.head.current, previous);
    assert_eq!(reopened.revision, revision);
    let revision = workspace_history::commit(&history, &project, revision, original.head.clone(), vec![]).unwrap();
    let redone = workspace_history::read(&history, &project).unwrap().unwrap();
    assert_eq!(redone.head, original.head);
    assert_eq!(redone.revision, revision);
    assert_eq!(redone.snapshots.len(), original.snapshots.len());
    println!("{}: recovered revision {} -> Undo/Redo revision {}, {} intact snapshots", project.title, original.revision, revision, redone.snapshots.len());
}
