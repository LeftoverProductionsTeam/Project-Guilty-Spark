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
fn resource_discovery_checks_late_permutations_and_rechecks_source_identity() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("resource-needs.map");
    let mut bytes = sound_fixture();
    put_u32(&mut bytes, 0x403c, 12);
    for i in 0..12 { put_u32(&mut bytes, 0x4100 + i * 124 + 68, 0); }
    std::fs::write(&path, &bytes).unwrap();
    let embedded_hash = maps::hash_file(&path).unwrap();
    assert!(!audio::requires_external_samples(&path, &embedded_hash).unwrap());
    put_u32(&mut bytes, 0x4100 + 11 * 124 + 68, 1);
    std::fs::write(&path, &bytes).unwrap();
    assert!(audio::requires_external_samples(&path, &embedded_hash).is_err());
    let hash = maps::hash_file(&path).unwrap();
    assert!(audio::requires_external_samples(&path, &hash).unwrap());
    assert_eq!(maps::hash_file(&path).unwrap(), hash);
}

#[test]
fn resource_discovery_never_treats_malformed_metadata_as_embedded_only() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("malformed.map");
    for (offset, value) in [(0x2698, 9), (0x4040, 1), (0x403c, 257), (0x4144, 2)] {
        let mut bytes = sound_fixture();
        put_u32(&mut bytes, offset, value);
        std::fs::write(&path, bytes).unwrap();
        let hash = maps::hash_file(&path).unwrap();
        assert!(audio::requires_external_samples(&path, &hash).is_err(), "offset {offset:x}");
    }
    let mut bytes = sound_fixture();
    put_u32(&mut bytes, 0x828 + 96 + 24, 1);
    std::fs::write(&path, bytes).unwrap();
    assert!(audio::requires_external_samples(&path, &maps::hash_file(&path).unwrap()).unwrap());
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

#[test]
fn batch_audio_keeps_exact_samples_order_and_source_identity_or_refuses_the_whole_request() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("pcm-chunks.map");
    let mut bytes = sound_fixture();
    put_u32(&mut bytes, 0x403c, 2);
    for i in 0..2 {
        let at = 0x4100 + i * 124;
        text(&mut bytes, at, &format!("pcm-{i}"));
        put_u16(&mut bytes, at + 40, 0);
        put_u16(&mut bytes, at + 42, if i == 0 { 1 } else { 65535 });
        put_u32(&mut bytes, at + 64, 8);
        put_u32(&mut bytes, at + 68, 0);
        put_u32(&mut bytes, at + 72, (0x5000 + i * 8) as u32);
    }
    bytes[0x5000..0x5010].copy_from_slice(&[0, 1, 0, 2, 255, 255, 0, 0, 0, 3, 0, 4, 128, 0, 127, 255]);
    std::fs::write(&path, &bytes).unwrap();
    let hash = maps::hash_file(&path).unwrap();
    let batch = audio::preview_sound_batch(&path, &hash, 0xe0000003, &[(0, 1), (0, 0)]).unwrap();
    for (preview, index) in batch.iter().zip([1, 0]) {
        let single = audio::preview_sound(&path, &hash, 0xe0000003, 0, index).unwrap();
        assert_eq!(preview.bytes, single.bytes);
        assert_eq!(preview.sha256, single.sha256);
        assert_eq!(preview.source_sample_sha256, single.source_sample_sha256);
    }
    assert!(audio::preview_sound_batch(&path, &hash, 0xe0000003, &[]).is_err());
    assert!(audio::preview_sound_batch(&path, &hash, 0xe0000003, &[(0, 0), (0, 0)]).is_err());
    assert!(audio::preview_sound_batch(&path, &hash, 0xe0000003, &[(0, 0), (0, 9)]).is_err());
    assert!(audio::preview_sound_batch(&path, "changed", 0xe0000003, &[(0, 0)]).is_err());
    assert_eq!(maps::hash_file(&path).unwrap(), hash);
}
