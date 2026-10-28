use spark_core::{
    maps,
    mcc_textures::{self, TextureBundle},
};
use std::{fs, io::Write};
fn put(b: &mut [u8], at: usize, n: u32) {
    b[at..at + 4].copy_from_slice(&n.to_le_bytes());
}
fn fixture() -> (
    tempfile::TempDir,
    std::collections::BTreeMap<String, String>,
) {
    let dir = tempfile::tempdir().unwrap();
    let mut logical = vec![0u8; 1100];
    put(&mut logical, 0, 1);
    let name = b"hce_ltb_ground_0";
    logical[8..8 + name.len()].copy_from_slice(name);
    let at = 8;
    for (off, n) in [
        (268, 4),
        (272, 4),
        (276, 1),
        (280, 1),
        (284, 1),
        (288, 70),
        (308, 8),
        (312, 980),
    ] {
        put(&mut logical, at + off, n);
    }
    logical[986..990].copy_from_slice(b"TCIP");
    for (off, n) in [(16, 4), (20, 4), (24, 1), (28, 1)] {
        put(&mut logical, 980 + off, n);
    }
    logical[1038..1046].copy_from_slice(&[0, 248, 0, 0, 0, 0, 0, 0]);
    fs::write(dir.path().join("testmap.imeta"), &logical[..336]).unwrap();
    let chunks: Vec<_> = logical
        .chunks(512)
        .map(|data| {
            let mut z = flate2::write::ZlibEncoder::new(Vec::new(), flate2::Compression::default());
            z.write_all(data).unwrap();
            (data.len(), z.finish().unwrap())
        })
        .collect();
    let mut file = vec![0u8; 4 + chunks.len() * 4];
    put(&mut file, 0, chunks.len() as u32);
    for (n, (size, packed)) in chunks.iter().enumerate() {
        let offset = file.len();
        put(&mut file, 4 + n * 4, offset as u32);
        file.extend_from_slice(&(*size as u32).to_le_bytes());
        file.extend_from_slice(packed);
    }
    fs::write(dir.path().join("inplace1.ipak"), file).unwrap();
    let hashes = mcc_textures::pin(dir.path(), "testmap").unwrap();
    (dir, hashes)
}
#[test]
fn matches_exact_index_and_reads_a_top_mip_across_compressed_chunks() {
    let (dir, hashes) = fixture();
    let mut bundle = TextureBundle::open(dir.path(), &hashes, "testmap").unwrap();
    let top = bundle.top_mip("hce_ltb_ground_0").unwrap();
    assert_eq!((top.width, top.height, top.format), (4, 4, "DXT1"));
    assert_eq!(top.pixels, [0, 248, 0, 0, 0, 0, 0, 0]);
    assert!(bundle.top_mip("ground").is_err());
    assert_eq!(
        mcc_textures::texture_key("levels\\test\\bitmaps\\ground", 0).unwrap(),
        "hce_ltb_ground_0"
    );
    assert!(mcc_textures::texture_key("../ground", 0).is_err());
}
#[test]
fn rejects_changed_index_and_bundle_fingerprint() {
    let (dir, mut hashes) = fixture();
    hashes.insert("mcc-textures".into(), "a".repeat(64));
    assert!(TextureBundle::open(dir.path(), &hashes, "testmap").is_err());
    hashes = mcc_textures::pin(dir.path(), "testmap").unwrap();
    fs::write(dir.path().join("testmap.imeta"), b"changed").unwrap();
    assert!(TextureBundle::open(dir.path(), &hashes, "testmap").is_err());
}
#[test]
fn rejects_bad_chunk_offsets_before_decompressing_untrusted_data() {
    let (dir, mut hashes) = fixture();
    let file = dir.path().join("inplace1.ipak");
    let mut bytes = fs::read(&file).unwrap();
    put(&mut bytes, 4, 4);
    fs::write(&file, bytes).unwrap();
    hashes.insert("inplace1.ipak".into(), maps::hash_file(&file).unwrap());
    hashes.insert(
        "mcc-textures".into(),
        mcc_textures::bundle_id(&hashes).unwrap(),
    );
    assert!(TextureBundle::open(dir.path(), &hashes, "testmap").is_err());
}
