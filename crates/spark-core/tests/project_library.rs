mod common;
use spark_core::{
    binary::Reader,
    library::Library,
    maps,
    project::{self, TagEdit},
};
#[test]
fn imports_deduplicates_and_preserves_source() {
    let d = tempfile::tempdir().unwrap();
    let map = d.path().join("input.map");
    common::write_map(&map, 6);
    let lib = Library::open(&d.path().join("library")).unwrap();
    let (p, i) = lib.import_map(&map, None).unwrap();
    let (p2, _) = lib.import_map(&map, None).unwrap();
    assert_eq!(p.id, p2.id);
    assert_eq!(lib.list().unwrap().len(), 1);
    assert_eq!(maps::hash_file(&map).unwrap(), i.sha256);
    assert_eq!(
        maps::hash_file(&p.source.unwrap().preserved_path).unwrap(),
        i.sha256
    );
}
#[test]
fn canonical_library_paths_keep_the_same_managed_source_when_reopened(){
    let d=tempfile::tempdir().unwrap();let input=d.path().join("input.map");common::write_map(&input,6);let root=d.path().join("library");std::fs::create_dir_all(&root).unwrap();let canonical=std::fs::canonicalize(&root).unwrap();let first=Library::open(&canonical).unwrap();let(mut p,_)=first.import_map(&input,None).unwrap();drop(first);let reopened=Library::open(&root).unwrap();p.title="Same owned source, new title".into();reopened.save(&p,None).unwrap();assert_eq!(reopened.get(&p.id).unwrap().title,p.title);assert_eq!(maps::hash_file(&input).unwrap(),p.source.unwrap().sha256);
}
#[test]
fn project_roundtrip_and_backup() {
    let d = tempfile::tempdir().unwrap();
    let p = project::Project::new("Restoration");
    let path = d.path().join("restoration.gsproject");
    project::save_project(&path, &p).unwrap();
    let original = std::fs::read(&path).unwrap();
    let mut changed = p.clone();
    changed.title = "Restored".into();
    project::save_project(&path, &changed).unwrap();
    assert_eq!(project::load_project(&path).unwrap().title, "Restored");
    let backups: Vec<_> = std::fs::read_dir(d.path())
        .unwrap()
        .flatten()
        .filter(|e| e.file_name().to_string_lossy().contains(".bak-"))
        .collect();
    assert_eq!(backups.len(), 1);
    assert_eq!(std::fs::read(backups[0].path()).unwrap(), original);
}
#[test]
fn sqlite_persists_metadata_across_reopen() {
    let d = tempfile::tempdir().unwrap();
    let id;
    {
        let lib = Library::open(d.path()).unwrap();
        let mut p = lib.create("First").unwrap();
        id = p.id.clone();
        p.provenance.creator = "Fonzie / Fonzeh".into();
        lib.save(&p, None).unwrap();
        lib.set_setting("sample", &42u32).unwrap();
    }
    let lib = Library::open(d.path()).unwrap();
    assert_eq!(lib.get(&id).unwrap().provenance.creator, "Fonzie / Fonzeh");
    assert_eq!(lib.setting::<u32>("sample").unwrap(), 42);
}
#[test]
fn numeric_edits_and_reference_swap_only_touch_copy() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("source.map");
    common::write_map(&path, 6);
    let source = std::fs::read(&path).unwrap();
    let lib = Library::open(&d.path().join("lib")).unwrap();
    let (mut p, i) = lib.import_map(&path, None).unwrap();
    let tag = &i.tags[1];
    let field = tag
        .fields
        .iter()
        .find(|f| f.key == "bounding-radius")
        .unwrap();
    let reference = tag.fields.iter().find(|f| f.kind == "reference").unwrap();
    p.tag_edits = vec![
        TagEdit {
            tag_id: tag.id,
            field_key: field.key.clone(),
            value: serde_json::json!(2.5),
        },
        TagEdit {
            tag_id: tag.id,
            field_key: reference.key.clone(),
            value: serde_json::json!(0xe0000003u32),
        },
    ];
    let changed = project::patched_cache(&p, &i).unwrap();
    assert_eq!(Reader(&changed).f32(field.offset).unwrap(), 2.5);
    assert_eq!(
        Reader(&changed).u32(reference.offset + 12).unwrap(),
        0xe0000003
    );
    assert_eq!(std::fs::read(&path).unwrap(), source);
    assert_eq!(
        std::fs::read(&p.source.as_ref().unwrap().preserved_path).unwrap(),
        source
    );
}
#[test]
fn rejects_forged_and_incompatible_field_edits() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("x.map");
    common::write_map(&path, 13);
    let lib = Library::open(&d.path().join("lib")).unwrap();
    let (mut p, i) = lib.import_map(&path, None).unwrap();
    p.tag_edits.push(TagEdit {
        tag_id: i.tags[1].id,
        field_key: "arbitrary-offset".into(),
        value: serde_json::json!(0),
    });
    assert!(project::validate_edits(&p, &i).is_err());
    p.tag_edits = vec![TagEdit {
        tag_id: i.tags[1].id,
        field_key: i.tags[1]
            .fields
            .iter()
            .find(|f| f.kind == "reference")
            .unwrap()
            .key
            .clone(),
        value: serde_json::json!(i.tags[0].id),
    }];
    assert!(project::validate_edits(&p, &i).is_err());
}
#[test]
fn saves_real_scenario_transforms_and_spawn_yaw() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("x.map");
    common::write_map(&path, 13);
    let lib = Library::open(&d.path().join("lib")).unwrap();
    let (mut p, i) = lib.import_map(&path, None).unwrap();
    p.scene[0].position = [4., 5., 6.];
    p.scene[1].rotation = [1.25, 0., 0.];
    let bytes = project::patched_cache(&p, &i).unwrap();
    assert_eq!(Reader(&bytes).f32(0x3008).unwrap(), 4.);
    assert_eq!(Reader(&bytes).f32(0x320c).unwrap(), 1.25);
    lib.save(&p, None).unwrap();
    assert_eq!(lib.get(&p.id).unwrap().scene[0].position, [4., 5., 6.]);
}
#[test]
fn invalid_projects_cannot_escape_library_or_forge_source() {
    let d = tempfile::tempdir().unwrap();
    let lib = Library::open(d.path()).unwrap();
    assert!(lib.project_dir("../bad").is_err());
    let mut p = lib.create("safe").unwrap();
    p.schema_version = 999;
    assert!(lib.save(&p, None).is_err());
    p.schema_version = 1;
    p.title = "".into();
    assert!(p.validate().is_err());
}
#[test]
fn modified_preserved_source_blocks_export() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("x.map");
    common::write_map(&path, 13);
    let lib = Library::open(&d.path().join("lib")).unwrap();
    let (p, i) = lib.import_map(&path, None).unwrap();
    let preserved = &p.source.as_ref().unwrap().preserved_path;
    let mut permissions = std::fs::metadata(preserved).unwrap().permissions();
    assert!(permissions.readonly());
    // Deliberately defeat the preservation flag to simulate external tampering.
    #[cfg(windows)]
    #[allow(clippy::permissions_set_readonly_false)]
    // Only the Windows read-only attribute is cleared.
    permissions.set_readonly(false);
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        permissions.set_mode(permissions.mode() | 0o200);
    }
    std::fs::set_permissions(preserved, permissions).unwrap();
    std::fs::write(preserved, b"altered").unwrap();
    assert!(project::patched_cache(&p, &i).is_err());
}
#[test]
fn resource_identity_changes_invalidate_project_fingerprint() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("x.map");
    common::write_map(&path, 7);
    std::fs::write(d.path().join("sounds.map"), b"original resource").unwrap();
    let lib = Library::open(&d.path().join("lib")).unwrap();
    let (mut p, _) = lib.import_map(&path, Some(d.path())).unwrap();
    let before = p.fingerprint().unwrap();
    assert_eq!(p.source.as_ref().unwrap().resource_sha256.len(), 1);
    std::fs::write(d.path().join("sounds.map"), b"replacement resource").unwrap();
    p.source.as_mut().unwrap().resource_sha256 = project::resource_hashes(d.path()).unwrap();
    assert_ne!(before, p.fingerprint().unwrap());
    p.source
        .as_mut()
        .unwrap()
        .resource_sha256
        .insert("../private".into(), "a".repeat(64));
    assert!(p.validate().is_err());
}
#[test]
fn duplicated_game_instances_do_not_silently_export() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("x.map");
    common::write_map(&path, 13);
    let lib = Library::open(&d.path().join("lib")).unwrap();
    let (mut p, i) = lib.import_map(&path, None).unwrap();
    let mut copy = p.scene[0].clone();
    copy.id = "new-instance".into();
    p.scene.push(copy);
    assert!(project::patched_cache(&p, &i).is_err());
}
#[test]
fn exported_asset_workspace_reingests_meshes_with_integrity() {
    let d = tempfile::tempdir().unwrap();
    let obj = d.path().join("mesh.obj");
    std::fs::write(&obj, "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3").unwrap();
    let mut p = project::Project::new("mesh project");
    let aid = uuid::Uuid::new_v4().to_string();
    p.assets.push(project::Asset {
        id: aid.clone(),
        name: "mesh.obj".into(),
        kind: "obj".into(),
        sha256: maps::hash_file(&obj).unwrap(),
        path: obj,
        vertices: 3,
        triangles: 1,
        has_uvs: false,
        materials: vec![],
    });
    p.scene.push(spark_core::maps::SceneObject {
        id: "mesh".into(),
        name: "mesh".into(),
        kind: "Workshop mesh".into(),
        tag_id: None,
        position: [1., 2., 3.],
        rotation: [0.; 3],
        scale: [1.; 3],
        visible: true,
        source_offset: None,
        rotation_offset: None,
        asset_id: Some(aid),
        source_model: None,
    });
    let descriptor = d.path().join("export.gsproject");
    project::save_project(&descriptor, &p).unwrap();
    let lib = Library::open(&d.path().join("lib")).unwrap();
    let imported = lib.import_project(&descriptor).unwrap();
    assert_eq!(imported.scene[0].position, [1., 2., 3.]);
    assert_eq!(imported.assets[0].vertices, 3);
    assert!(imported.assets[0].path.is_file());
    assert_eq!(
        imported.scene[0].asset_id.as_deref(),
        Some(imported.assets[0].id.as_str())
    );
}
