mod common;
use spark_core::{archive, maps};
use std::fs;

fn allow_windows_temp_cleanup(path: &std::path::Path) {
    #[cfg(windows)]
    {
        let mut permissions = fs::metadata(path).unwrap().permissions();
        #[allow(clippy::permissions_set_readonly_false)]
        // Windows read-only attribute, not Unix modes.
        permissions.set_readonly(false);
        fs::set_permissions(path, permissions).unwrap();
    }
    #[cfg(not(windows))]
    let _ = path;
}

fn crc(bytes: &[u8]) -> u32 {
    let mut value = !0u32;
    for byte in bytes {
        value ^= *byte as u32;
        for _ in 0..8 {
            value = (value >> 1) ^ if value & 1 != 0 { 0xedb88320 } else { 0 };
        }
    }
    !value
}
fn zip(entries: &[(&str, Vec<u8>)]) -> Vec<u8> {
    let mut bytes = Vec::new();
    let mut central = Vec::new();
    for (name, data) in entries {
        let offset = bytes.len() as u32;
        let mut local = vec![0u8; 30];
        local[..4].copy_from_slice(b"PK\x03\x04");
        common::put_u16(&mut local, 4, 20);
        common::put_u32(&mut local, 14, crc(data));
        common::put_u32(&mut local, 18, data.len() as u32);
        common::put_u32(&mut local, 22, data.len() as u32);
        common::put_u16(&mut local, 26, name.len() as u16);
        bytes.extend(local);
        bytes.extend(name.as_bytes());
        bytes.extend(data);
        let mut record = vec![0u8; 46];
        record[..4].copy_from_slice(b"PK\x01\x02");
        common::put_u16(&mut record, 4, 20);
        common::put_u16(&mut record, 6, 20);
        common::put_u32(&mut record, 16, crc(data));
        common::put_u32(&mut record, 20, data.len() as u32);
        common::put_u32(&mut record, 24, data.len() as u32);
        common::put_u16(&mut record, 28, name.len() as u16);
        common::put_u32(&mut record, 42, offset);
        central.extend(record);
        central.extend(name.as_bytes());
    }
    let central_at = bytes.len() as u32;
    let central_size = central.len() as u32;
    bytes.extend(central);
    let mut end = vec![0u8; 22];
    end[..4].copy_from_slice(b"PK\x05\x06");
    common::put_u16(&mut end, 8, entries.len() as u16);
    common::put_u16(&mut end, 10, entries.len() as u16);
    common::put_u32(&mut end, 12, central_size);
    common::put_u32(&mut end, 16, central_at);
    bytes.extend(end);
    bytes
}
fn central(bytes: &[u8]) -> usize {
    u32::from_le_bytes(bytes[bytes.len() - 6..bytes.len() - 2].try_into().unwrap()) as usize
}
fn rejected(bytes: &[u8]) {
    let temp = tempfile::tempdir().unwrap();
    let file = temp.path().join("hostile.zip");
    fs::write(&file, bytes).unwrap();
    assert!(archive::inventory(&file).is_err());
    assert_eq!(fs::read(&file).unwrap(), bytes);
    assert_eq!(fs::read_dir(temp.path()).unwrap().count(), 1);
}

#[test]
fn imports_maps_resources_and_receipt_but_never_archived_executables() {
    let temp = tempfile::tempdir().unwrap();
    let library = temp.path().join("library");
    fs::create_dir(&library).unwrap();
    let file = temp.path().join("release.zip");
    let bytes = zip(&[
        ("release/maps/bloodgulch.map", common::fixture(6)),
        ("release/maps/bitmaps.map", b"original resources".to_vec()),
        ("release/halo.exe", b"MZ do not execute".to_vec()),
        ("release/inject.dll", b"MZ do not load".to_vec()),
        ("broken.map", b"broken".to_vec()),
    ]);
    fs::write(&file, &bytes).unwrap();
    let original_hash = maps::hash_file(&file).unwrap();
    let inventory = archive::inventory(&file).unwrap();
    assert_eq!(inventory.entries.len(), 5);
    assert!(!inventory.entries[2].selected);
    assert_eq!(inventory.entries[2].classification, "executableBlocked");
    let imported = archive::import_archive(&file, &library).unwrap();
    assert_eq!(imported.sha256, original_hash);
    assert_eq!(
        maps::hash_file(&imported.preserved_path).unwrap(),
        original_hash
    );
    assert_eq!(fs::read(&file).unwrap(), bytes);
    assert_eq!(imported.maps.len(), 1);
    assert_eq!(imported.maps[0].entry_path, "release/maps/bloodgulch.map");
    assert!(imported.maps[0]
        .resource_directory
        .as_ref()
        .unwrap()
        .join("bitmaps.map")
        .is_file());
    assert!(!imported.root.join("content/release/halo.exe").exists());
    assert!(!imported.root.join("content/release/inject.dll").exists());
    assert!(imported
        .inventory
        .entries
        .iter()
        .find(|e| e.name == "broken.map")
        .unwrap()
        .diagnostics
        .iter()
        .any(|d| d.contains("Malformed")));
    assert!(imported.root.join("receipt.json").is_file());
    assert!(fs::metadata(&imported.preserved_path)
        .unwrap()
        .permissions()
        .readonly());
    allow_windows_temp_cleanup(&imported.preserved_path);
}
#[test]
fn rejects_traversal_absolute_stream_device_controls_and_case_collisions() {
    for name in [
        "../outside.map",
        "/absolute.map",
        "C:/absolute.map",
        "maps/file:stream.map",
        "NUL.map",
        "maps/../bad.map",
        "maps//bad.map",
        "bad\nname.map",
        "maps/CON.map",
        "folder//",
    ] {
        rejected(&zip(&[(name, b"x".to_vec())]));
    }
    rejected(&zip(&[
        ("Map.map", b"a".to_vec()),
        ("map.map", b"b".to_vec()),
    ]));
    rejected(&zip(&[
        ("folder", b"a".to_vec()),
        ("folder/map.map", b"b".to_vec()),
    ]));
}
#[test]
fn streaming_data_descriptors_must_match_the_central_record() {
    let data = b"streamed member".to_vec();
    let mut bytes = zip(&[("readme.txt", data.clone())]);
    let old_central = central(&bytes);
    let mut descriptor = vec![0u8; 16];
    descriptor[..4].copy_from_slice(b"PK\x07\x08");
    common::put_u32(&mut descriptor, 4, crc(&data));
    common::put_u32(&mut descriptor, 8, data.len() as u32);
    common::put_u32(&mut descriptor, 12, data.len() as u32);
    bytes.splice(old_central..old_central, descriptor);
    let new_central = old_central + 16;
    common::put_u16(&mut bytes, 6, 8);
    common::put_u32(&mut bytes, 14, 0);
    common::put_u32(&mut bytes, 18, 0);
    common::put_u32(&mut bytes, 22, 0);
    common::put_u16(&mut bytes, new_central + 8, 8);
    let end = bytes.len() - 22;
    common::put_u32(&mut bytes, end + 16, new_central as u32);
    let temp = tempfile::tempdir().unwrap();
    let file = temp.path().join("streamed.zip");
    fs::write(&file, &bytes).unwrap();
    assert_eq!(archive::inventory(&file).unwrap().entries.len(), 1);
    bytes[old_central + 4] ^= 1;
    rejected(&bytes);
}
#[test]
fn rejects_zip64_multidisk_limits_and_encryption_before_parsing_entries() {
    let valid = zip(&[("file.map", b"x".to_vec())]);
    let mut bad = valid.clone();
    let end = bad.len() - 22;
    common::put_u16(&mut bad, end + 10, 65535);
    rejected(&bad);
    let mut bad = valid.clone();
    let end = bad.len() - 22;
    common::put_u16(&mut bad, end + 4, 1);
    rejected(&bad);
    let mut bad = valid.clone();
    let end = bad.len() - 22;
    common::put_u16(&mut bad, end + 8, 4097);
    common::put_u16(&mut bad, end + 10, 4097);
    rejected(&bad);
    let mut bad = valid.clone();
    let at = central(&bad);
    common::put_u16(&mut bad, at + 8, 1);
    rejected(&bad);
    let mut bad = valid.clone();
    let at = central(&bad);
    common::put_u32(&mut bad, at + 24, 769 * 1024 * 1024);
    rejected(&bad);
    let mut bad = valid;
    let end = bad.len() - 22;
    common::put_u32(&mut bad, end + 12, 9 * 1024 * 1024);
    rejected(&bad);
}
#[test]
fn rejects_symlinks_local_disagreement_and_overlapping_regions() {
    let valid = zip(&[("file.map", b"x".to_vec())]);
    let mut bad = valid.clone();
    let at = central(&bad);
    common::put_u16(&mut bad, at + 4, 3 << 8 | 20);
    common::put_u32(&mut bad, at + 38, 0o120777 << 16);
    rejected(&bad);
    let mut bad = valid.clone();
    bad[30] = b'X';
    rejected(&bad);
    let mut bad = valid;
    common::put_u32(&mut bad, 18, 999);
    rejected(&bad);
    let mut bad = zip(&[("same.map", b"x".to_vec()), ("same.map", b"x".to_vec())]);
    let second = central(&bad) + 46 + "same.map".len();
    common::put_u32(&mut bad, second + 42, 0);
    rejected(&bad);
}
#[test]
fn crc_failure_cleans_only_owned_stage_and_preserves_the_source() {
    let temp = tempfile::tempdir().unwrap();
    let library = temp.path().join("library");
    fs::create_dir(&library).unwrap();
    let file = temp.path().join("corrupt.zip");
    let mut bytes = zip(&[("map.map", common::fixture(6))]);
    bytes[30 + "map.map".len() + 100] ^= 1;
    fs::write(&file, &bytes).unwrap();
    assert!(archive::import_archive(&file, &library).is_err());
    assert_eq!(fs::read(&file).unwrap(), bytes);
    assert_eq!(fs::read_dir(library.join("archives")).unwrap().count(), 0);
}
#[test]
fn supports_deflate_from_standard_zip_writer_with_crc_validation() {
    use std::io::Write;
    let temp = tempfile::tempdir().unwrap();
    let library = temp.path().join("library");
    fs::create_dir(&library).unwrap();
    let file = temp.path().join("compressed.zip");
    let mut writer = zip::ZipWriter::new(fs::File::create(&file).unwrap());
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    writer.start_file("fixture.map", options).unwrap();
    writer.write_all(&common::fixture(609)).unwrap();
    writer.finish().unwrap();
    let imported = archive::import_archive(&file, &library).unwrap();
    assert_eq!(imported.maps.len(), 1);
    allow_windows_temp_cleanup(&imported.preserved_path);
}
