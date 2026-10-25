mod common;
use spark_core::{mcc, safe_relative, steam};
use std::fs;
#[test]
fn metadata_scenario_basename_controls_package_filename() {
    assert_eq!(
        mcc::package_map_name("levels\\custom\\restoration").unwrap(),
        "restoration.map"
    );
    assert!(mcc::package_map_name("../stock").is_err());
}
#[test]
fn discovers_non_default_steam_library_and_mcc() {
    let d = tempfile::tempdir().unwrap();
    let steam = d.path().join("Steam");
    let lib = d.path().join("Other Library");
    fs::create_dir_all(steam.join("steamapps")).unwrap();
    fs::create_dir_all(lib.join("steamapps/common/MCC/halo1/maps")).unwrap();
    let escaped = lib.to_string_lossy().replace('\\', "\\\\");
    fs::write(
        steam.join("steamapps/libraryfolders.vdf"),
        format!("\"libraryfolders\"{{\"1\"{{\"path\"\"{escaped}\"}}}}"),
    )
    .unwrap();
    fs::write(
        lib.join("steamapps/appmanifest_976730.acf"),
        "\"AppState\"{\"appid\"\"976730\" \"installdir\"\"MCC\"}",
    )
    .unwrap();
    let libraries = steam::libraries(&steam).unwrap();
    assert!(libraries.contains(&lib));
    assert_eq!(
        steam::mcc_in_library(&lib).unwrap().unwrap(),
        lib.join("steamapps/common/MCC")
    );
}
#[test]
fn rejects_steam_manifest_path_traversal() {
    let d = tempfile::tempdir().unwrap();
    fs::create_dir_all(d.path().join("steamapps")).unwrap();
    fs::write(
        d.path().join("steamapps/appmanifest_976730.acf"),
        "\"AppState\"{\"appid\"\"976730\" \"installdir\"\"../stock\"}",
    )
    .unwrap();
    assert!(steam::mcc_in_library(d.path()).is_err());
}
#[test]
fn parses_vdf_escaped_quotes_comments_and_legacy_paths() {
    let v =
        steam::parse_vdf("// comment\n\"root\" {\"title\" \"a\\\"b\" \"path\" \"D:\\\\Games\"}")
            .unwrap();
    assert_eq!(
        v.get("root").unwrap().get("title").unwrap().text(),
        Some("a\"b")
    );
    assert_eq!(
        v.get("root").unwrap().get("path").unwrap().text(),
        Some("D:\\Games")
    );
    assert!(steam::parse_vdf("\"x\" {").is_err());
    assert!(steam::parse_vdf("}").is_err());
}
#[test]
fn initializes_owned_folders_without_touching_stock() {
    let d = tempfile::tempdir().unwrap();
    let stock = d.path().join("halo1/maps");
    fs::create_dir_all(&stock).unwrap();
    fs::write(stock.join("bloodgulch.map"), b"stock map bytes").unwrap();
    let root = mcc::initialize(d.path()).unwrap();
    assert!(root.inbox.is_dir());
    assert!(root.mods.is_dir());
    assert_eq!(
        fs::read(stock.join("bloodgulch.map")).unwrap(),
        b"stock map bytes"
    );
    mcc::initialize(d.path()).unwrap();
}
#[test]
fn refuses_unknown_guilty_spark_directory() {
    let d = tempfile::tempdir().unwrap();
    fs::create_dir_all(d.path().join("halo1/maps")).unwrap();
    fs::create_dir(d.path().join("halo1/GuiltySpark")).unwrap();
    assert!(mcc::initialize(d.path()).is_err());
}
#[test]
fn manifest_registration_preserves_existing_lines_and_backup() {
    let d = tempfile::tempdir().unwrap();
    let root = d.path().join("New Mods");
    fs::create_dir(&root).unwrap();
    let manifest = d.path().join("ModManifest.txt");
    let original = b"D:\\Existing Mods\r\nE:\\Other\\mods\r\n";
    fs::write(&manifest, original).unwrap();
    let backup = mcc::register_root(&manifest, &root).unwrap().unwrap();
    assert_eq!(fs::read(backup).unwrap(), original);
    let updated = fs::read(&manifest).unwrap();
    assert!(updated.starts_with(original));
    assert!(mcc::manifest_contains(&manifest, &root).unwrap());
    assert!(mcc::register_root(&manifest, &root).unwrap().is_none());
    assert_eq!(fs::read(manifest).unwrap(), updated);
}
#[test]
fn preserves_utf16_manifest_and_rejects_invalid_encoding() {
    let d = tempfile::tempdir().unwrap();
    let root = d.path().join("Mods");
    fs::create_dir(&root).unwrap();
    let path = d.path().join("ModManifest.txt");
    let mut bytes = vec![0xff, 0xfe];
    for n in "C:\\保存\\Mods\r\n".encode_utf16() {
        bytes.extend_from_slice(&n.to_le_bytes());
    }
    fs::write(&path, &bytes).unwrap();
    mcc::register_root(&path, &root).unwrap();
    let saved = fs::read(&path).unwrap();
    assert!(saved.starts_with(&bytes));
    assert!(mcc::manifest_contains(&path, &root).unwrap());
    fs::write(&path, [0x80, 0x81]).unwrap();
    assert!(mcc::register_root(&path, &root).is_err());
    assert_eq!(fs::read(&path).unwrap(), [0x80, 0x81]);
}
#[test]
fn registration_lock_does_not_overwrite_manifest() {
    let d = tempfile::tempdir().unwrap();
    let root = d.path().join("Mods");
    fs::create_dir(&root).unwrap();
    let manifest = d.path().join("ModManifest.txt");
    fs::write(&manifest, b"preserve").unwrap();
    fs::write(d.path().join(".guilty-spark-manifest.lock"), b"busy").unwrap();
    assert!(mcc::register_root(&manifest, &root).is_err());
    assert_eq!(fs::read(manifest).unwrap(), b"preserve");
}
#[test]
fn path_validation_rejects_traversal_streams_and_windows_devices() {
    for path in [
        "../stock",
        "maps/../bloodgulch",
        "C:\\stock",
        "/root",
        "maps//a",
        "a:stream",
        "CON.map",
        "maps/NUL",
        "a. ",
        "a\nmap",
        "a|b",
    ] {
        assert!(safe_relative(path).is_err(), "accepted {path}");
    }
    assert!(safe_relative("levels\\my_map\\my_map").is_ok());
}
#[test]
fn missing_official_metadata_is_a_blocker_not_an_invented_package() {
    let d = tempfile::tempdir().unwrap();
    fs::write(d.path().join("ModInfo.json"), "{}").unwrap();
    let report = mcc::inspect_template(d.path(), "levels\\test\\test", 1).unwrap();
    assert!(!report.valid);
    assert!(!report.scenario_matches);
    assert!(report.blockers.iter().any(|b| b.contains("Excession")));
}
