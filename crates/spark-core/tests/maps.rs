mod common;
use common::*;
use spark_core::{
    binary::Reader,
    maps::{self, parse_header},
};
#[test]
fn sound_scenery_accepts_ssce_and_retains_real_cross_class_warnings() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("sound-scenery.map");
    for version in [7, 13] {
        let mut bytes = fixture(version);
        fourcc(&mut bytes, 0x828 + 64, "ssce");
        put_u32(&mut bytes, 0x1000 + 0x2dc, 1);
        put_u32(&mut bytes, 0x1000 + 0x2e0, pointer(version, 0x3400));
        put_u32(&mut bytes, 0x1000 + 0x2e8, 1);
        put_u32(&mut bytes, 0x1000 + 0x2ec, pointer(version, 0x3500));
        put_u32(&mut bytes, 0x350c, 0xe0000002);
        std::fs::write(&path, &bytes).unwrap();
        let report = maps::inspect_map(&path, None).unwrap();
        assert!(report.objects.iter().any(|o| o.kind == "Sound scenery"
            && o.tag_id == Some(0xe0000002)));
        assert!(!report.diagnostics.iter().any(|d|
            d.code == "LEGACY_PLACEMENT_CLASS" && d.message.starts_with("Sound scenery")));
        // The original synthetic fixture intentionally assigns a weapon to
        // scenery. That independent, real mismatch must still be diagnosed.
        assert!(report.diagnostics.iter().any(|d|
            d.code == "LEGACY_PLACEMENT_CLASS" && d.message.starts_with("Scenery")));
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
        put_u32(&mut bytes, 0x350c, 0xe0000001);
        std::fs::write(&path, &bytes).unwrap();
        let report = maps::inspect_map(&path, None).unwrap();
        assert!(report.diagnostics.iter().any(|d|
            d.code == "LEGACY_PLACEMENT_CLASS" && d.message.starts_with("Sound scenery")));
    }
}
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
    assert_eq!(i.sha256, maps::hash_file(&path).unwrap());
    let mut mcc = fixture(13);
    let n = mcc.len() as u32;
    put_u32(&mut mcc, 0x14, n);
    assert!(parse_header(&mcc, mcc.len() as u64).is_err());
}
#[test]
fn malformed_scenario_blocks_report_unknown_content_instead_of_silent_absence() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("damaged.map");
    for (offset, code) in [
        (0x354, "PLAYER_SPAWNS_UNREADABLE"),
        (0x42c, "AI_ENCOUNTERS_UNREADABLE"),
        (0x49c, "SCRIPTS_UNREADABLE"),
    ] {
        let mut bytes = fixture(7);
        put_u32(&mut bytes, 0x1000 + offset, u32::MAX);
        std::fs::write(&path, bytes).unwrap();
        let report = maps::inspect_map(&path, None).unwrap();
        assert!(report.diagnostics.iter().any(|d| d.code == code), "{code}");
    }
    let mut bytes = fixture(7);
    put_u32(&mut bytes, 0x142c, 1);
    put_u32(&mut bytes, 0x1430, pointer(7, 0x4000));
    put_u32(&mut bytes, 0x4080, u32::MAX);
    std::fs::write(&path, bytes).unwrap();
    let report = maps::inspect_map(&path, None).unwrap();
    assert!(report
        .diagnostics
        .iter()
        .any(|d| d.code == "AI_SQUADS_UNREADABLE"));
    assert_eq!(report.encounters.len(), 1);
}
#[test]
fn actor_variant_dependencies_are_read_only_and_validate_real_tag_ids() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("actors.map");
    let mut bytes = fixture(7);
    fourcc(&mut bytes, 0x828 + 32, "actv");
    fourcc(&mut bytes, 0x828 + 64, "bipd");
    fourcc(&mut bytes, 0x828 + 96, "actr");
    fourcc(&mut bytes, 0x1804, "actr");
    put_u32(&mut bytes, 0x1810, 0xe0000003);
    fourcc(&mut bytes, 0x1814, "bipd");
    put_u32(&mut bytes, 0x1820, 0xe0000002);
    std::fs::write(&path, bytes).unwrap();
    let report = maps::inspect_map(&path, None).unwrap();
    let variant = &report.tags[1];
    assert!(variant.fields.is_empty());
    assert!(variant
        .references
        .iter()
        .any(|r| r.label == "Actor definition" && r.target_id == 0xe0000003));
    assert!(variant
        .references
        .iter()
        .any(|r| r.label == "Actor unit" && r.target_id == 0xe0000002));
}
#[test]
fn non_projectile_weapon_spawn_is_reported_without_an_editable_reference() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("legacy-spawn.map");
    let mut bytes = fixture(7);
    fourcc(&mut bytes, 0x828 + 64, "vehi");
    fourcc(&mut bytes, 0x2094, "vehi");
    std::fs::write(&path, bytes).unwrap();
    let report = maps::inspect_map(&path, None).unwrap();
    assert!(report.tags[1]
        .references
        .iter()
        .any(|r| r.label.contains("legacy object spawner") && r.target_id == 0xe0000002));
    assert!(!report.tags[1].fields.iter().any(|f| f.kind == "reference"));
    assert!(report
        .diagnostics
        .iter()
        .any(|d| d.code == "LEGACY_OBJECT_SPAWNERS"));
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
fn opensauce_signature_is_scoped_to_a_classic_header() {
    for version in [7,13,609] {
        let mut bytes=fixture(version);
        bytes[0xc00..0xc04].copy_from_slice(b"yelo");
        assert!(!parse_header(&bytes,bytes.len() as u64).unwrap().extended);
        bytes[0x200..0x204].copy_from_slice(b"oley");
        assert_eq!(parse_header(&bytes,bytes.len() as u64).unwrap().extended,version!=13);
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
