mod common;
use common::*;
use spark_core::{
    binary::Reader,
    maps::{self, parse_header},
};
#[test]
fn bounds_known_legacy_whole_file_tag_size_without_touching_source() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("pearl.map");
    let mut bytes = fixture(7);
    let length = bytes.len() as u32;
    put_u32(&mut bytes, 0x14, length);
    std::fs::write(&path, &bytes).unwrap();
    let i = maps::inspect_map(&path, None).unwrap();
    assert!(i.header.legacy_tag_size_repair);
    assert_eq!(i.header.tag_size, 0x5000);
    assert!(i.diagnostics.iter().any(|d| d.code == "LEGACY_TAG_SIZE"));
    assert_eq!(std::fs::read(&path).unwrap(), bytes);
    let mut mcc = fixture(13);
    let n = mcc.len() as u32;
    put_u32(&mut mcc, 0x14, n);
    assert!(parse_header(&mcc, mcc.len() as u64).is_err());
}
#[test]
fn legacy_tag_names_preserve_safe_historical_forms_and_reject_traversal() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("legacy.map");
    for name in [r"effects\fan\", r"effects\\fan"] {
        let mut b = fixture(7);
        b[0xa80..0xb00].fill(0);
        text(&mut b, 0xa80, name);
        std::fs::write(&path, b).unwrap();
        let i = maps::inspect_map(&path, None).unwrap();
        assert_eq!(i.tags[3].path, name);
    }
    for name in [r"\effects\fan", r"effects\\..\outside", r"C:\effects\fan"] {
        let mut b = fixture(7);
        b[0xa80..0xb00].fill(0);
        text(&mut b, 0xa80, name);
        std::fs::write(&path, b).unwrap();
        assert!(maps::inspect_map(&path, None).is_err(), "{name}");
    }
}
#[test]
fn detects_all_families_by_header_not_filename() {
    for v in [5, 6, 7, 13, 609] {
        let b = fixture(v);
        let h = parse_header(&b, b.len() as u64).unwrap();
        assert_eq!(h.version, v);
        assert_eq!(h.demo_layout, v == 6);
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("misleading.unrelated");
        std::fs::write(&file, b).unwrap();
        let map = maps::inspect_map(&file, None).unwrap();
        assert_eq!(map.header.version, v);
        assert_eq!(map.tags.len(), 4);
        assert_eq!(map.objects.len(), 2);
    }
}
#[test]
fn rejects_truncated_and_false_magic() {
    for n in [0, 16, 2047] {
        assert!(parse_header(&vec![0; n], n as u64).is_err());
    }
    let mut b = fixture(7);
    b[0] = 0;
    assert!(parse_header(&b, b.len() as u64).is_err());
}
#[test]
fn rejects_wrong_demo_version_and_reordered_fields() {
    let mut b = fixture(6);
    put_u32(&mut b, 0x588, 7);
    assert!(parse_header(&b, b.len() as u64).is_err());
    let mut b = fixture(7);
    put_u32(&mut b, 4, 6);
    assert!(parse_header(&b, b.len() as u64).is_err());
}
#[test]
fn rejects_tag_region_overflow() {
    let mut b = fixture(7);
    put_u32(&mut b, 0x10, u32::MAX);
    put_u32(&mut b, 0x14, 0x1000);
    assert!(parse_header(&b, b.len() as u64).is_err());
}
#[test]
fn rejects_unusual_pointers_without_panicking() {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("map.map");
    for offset in [0x800, 0x838, 0x83c, 0x840] {
        let mut b = fixture(7);
        put_u32(&mut b, offset, u32::MAX);
        std::fs::write(&p, b).unwrap();
        assert!(maps::inspect_map(&p, None).is_err());
    }
}
#[test]
fn bounds_checks_reader_and_strings() {
    let r = Reader(&[1, 2, 3, 4]);
    assert!(r.bytes(usize::MAX, 2).is_err());
    assert!(r.u32(1).is_err());
    assert!(r.string(0, 4).is_err());
    assert!(Reader(&f32::NAN.to_le_bytes()).f32(0).is_err());
}
#[test]
fn detects_missing_retail_resources() {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("x.map");
    write_map(&p, 7);
    let i = maps::inspect_map(&p, None).unwrap();
    assert!(i
        .resources
        .iter()
        .any(|r| r.name == "bitmaps.map" && r.required && !r.found));
    assert!(i.diagnostics.iter().any(|d| d.code == "MISSING_RESOURCE"));
}
#[test]
fn inspection_preserves_source_exactly() {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("x.map");
    write_map(&p, 6);
    let hash = maps::hash_file(&p).unwrap();
    let i = maps::inspect_map(&p, None).unwrap();
    assert_eq!(hash, i.sha256);
    assert_eq!(hash, maps::hash_file(&p).unwrap());
    assert_eq!(
        i.tags[1]
            .fields
            .iter()
            .find(|f| f.key == "bounding-radius")
            .unwrap()
            .value,
        0.5
    );
    assert_eq!(
        i.tags[1]
            .references
            .iter()
            .find(|r| r.label.contains("projectile"))
            .unwrap()
            .target_id,
        0xe0000002
    );
}
#[test]
fn rejects_protected_names_and_duplicate_ids() {
    let d = tempfile::tempdir().unwrap();
    let p = d.path().join("x.map");
    let mut b = fixture(7);
    text(&mut b, 0x900, "..\\bad\\path");
    std::fs::write(&p, b).unwrap();
    assert!(maps::inspect_map(&p, None).is_err());
    let mut b = fixture(7);
    put_u32(&mut b, 0x828 + 32 + 12, 0xe0000000);
    std::fs::write(&p, b).unwrap();
    assert!(maps::inspect_map(&p, None).is_err());
}
#[test]
fn fuzzes_header_words_without_out_of_bounds() {
    let mut seed = 17u32;
    for _ in 0..5000 {
        let mut b = fixture(7);
        for _ in 0..5 {
            seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
            let at = (seed as usize % 512) * 4;
            seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
            put_u32(&mut b, at, seed);
        }
        let _ = parse_header(&b, b.len() as u64);
    }
}
