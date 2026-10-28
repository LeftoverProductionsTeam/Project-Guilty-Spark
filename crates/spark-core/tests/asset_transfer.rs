use spark_core::{
    asset_transfer,
    library::Library,
    maps,
    project::{Asset, Project},
};
use std::fs;
fn setup() -> (tempfile::TempDir, Library, Project, Project, String) {
    let root = tempfile::tempdir().unwrap();
    let lib = Library::open(root.path()).unwrap();
    let mut a = Project::new("Source");
    let b = Project::new("Target");
    let id = uuid::Uuid::new_v4().to_string();
    let dir = lib.project_dir(&a.id).unwrap().join("assets");
    fs::create_dir_all(&dir).unwrap();
    let path = dir.join(format!("{id}.obj"));
    fs::write(&path, b"v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n").unwrap();
    a.assets.push(Asset {
        id: id.clone(),
        name: "Authored triangle".into(),
        kind: "obj".into(),
        sha256: maps::hash_file(&path).unwrap(),
        path,
        vertices: 3,
        triangles: 1,
        has_uvs: false,
        materials: vec![],
    });
    lib.save(&a, None).unwrap();
    lib.save(&b, None).unwrap();
    (root, lib, a, b, id)
}
#[test]
fn copies_verified_mesh_without_mutating_source_or_reusing_asset_identity() {
    let (_root, lib, a, b, id) = setup();
    let before = fs::read(&a.assets[0].path).unwrap();
    let (target, asset, parsed) = asset_transfer::copy_obj(&lib, &a.id, &id, &b.id).unwrap();
    assert_ne!(asset.id, id);
    assert_eq!(asset.sha256, a.assets[0].sha256);
    assert_eq!(parsed.mesh.indices.len(), 3);
    assert_eq!(target.assets.len(), 1);
    assert_eq!(fs::read(&a.assets[0].path).unwrap(), before);
    assert_eq!(maps::hash_file(&asset.path).unwrap(), asset.sha256);
    assert!(target.scene.is_empty());
}
#[test]
fn rejects_modified_source_unknown_identity_and_same_map_without_target_changes() {
    let (_root, lib, a, b, id) = setup();
    fs::write(&a.assets[0].path, "changed").unwrap();
    assert!(asset_transfer::copy_obj(&lib, &a.id, &id, &b.id).is_err());
    assert!(asset_transfer::copy_obj(&lib, &a.id, "../bad", &b.id).is_err());
    assert!(asset_transfer::copy_obj(&lib, &a.id, &id, &a.id).is_err());
    assert!(lib.get(&b.id).unwrap().assets.is_empty());
}
