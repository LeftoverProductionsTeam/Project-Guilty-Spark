mod common;
use spark_core::{
    external_changes::{MapChangeMonitor, MAX_RETRIES},
    library::Library,
    maps,
};
use std::{
    fs,
    path::Path,
    time::{Duration, SystemTime},
};

fn write(path: &Path, bytes: &[u8], revision: u64) {
    fs::write(path, bytes).unwrap();
    fs::File::options()
        .write(true)
        .open(path)
        .unwrap()
        .set_times(
            fs::FileTimes::new()
                .set_modified(SystemTime::now() + Duration::from_secs(10 + revision)),
        )
        .unwrap();
}
fn changed(marker: u8) -> Vec<u8> {
    let mut bytes = common::fixture(7);
    common::put_f32(&mut bytes, 0x1804, 0.5 + marker as f32 * 0.1);
    bytes
}
fn monitor(path: &Path) -> MapChangeMonitor {
    let inspection = maps::inspect_map(path, None).unwrap();
    MapChangeMonitor::new(
        path,
        &inspection.sha256,
        inspection.header.version,
        &inspection.scenario_path,
        0,
    )
    .unwrap()
}
fn baseline(monitor: &mut MapChangeMonitor) {
    assert_eq!(monitor.poll(0, None).status, "saving");
    assert_eq!(monitor.poll(2000, None).status, "watching");
}

#[test]
fn unchanged_polls_only_check_metadata_after_initial_identity_check() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("working.map");
    write(&path, &changed(0), 0);
    let mut monitor = monitor(&path);
    baseline(&mut monitor);
    assert_eq!(monitor.content_checks(), 1);
    for now in (4000..=40000).step_by(2000) {
        assert_eq!(monitor.poll(now, None).status, "watching");
    }
    assert_eq!(monitor.scan_now(40001, None).status, "watching");
    assert_eq!(
        monitor.content_checks(),
        1,
        "unchanged polls must not hash/decode the cache again"
    );
}

#[test]
fn stable_save_is_detected_and_a_fresh_snapshot_is_pinned() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("working.map");
    write(&path, &changed(0), 0);
    let mut monitor = monitor(&path);
    baseline(&mut monitor);
    write(&path, &changed(1), 1);
    assert_eq!(monitor.poll(4000, None).status, "saving");
    assert!(monitor.poll(5000, None).candidate.is_none());
    let candidate = monitor.poll(6000, None).candidate.unwrap();
    assert!(candidate.matches_source);
    assert_eq!(candidate.sha256, maps::hash_file(&path).unwrap());
    let inspected = monitor.validate_candidate(&candidate.sha256, None).unwrap();
    let radius = inspected
        .tags
        .iter()
        .flat_map(|tag| &tag.fields)
        .find(|field| field.offset == 0x1804)
        .unwrap();
    assert!(
        (radius.value.as_f64().unwrap() - 0.6).abs() < 1e-6,
        "the externally changed tag field must appear in the new inspection"
    );
    let snapshot = temp.path().join("frozen.map");
    monitor
        .snapshot_candidate(&candidate.sha256, &snapshot, None)
        .unwrap();
    assert_eq!(fs::read(snapshot).unwrap(), changed(1));
    monitor.acknowledge(&candidate.sha256).unwrap();
    assert_eq!(monitor.poll(8000, None).status, "watching");
    assert_eq!(monitor.content_checks(), 2);
}

#[test]
fn partial_save_retries_then_accepts_a_later_complete_write() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("working.map");
    write(&path, &changed(0), 0);
    let mut monitor = monitor(&path);
    baseline(&mut monitor);
    write(&path, b"head", 1);
    assert_eq!(monitor.poll(4000, None).status, "saving");
    assert_eq!(monitor.poll(6000, None).status, "incomplete");
    assert_eq!(monitor.poll(8000, None).status, "incomplete");
    write(&path, &changed(2), 2);
    assert_eq!(monitor.poll(10000, None).status, "saving");
    assert!(monitor.poll(12000, None).candidate.is_some());
}

#[test]
fn malformed_unchanged_file_has_bounded_retries_not_a_decode_loop() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("working.map");
    write(&path, &changed(0), 0);
    let mut monitor = monitor(&path);
    baseline(&mut monitor);
    write(&path, &vec![0u8; 4096], 1);
    monitor.poll(4000, None);
    for now in (6000..=60000).step_by(2000) {
        assert_eq!(monitor.poll(now, None).status, "incomplete");
    }
    assert_eq!(monitor.content_checks(), 1 + MAX_RETRIES as u64);
    assert!(monitor.validate_candidate(&"f".repeat(64), None).is_err());
}

#[test]
fn candidate_acceptance_rejects_tampered_bytes_and_atomic_replacement() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("working.map");
    write(&path, &changed(0), 0);
    let mut monitor = monitor(&path);
    baseline(&mut monitor);
    write(&path, &changed(1), 1);
    monitor.poll(4000, None);
    let candidate = monitor.poll(6000, None).candidate.unwrap();
    write(&path, &changed(2), 2);
    assert!(monitor.validate_candidate(&candidate.sha256, None).is_err());
    assert!(monitor
        .snapshot_candidate(&candidate.sha256, &temp.path().join("wrong.map"), None)
        .is_err());
    assert!(!temp.path().join("wrong.map").exists());
    fs::remove_file(&path).unwrap();
    assert_eq!(monitor.poll(8000, None).status, "unavailable");
    let replacement = temp.path().join("replacement.map");
    write(&replacement, &changed(3), 3);
    fs::rename(replacement, &path).unwrap();
    assert_eq!(monitor.poll(10000, None).status, "saving");
    assert!(monitor.poll(12000, None).candidate.is_some());
}

#[test]
fn new_preserved_revision_deduplicates_without_mutating_old_authored_project() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("working.map");
    write(&path, &changed(0), 0);
    let library = Library::open(&temp.path().join("library")).unwrap();
    let (mut old, old_inspection) = library.import_map(&path, None).unwrap();
    old.tag_edits.push(spark_core::project::TagEdit {
        tag_id: old_inspection.tags[1].id,
        field_key: old_inspection.tags[1]
            .fields
            .iter()
            .find(|field| field.offset == 0x1804)
            .unwrap()
            .key
            .clone(),
        value: serde_json::json!(3),
    });
    library.save(&old, Some(&old_inspection)).unwrap();
    let preserved = old.source.as_ref().unwrap().preserved_path.clone();
    let mut monitor = monitor(&path);
    baseline(&mut monitor);
    write(&path, &changed(1), 1);
    monitor.poll(4000, None);
    let candidate = monitor.poll(6000, None).candidate.unwrap();
    let snapshot = temp.path().join("revision.map");
    monitor
        .snapshot_candidate(&candidate.sha256, &snapshot, None)
        .unwrap();
    let (new, _) = library.import_map(&snapshot, None).unwrap();
    let (duplicate, _) = library.import_map(&snapshot, None).unwrap();
    assert_ne!(old.id, new.id);
    assert_eq!(new.id, duplicate.id);
    assert_eq!(library.list().unwrap().len(), 2);
    assert_eq!(library.get(&old.id).unwrap().tag_edits.len(), 1);
    assert_eq!(fs::read(preserved).unwrap(), changed(0));
    assert_eq!(
        library.get(&old.id).unwrap().source.unwrap().sha256,
        old_inspection.sha256
    );
}

#[test]
fn different_cache_generation_is_a_candidate_but_never_a_clean_auto_match() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("working.map");
    write(&path, &changed(0), 0);
    let mut monitor = monitor(&path);
    baseline(&mut monitor);
    write(&path, &common::fixture(13), 1);
    monitor.poll(4000, None);
    let candidate = monitor.poll(6000, None).candidate.unwrap();
    assert!(!candidate.matches_source);
    assert_eq!(candidate.cache_version, 13);
}

#[test]
fn duplicate_tag_ids_never_become_an_external_candidate() {
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("working.map");
    write(&path, &changed(0), 0);
    let mut monitor = monitor(&path);
    baseline(&mut monitor);
    let mut bad = changed(1);
    common::put_u32(&mut bad, 0x828 + 32 + 12, 0xe0000000);
    write(&path, &bad, 1);
    monitor.poll(4000, None);
    let result = monitor.poll(6000, None);
    assert_eq!(result.status, "incomplete");
    assert!(result.candidate.is_none());
}
