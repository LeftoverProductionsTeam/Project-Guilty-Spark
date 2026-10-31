mod common;
use spark_core::{library::Library, maps};
use std::fs;

#[test]
fn relative_imports_keep_absolute_resource_locations_and_original_pins() {
    // Do not change the process cwd: the workspace-relative fixture is safe
    // to import alongside the other parallel regression tests.
    let cwd = std::env::current_dir().unwrap();
    let owned = tempfile::tempdir_in(&cwd).unwrap();
    let maps = owned.path().join("maps");
    fs::create_dir(&maps).unwrap();
    let map = maps.join("source.map");
    common::write_map(&map, 6);
    let bitmap = maps.join("bitmaps.map");
    fs::write(&bitmap, b"resource hash fixture, not playable pixels").unwrap();
    let expected = maps::hash_file(&bitmap).unwrap();
    let library = Library::open(&owned.path().join("library")).unwrap();
    let relative = map.strip_prefix(&cwd).unwrap();
    let (project, _) = library.import_map(relative, None).unwrap();
    let source = project.source.unwrap();
    assert_eq!(
        source.resource_directory,
        Some(fs::canonicalize(&maps).unwrap())
    );
    assert_eq!(source.resource_sha256.get("bitmaps.map"), Some(&expected));
    assert_eq!(maps::hash_file(&bitmap).unwrap(), expected);
    assert_eq!(maps::hash_file(&map).unwrap(), source.sha256);
}

#[test]
fn an_explicit_missing_resource_folder_stays_absolute_without_invented_pins() {
    let cwd = std::env::current_dir().unwrap();
    let owned = tempfile::tempdir_in(&cwd).unwrap();
    let map = owned.path().join("source.map");
    common::write_map(&map, 6);
    let missing = owned.path().join("not-installed");
    let library = Library::open(&owned.path().join("library")).unwrap();
    let (project, _) = library
        .import_map(&map, Some(missing.strip_prefix(&cwd).unwrap()))
        .unwrap();
    let source = project.source.unwrap();
    assert_eq!(source.resource_directory, Some(missing.clone()));
    assert!(source.resource_sha256.is_empty());
    assert!(!missing.exists());
}
