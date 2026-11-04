mod common;
use common::*;
use spark_core::{
    build::{self, Toolchain},
    library::Library,
    maps, native_resources,
};

fn external_bitmap(version: u32) -> Vec<u8> {
    let mut bytes = fixture(version);
    fourcc(&mut bytes, 0x828 + 32, "bitm");
    bytes[0x1800..0x1e00].fill(0);
    put_u32(&mut bytes, 0x1860, 1);
    put_u32(&mut bytes, 0x1864, pointer(version, 0x4000));
    fourcc(&mut bytes, 0x4000, "bitm");
    put_u16(&mut bytes, 0x4004, 2);
    put_u16(&mut bytes, 0x4006, 2);
    put_u16(&mut bytes, 0x4008, 1);
    put_u16(&mut bytes, 0x400c, 11);
    put_u16(&mut bytes, 0x400e, 0x100);
    put_u32(&mut bytes, 0x4018, 0x100);
    put_u32(&mut bytes, 0x401c, 16);
    bytes
}
fn resource(key: &str) -> Vec<u8> {
    let mut bytes = vec![0; 0x400];
    put_u32(&mut bytes, 0, 1);
    put_u32(&mut bytes, 4, 0x180);
    put_u32(&mut bytes, 8, 0x200);
    put_u32(&mut bytes, 12, 1);
    put_u32(&mut bytes, 0x204, 16);
    put_u32(&mut bytes, 0x208, 0x100);
    text(&mut bytes, 0x180, key);
    bytes
}
#[test]
fn resident_tag_bodies_still_require_external_raw_resources() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("demo.map");
    for version in [6, 7, 609, 13] {
        std::fs::write(&path, external_bitmap(version)).unwrap();
        let inspection = maps::inspect_map(&path, None).unwrap();
        assert!(!inspection.tags[1].external);
        assert!(inspection
            .resources
            .iter()
            .any(|r| r.name == "bitmaps.map" && r.required));
        assert_eq!(std::fs::read(&path).unwrap(), external_bitmap(version));
    }
    // A sound's external raw-data bit also lives inside a resident body.
    let mut bytes = fixture(6);
    fourcc(&mut bytes, 0x828 + 32, "snd!");
    bytes[0x1800..0x1e00].fill(0);
    put_u32(&mut bytes, 0x1898, 1);
    put_u32(&mut bytes, 0x189c, pointer(6, 0x4000));
    put_u32(&mut bytes, 0x403c, 1);
    put_u32(&mut bytes, 0x4040, pointer(6, 0x4100));
    put_u32(&mut bytes, 0x4144, 1);
    std::fs::write(&path, &bytes).unwrap();
    assert!(maps::inspect_map(&path, None)
        .unwrap()
        .resources
        .iter()
        .any(|r| r.name == "sounds.map" && r.required));
}
#[test]
fn pinned_wrong_edition_or_wrong_spans_cannot_authorize_compiler_extraction() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("source.map");
    std::fs::write(&path, external_bitmap(6)).unwrap();
    let library = Library::open(&d.path().join("library")).unwrap();
    let (mut project, inspection) = library.import_map(&path, None).unwrap();
    let original = project.source.as_ref().unwrap().sha256.clone();
    let resources = d.path().join("resources");
    std::fs::create_dir(&resources).unwrap();
    // CE's __pixels resource keys cannot satisfy a Demo's _0 key even when
    // a previously selected/viewer resource hash has been recorded.
    std::fs::write(
        resources.join("bitmaps.map"),
        resource("weapons\\pistol\\pistol__pixels"),
    )
    .unwrap();
    let source = project.source.as_mut().unwrap();
    source.resource_directory = Some(resources.clone());
    source.resource_sha256 = spark_core::project::resource_hashes(&resources).unwrap();
    assert!(native_resources::review(source, &inspection, &resources).is_err());
    std::fs::write(
        resources.join("bitmaps.map"),
        resource("weapons\\pistol\\pistol_0"),
    )
    .unwrap();
    source.resource_sha256 = spark_core::project::resource_hashes(&resources).unwrap();
    assert!(native_resources::review(source, &inspection, &resources).is_ok());
    let mut wrong = resource("weapons\\pistol\\pistol_0");
    put_u32(&mut wrong, 0x208, 0x120);
    std::fs::write(resources.join("bitmaps.map"), wrong).unwrap();
    source.resource_sha256 = spark_core::project::resource_hashes(&resources).unwrap();
    assert!(native_resources::review(source, &inspection, &resources).is_err());
    assert_eq!(maps::hash_file(&path).unwrap(), original);
    let empty = d.path().join("MCC-Inbox");
    std::fs::create_dir(&empty).unwrap();
    source.resource_directory = Some(empty);
    source.resource_sha256.clear();
    let report = build::compatibility(&project, &inspection, &Toolchain::default());
    assert!(!report.ready);
    assert!(report
        .blockers
        .iter()
        .any(|line| line.contains("original bitmaps.map") || line.contains("Missing bitmaps.map")));
}
