mod common;
use spark_core::{runtime::*, runtime_content::prepare_ce_resources};
use std::{fs, path::Path};
fn bank(kind: u32) -> Vec<u8> {
    let mut b = vec![0; 80];
    common::put_u32(&mut b, 0, kind);
    common::put_u32(&mut b, 4, 16);
    common::text(&mut b, 16, "sound/test");
    common::put_u32(&mut b, 8, 64);
    common::put_u32(&mut b, 12, 1);
    common::put_u32(&mut b, 64, 0);
    common::put_u32(&mut b, 68, 8);
    common::put_u32(&mut b, 72, 48);
    b
}
fn content(root: &Path, version: u32) {
    fs::create_dir_all(root.join("maps")).unwrap();
    fs::write(root.join("maps/ui.map"), common::fixture(version)).unwrap();
}
fn source(root: &Path) {
    content(root, 609);
    for (name, kind) in [("bitmaps.map", 1), ("sounds.map", 2), ("loc.map", 3)] {
        fs::write(root.join("maps").join(name), bank(kind)).unwrap();
    }
}
#[test]
fn ce_banks_publish_once_with_independent_bytes_and_preserved_sources() {
    let a = tempfile::tempdir().unwrap();
    let b = tempfile::tempdir().unwrap();
    source(a.path());
    content(b.path(), 5);
    let first = prepare_ce_resources(b.path(), a.path()).unwrap();
    assert_eq!(first.copied.len(), 3);
    assert_eq!(first.bytes_copied, 240);
    let next = prepare_ce_resources(b.path(), a.path()).unwrap();
    assert_eq!(next.reused.len(), 3);
    assert_eq!(next.bytes_copied, 0);
    fs::write(b.path().join("maps_ce/sounds.map"), b"changed output").unwrap();
    assert_eq!(fs::read(a.path().join("maps/sounds.map")).unwrap(), bank(2));
    assert!(prepare_ce_resources(b.path(), a.path())
        .unwrap_err()
        .to_string()
        .contains("not overwritten"));
    assert!(fs::read_dir(b.path().join("maps_ce"))
        .unwrap()
        .all(|item| !item
            .unwrap()
            .file_name()
            .to_string_lossy()
            .ends_with(".part")));
}
#[test]
fn wrong_native_source_and_corrupted_index_never_create_target_banks() {
    let a = tempfile::tempdir().unwrap();
    let b = tempfile::tempdir().unwrap();
    source(a.path());
    content(b.path(), 5);
    fs::write(a.path().join("maps/ui.map"), common::fixture(13)).unwrap();
    assert!(prepare_ce_resources(b.path(), a.path()).is_err());
    fs::write(a.path().join("maps/ui.map"), common::fixture(609)).unwrap();
    let mut broken = bank(3);
    common::put_u32(&mut broken, 72, u32::MAX);
    fs::write(a.path().join("maps/loc.map"), broken).unwrap();
    assert!(prepare_ce_resources(b.path(), a.path()).is_err());
    assert!(!b.path().join("maps_ce").exists());
}
#[test]
fn conflicting_target_bank_and_wrong_ui_are_preserved_without_partial_setup() {
    let a = tempfile::tempdir().unwrap();
    let b = tempfile::tempdir().unwrap();
    source(a.path());
    content(b.path(), 5);
    fs::create_dir(b.path().join("maps_ce")).unwrap();
    fs::write(b.path().join("maps_ce/loc.map"), b"user resource").unwrap();
    assert!(prepare_ce_resources(b.path(), a.path()).is_err());
    assert!(!b.path().join("maps_ce/bitmaps.map").exists());
    assert_eq!(
        fs::read(b.path().join("maps_ce/loc.map")).unwrap(),
        b"user resource"
    );
    content(b.path(), 609);
    assert!(prepare_ce_resources(b.path(), a.path()).is_err());
}
fn profile(root: &Path, id: &str, exe: &str) -> RuntimeRegistration {
    let path = root.join(exe);
    let signature: &[u8] = if cfg!(windows) {
        b"MZ\0\0synthetic-test"
    } else if cfg!(target_os = "macos") {
        b"\xcf\xfa\xed\xfesynthetic-test"
    } else {
        b"\x7fELFsynthetic-test"
    };
    fs::write(&path, signature).unwrap();
    RuntimeRegistration {
        id: id.into(),
        runtime_id: RuntimeId::OpenCe,
        root: root.into(),
        executable: path,
        data_root: None,
        version: None,
        network_version: None,
    }
}
#[test]
fn alternate_engines_survive_activation_and_failed_switches() {
    let t = tempfile::tempdir().unwrap();
    let a = profile(t.path(), "upstream", "upstream.exe");
    let b = profile(t.path(), "faber", "faber.exe");
    let mut items = vec![];
    remember_registration(&mut items, a.clone()).unwrap();
    remember_registration(&mut items, b.clone()).unwrap();
    assert_eq!(items.len(), 2);
    assert_eq!(items[0].id, "faber");
    activate_registration(&mut items, "upstream").unwrap();
    assert_eq!(items[0].id, "upstream");
    assert_eq!(items[1].id, "faber");
    fs::remove_file(&b.executable).unwrap();
    assert!(activate_registration(&mut items, "faber").is_err());
    assert_eq!(items[0].id, "upstream");
    assert_eq!(items.len(), 2);
    let mut other = a.clone();
    other.runtime_id = RuntimeId::ChupathingyCe;
    assert!(remember_registration(&mut items, other).is_err());
    assert_eq!(items.len(), 2);
}
#[test]
fn shared_launch_cannot_trust_names_versions_or_wrong_runtime_families() {
    let t = tempfile::tempdir().unwrap();
    let shared = tempfile::tempdir().unwrap();
    content(shared.path(), 5);
    let mut p = profile(t.path(), "faber", "halo.exe");
    p.data_root = Some(shared.path().into());
    p.version = Some("234".into());
    assert!(prepare_launch(&p)
        .unwrap_err()
        .to_string()
        .contains("no verified shared-folder"));
    assert_eq!(
        shared_content_interface(
            RuntimeId::OpenCe,
            "5c7368529b3ab0856f3987b1a03c62aa34c18e63ab833d35e385c8b61e2597e3"
        ),
        Some("openCe")
    );
    assert_eq!(
        shared_content_interface(
            RuntimeId::ChupathingyCe,
            "5c7368529b3ab0856f3987b1a03c62aa34c18e63ab833d35e385c8b61e2597e3"
        ),
        None
    );
}
#[test]
fn redirected_shared_content_is_rejected() {
    let a = tempfile::tempdir().unwrap();
    let b = tempfile::tempdir().unwrap();
    let external = tempfile::tempdir().unwrap();
    source(a.path());
    content(b.path(), 5);
    #[cfg(windows)]
    assert!(std::process::Command::new("cmd")
        .args(["/C", "mklink", "/J"])
        .arg(b.path().join("maps_ce"))
        .arg(external.path())
        .output()
        .unwrap()
        .status
        .success());
    #[cfg(unix)]
    std::os::unix::fs::symlink(external.path(), b.path().join("maps_ce")).unwrap();
    assert!(prepare_ce_resources(b.path(), a.path()).is_err());
    assert_eq!(fs::read_dir(external.path()).unwrap().count(), 0);
}

#[test]
fn downloaded_map_installation_checks_native_identity_and_never_overwrites() {
    let root = tempfile::tempdir().unwrap();
    content(root.path(), 5);
    let source = tempfile::tempdir().unwrap();
    let path = source.path().join("fixture.map");
    fs::write(&path, common::fixture(609)).unwrap();
    let hash = spark_core::maps::hash_file(&path).unwrap();
    let first = spark_core::runtime_content::install_map(root.path(), &path, &hash, "fixture", 609)
        .unwrap();
    assert!(!first.reused);
    assert_eq!(first.relative_path, "maps_ce/fixture.map");
    assert!(
        spark_core::runtime_content::install_map(root.path(), &path, &hash, "fixture", 609)
            .unwrap()
            .reused
    );
    for (name, version, h) in [
        ("../fixture", 609, hash.clone()),
        ("other", 609, hash.clone()),
        ("fixture", 5, hash.clone()),
        ("fixture", 609, "0".repeat(64)),
    ] {
        assert!(
            spark_core::runtime_content::install_map(root.path(), &path, &h, name, version)
                .is_err()
        );
    }
    fs::write(
        root.path().join("maps_ce/fixture.map"),
        b"different user map",
    )
    .unwrap();
    assert!(
        spark_core::runtime_content::install_map(root.path(), &path, &hash, "fixture", 609)
            .is_err()
    );
    assert_eq!(
        fs::read(root.path().join("maps_ce/fixture.map")).unwrap(),
        b"different user map"
    );
    assert_eq!(spark_core::maps::hash_file(&path).unwrap(), hash);
}
