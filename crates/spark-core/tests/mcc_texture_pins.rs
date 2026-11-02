use spark_core::{maps, mcc_textures};
use std::collections::BTreeMap;

#[test]
fn independent_pack_hashes_cover_every_byte_and_keep_deterministic_bundle_identity() {
    let root = tempfile::tempdir().unwrap();
    let packs = root.path().join("prebuild/paks");
    std::fs::create_dir_all(&packs).unwrap();
    std::fs::create_dir(root.path().join("maps")).unwrap();
    let mut expected = BTreeMap::new();
    for (index, name) in ["c40.imeta", "common.ipak", "inplace1.ipak", "inplace2.ipak"].iter().enumerate() {
        let path = packs.join(name);
        std::fs::write(&path, vec![index as u8; 131_073]).unwrap();
        expected.insert(name.to_string(), maps::hash_file(&path).unwrap());
    }
    let shared = root.path().join("maps/bitmaps.map");
    std::fs::write(&shared, b"owned shared bitmap bytes").unwrap();
    expected.insert("mcc-shared-bitmaps.map".into(), maps::hash_file(&shared).unwrap());
    expected.insert("mcc-textures".into(), mcc_textures::bundle_id(&expected).unwrap());
    assert_eq!(mcc_textures::pin(&packs, "c40").unwrap(), expected);
    std::fs::write(packs.join("inplace2.ipak"), vec![99; 131_073]).unwrap();
    let changed = mcc_textures::pin(&packs, "c40").unwrap();
    assert_ne!(changed["inplace2.ipak"], expected["inplace2.ipak"]);
    assert_ne!(changed["mcc-textures"], expected["mcc-textures"]);
    assert_eq!(changed["inplace1.ipak"], expected["inplace1.ipak"]);
    std::fs::remove_file(packs.join("c40.imeta")).unwrap();
    assert!(mcc_textures::pin(&packs, "c40").is_err());
    assert!(mcc_textures::pin(&packs, "../c40").is_err());
}
