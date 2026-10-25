mod common;
use common::*;
use spark_core::{audio, maps};

fn sound_fixture() -> Vec<u8> {
    let mut bytes = fixture(6);
    fourcc(&mut bytes, 0x828 + 96, "snd!");
    bytes[0x2600..0x2700].fill(0);
    put_u16(&mut bytes, 0x2606, 1);
    put_u16(&mut bytes, 0x266c, 1);
    put_u32(&mut bytes, 0x2698, 1);
    put_u32(&mut bytes, 0x269c, pointer(6, 0x4000));
    put_u32(&mut bytes, 0x403c, 1);
    put_u32(&mut bytes, 0x4040, pointer(6, 0x4100));
    text(&mut bytes, 0x4100, "missing-custom-audio");
    put_u16(&mut bytes, 0x4128, 3);
    put_u32(&mut bytes, 0x4140, 1024);
    put_u32(&mut bytes, 0x4144, 1);
    put_u32(&mut bytes, 0x4148, 999999);
    bytes
}

#[test]
fn missing_external_audio_never_becomes_a_preview_or_a_substitution() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("external.map");
    std::fs::write(&path, sound_fixture()).unwrap();
    let hash = maps::hash_file(&path).unwrap();
    let report = audio::inspect_sound(&path, &hash, 0xe0000003).unwrap();
    let permutation = &report.permutations[0];
    assert!(!permutation.available);
    assert!(!permutation.embedded);
    assert!(permutation
        .reason
        .as_ref()
        .unwrap()
        .contains("external resource"));
    assert!(audio::preview_sound(&path, &hash, 0xe0000003, 0, 0).is_err());
    assert_eq!(maps::hash_file(&path).unwrap(), hash);
    assert!(audio::inspect_sound(&path, "wrong source identity", 0xe0000003).is_err());
}

#[test]
fn audio_structure_and_embedded_ranges_are_bounded() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("bad-range.map");
    let mut bytes = sound_fixture();
    put_u32(&mut bytes, 0x4144, 0);
    std::fs::write(&path, &bytes).unwrap();
    let hash = maps::hash_file(&path).unwrap();
    let report = audio::inspect_sound(&path, &hash, 0xe0000003).unwrap();
    assert!(!report.permutations[0].available);
    assert!(audio::preview_sound(&path, &hash, 0xe0000003, 0, 0).is_err());
    put_u32(&mut bytes, 0x2698, u32::MAX);
    std::fs::write(&path, bytes).unwrap();
    let hash = maps::hash_file(&path).unwrap();
    assert!(audio::inspect_sound(&path, &hash, 0xe0000003).is_err());
}
