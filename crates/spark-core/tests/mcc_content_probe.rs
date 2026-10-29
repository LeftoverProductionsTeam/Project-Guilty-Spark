use spark_core::mcc_content_probe::{
    probe_installation, PrerequisiteStatus, ProbeOperation, ProbeTarget,
};
use std::{fs, path::Path};

fn put(root: &Path, relative: &str, bytes: &[u8]) {
    let path = root.join(relative);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, bytes).unwrap();
}

fn cache(scenario_type: u16, classes: &[&str]) -> Vec<u8> {
    let mut bytes = vec![0u8; 4096];
    for (at, word) in [
        (0, 0x68656164u32),
        (4, 13),
        (8, 4096),
        (0x10, 2048),
        (0x14, 2048),
        (0x7fc, 0x666f6f74),
    ] {
        bytes[at..at + 4].copy_from_slice(&word.to_le_bytes());
    }
    bytes[0x20..0x24].copy_from_slice(b"test");
    bytes[0x40..0x4c].copy_from_slice(b"01.00.00.000");
    bytes[0x60..0x62].copy_from_slice(&scenario_type.to_le_bytes());
    let base = 0x4044_0000u32;
    bytes[2048..2052].copy_from_slice(&(base + 0x28).to_le_bytes());
    bytes[2060..2064].copy_from_slice(&(classes.len() as u32).to_le_bytes());
    bytes[2084..2088].copy_from_slice(&0x74616773u32.to_le_bytes());
    for (i, class) in classes.iter().enumerate() {
        assert_eq!(class.len(), 4);
        let at = 2088 + i * 32;
        let fourcc: Vec<u8> = class.bytes().rev().collect();
        bytes[at..at + 4].copy_from_slice(&fourcc);
        bytes[at + 12..at + 16].copy_from_slice(&(i as u32 + 1).to_le_bytes());
        bytes[at + 16..at + 20].copy_from_slice(&(base + 0x600).to_le_bytes());
        bytes[at + 20..at + 24].copy_from_slice(&(base + 0x700).to_le_bytes());
    }
    bytes
}

fn resource(kind: u32) -> Vec<u8> {
    let mut bytes = vec![0u8; 64];
    for (at, word) in [(0, kind), (4, 16), (8, 32), (12, 1)] {
        bytes[at..at + 4].copy_from_slice(&word.to_le_bytes());
    }
    bytes
}

fn sample(root: &Path) {
    put(
        root,
        "halo1/maps/ui.map",
        &cache(2, &["mod2", "antr", "snd!", "ustr", "senv"]),
    );
    put(
        root,
        "halo1/maps/bloodgulch.map",
        &cache(1, &["scnr", "sbsp", "bitm"]),
    );
    put(root, "halo1/maps/bitmaps.map", &resource(1));
    put(root, "halo1/maps/custom_edition/sounds.map", &resource(2));
    put(root, "halo1/maps/custom_edition/loc.map", &resource(3));
    put(root, "halo1/prebuild/paks/ui.imeta", b"index");
    put(root, "halo1/prebuild/paks/common.ipak", b"pack");
    put(root, "halo1/sound/pc/sounds_dialogs_french.fsb", b"FSB4");
    put(root, "halo1/shaders/psh.bin", b"shader");
    put(root, "halo1/halo1.dll", b"MZtest");
    put(root, "MCC/Binaries/Win64/MCC-Win64-Shipping.exe", b"MZtest");
}

#[test]
fn inventories_real_cache_classes_and_separates_presence_from_decoding() {
    let temp = tempfile::tempdir().unwrap();
    sample(temp.path());
    let before = fs::read(temp.path().join("halo1/maps/ui.map")).unwrap();
    let report = probe_installation(temp.path(), ProbeTarget::SparkInspection).unwrap();
    assert!(report.complete);
    assert!(report.bytes_read < 16 * 1024);
    assert_eq!(report.operations.len(), 4);
    let ui = report
        .files
        .iter()
        .find(|f| f.relative_path == "halo1/maps/ui.map")
        .unwrap();
    assert_eq!(ui.cache.as_ref().unwrap().tag_classes["antr"], 1);
    assert_eq!(ui.cache.as_ref().unwrap().scenario_type, 2);
    let assets = report
        .operations
        .iter()
        .find(|r| r.operation == ProbeOperation::ReadMccAssets)
        .unwrap();
    assert_eq!(assets.status, PrerequisiteStatus::Supplied);
    assert_eq!(
        assets
            .prerequisites
            .iter()
            .find(|r| r.id == "embedded-localization")
            .unwrap()
            .status,
        PrerequisiteStatus::Supplied
    );
    assert_eq!(
        assets
            .prerequisites
            .iter()
            .find(|r| r.id == "mcc-audio-banks")
            .unwrap()
            .status,
        PrerequisiteStatus::Unverified
    );
    assert_eq!(report.operations[0].status, PrerequisiteStatus::Unverified);
    let json = serde_json::to_string(&report).unwrap();
    assert!(!json.contains(&temp.path().to_string_lossy().to_string()));
    assert_eq!(
        before,
        fs::read(temp.path().join("halo1/maps/ui.map")).unwrap()
    );
}

#[test]
fn mcc_resource_names_do_not_satisfy_xbox_boot_or_ce_resources() {
    let temp = tempfile::tempdir().unwrap();
    sample(temp.path());
    for target in [ProbeTarget::ChupathingyCe, ProbeTarget::OpenCe] {
        let report = probe_installation(temp.path(), target).unwrap();
        let build = report
            .operations
            .iter()
            .find(|r| r.operation == ProbeOperation::BuildOtherTarget)
            .unwrap();
        assert_eq!(build.status, PrerequisiteStatus::Unsupported);
        assert_eq!(
            build
                .prerequisites
                .iter()
                .find(|r| r.id == "native-xbox-base-data")
                .unwrap()
                .status,
            PrerequisiteStatus::Missing
        );
        let ce = build
            .prerequisites
            .iter()
            .find(|r| r.id == "ce-resource-generation")
            .unwrap();
        assert_eq!(ce.status, PrerequisiteStatus::Unsupported);
        assert_eq!(ce.supplies.len(), 3);
        assert_eq!(
            report.operations.last().unwrap().status,
            PrerequisiteStatus::Unsupported
        );
    }
}

#[test]
fn experimental_loader_remains_separate_from_boot_and_multiplayer() {
    let temp = tempfile::tempdir().unwrap();
    sample(temp.path());
    let report = probe_installation(temp.path(), ProbeTarget::ExperimentalRemix).unwrap();
    let build = report
        .operations
        .iter()
        .find(|r| r.operation == ProbeOperation::BuildOtherTarget)
        .unwrap();
    assert_eq!(build.status, PrerequisiteStatus::Unverified);
    assert_eq!(
        build
            .prerequisites
            .iter()
            .find(|r| r.id == "mcc-loader")
            .unwrap()
            .status,
        PrerequisiteStatus::Unverified
    );
    assert_eq!(
        report.operations.last().unwrap().status,
        PrerequisiteStatus::Unsupported
    );
    assert!(report.operations.last().unwrap().prerequisites[0]
        .detail
        .contains("solo-only"));
    assert!(report
        .research
        .iter()
        .all(|pin| pin.revision.len() == 40 && pin.source.contains(&pin.revision)));
}

#[test]
fn rejects_tag_index_escape_and_reports_changed_or_truncated_files() {
    let temp = tempfile::tempdir().unwrap();
    sample(temp.path());
    let mut damaged = cache(1, &["scnr"]);
    damaged[2060..2064].copy_from_slice(&65_535u32.to_le_bytes());
    put(temp.path(), "halo1/maps/damaged.map", &damaged);
    put(temp.path(), "halo1/maps/truncated.map", b"daeh");
    put(
        temp.path(),
        "halo1/maps/custom_edition/bitmaps.map",
        &resource(2),
    );
    let report = probe_installation(temp.path(), ProbeTarget::MccHalo1).unwrap();
    for path in [
        "halo1/maps/damaged.map",
        "halo1/maps/truncated.map",
        "halo1/maps/custom_edition/bitmaps.map",
    ] {
        let file = report
            .files
            .iter()
            .find(|f| f.relative_path == path)
            .unwrap();
        assert_eq!(file.status, PrerequisiteStatus::Unverified);
        assert!(file.cache.is_none());
    }
    assert!(report
        .files
        .iter()
        .find(|f| f.relative_path.ends_with("damaged.map"))
        .unwrap()
        .detail
        .contains("escapes"));
}

#[test]
fn file_count_limit_is_explicit_and_does_not_claim_absence_outside_inventory() {
    let temp = tempfile::tempdir().unwrap();
    fs::create_dir_all(temp.path().join("halo1/maps")).unwrap();
    for i in 0..520 {
        put(
            temp.path(),
            &format!("halo1/maps/item{i:04}.txt"),
            b"unused",
        );
    }
    let report = probe_installation(temp.path(), ProbeTarget::ChupathingyCe).unwrap();
    assert!(!report.complete);
    assert_eq!(report.files.len(), 512);
    assert_eq!(report.operations[1].status, PrerequisiteStatus::Unverified);
    assert_eq!(
        report.operations[2].prerequisites[1].status,
        PrerequisiteStatus::Unverified
    );
}

#[test]
fn requires_explicit_installation_root() {
    let temp = tempfile::tempdir().unwrap();
    assert!(probe_installation(temp.path(), ProbeTarget::MccHalo1).is_err());
}

#[test]
fn invalid_candidates_are_unverified_and_an_unrelated_ui_is_not_startup_ui() {
    let temp = tempfile::tempdir().unwrap();
    put(temp.path(), "halo1/maps/ui.map", b"invalid");
    put(temp.path(), "halo1/halo1.dll", b"invalid");
    put(
        temp.path(),
        "MCC/Binaries/Win64/MCC-Win64-Shipping.exe",
        b"invalid",
    );
    let report = probe_installation(temp.path(), ProbeTarget::MccHalo1).unwrap();
    assert_eq!(report.operations[0].status, PrerequisiteStatus::Unverified);
    assert_eq!(report.operations[1].status, PrerequisiteStatus::Unverified);
    assert!(report.operations[1]
        .prerequisites
        .iter()
        .find(|p| p.id == "mcc-startup-ui")
        .is_some_and(|p| p.status == PrerequisiteStatus::Unverified));
    fs::remove_file(temp.path().join("halo1/maps/ui.map")).unwrap();
    put(temp.path(), "halo1/maps/other_ui.map", &cache(2, &["DeLa"]));
    let report = probe_installation(temp.path(), ProbeTarget::MccHalo1).unwrap();
    assert!(report.operations[1]
        .prerequisites
        .iter()
        .find(|p| p.id == "mcc-startup-ui")
        .is_some_and(|p| p.status == PrerequisiteStatus::Missing));
}

#[cfg(unix)]
#[test]
fn never_follows_linked_content_or_linked_roots() {
    use std::os::unix::fs::symlink;
    let temp = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    sample(temp.path());
    fs::write(outside.path().join("extra.map"), cache(1, &["scnr"])).unwrap();
    symlink(outside.path(), temp.path().join("halo1/maps/outside")).unwrap();
    let report = probe_installation(temp.path(), ProbeTarget::MccHalo1).unwrap();
    assert!(!report.complete);
    assert!(!report
        .files
        .iter()
        .any(|f| f.relative_path.contains("extra.map")));
    symlink(temp.path(), outside.path().join("linked-root")).unwrap();
    assert!(
        probe_installation(&outside.path().join("linked-root"), ProbeTarget::MccHalo1).is_err()
    );
}

/// Explicit local read-only acceptance. The environment path and JSON output
/// remain private; no owned cache or installation path is a public fixture.
#[test]
#[ignore = "requires an explicitly selected local MCC installation"]
fn selected_owned_installation_inventory() {
    let root = std::env::var_os("SPARK_MCC_CONTENT_ROOT").expect("select owned MCC root");
    let report = probe_installation(Path::new(&root), ProbeTarget::ExperimentalRemix).unwrap();
    assert!(report.complete, "native inventory hit its explicit bounds");
    assert!(report
        .files
        .iter()
        .any(|f| f.cache.as_ref().is_some_and(|c| c.scenario_type == 2)));
    assert!(report
        .files
        .iter()
        .any(|f| f.cache.as_ref().is_some_and(|c| c.name == "bloodgulch")));
    if let Some(output) = std::env::var_os("SPARK_MCC_CONTENT_REPORT") {
        let path = Path::new(&output);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, serde_json::to_vec_pretty(&report).unwrap()).unwrap();
    }
    println!("Inventoried {} files, read {} bytes; {} valid MCC cache indexes; native boot and networking remain untested", report.files.len(), report.bytes_read, report.files.iter().filter(|f| f.cache.is_some()).count());
}
