mod common;
use spark_core::{
    assets,
    library::Library,
    maps,
    project::{self, Asset, Project, Source},
};
use std::path::PathBuf;
fn asset(path: PathBuf) -> Asset {
    Asset {
        id: "asset".into(),
        name: "Wedge".into(),
        kind: "obj".into(),
        sha256: "a".repeat(64),
        path,
        vertices: 0,
        triangles: 0,
        has_uvs: true,
        materials: vec![],
    }
}
#[test]
fn untrusted_project_network_and_device_references_are_rejected_before_open_or_publication() {
    let root = tempfile::tempdir().unwrap();
    let lib = Library::open(&root.path().join("library")).unwrap();
    for path in [
        r"\\server.invalid\share\map.map",
        r"\\?\UNC\server.invalid\share\map.map",
        r"\\.\pipe\spark",
        r"\\?\GLOBALROOT\Device\HarddiskVolume1\file",
        "//server.invalid/share/file.obj",
        r"C:\CON.obj",
        r"C:\Users\file.obj:stream",
    ] {
        for target in ["source", "resources", "asset"] {
            let mut p = Project::new("Untrusted descriptor");
            if target == "asset" {
                p.assets.push(asset(path.into()));
            } else {
                p.source = Some(Source {
                    original_path: if target == "source" {
                        path.into()
                    } else {
                        root.path().join("not-opened.map")
                    },
                    preserved_path: root.path().join("ignored.map"),
                    sha256: "b".repeat(64),
                    cache_version: 7,
                    engine: "PC".into(),
                    scenario_path: "levels/test/bloodgulch/bloodgulch".into(),
                    archive: None,
                    resource_directory: if target == "resources" {
                        Some(path.into())
                    } else {
                        None
                    },
                    resource_sha256: Default::default(),
                    audio_resources: None,
                });
            }
            let descriptor = root.path().join("incoming.gsproject");
            project::save_project(&descriptor, &p).unwrap();
            assert!(
                lib.import_project(&descriptor)
                    .unwrap_err()
                    .to_string()
                    .contains("No referenced input was opened"),
                "{target}: {path}"
            );
            assert!(lib.list().unwrap().is_empty());
        }
    }
}
#[test]
fn invalid_project_asset_does_not_publish_a_blank_project_and_valid_copy_preserves_authoring() {
    let root = tempfile::tempdir().unwrap();
    let lib = Library::open(&root.path().join("library")).unwrap();
    let obj = root.path().join("wedge.obj");
    let original = include_bytes!("fixtures/static_wedge.obj");
    std::fs::write(&obj, original).unwrap();
    let mut p = Project::new("Portable model");
    p.assets.push(asset(obj.clone()));
    p.world_environment = Some(Default::default());
    p.render_features = Some(spark_core::render_features::RenderFeatures {
        enabled: true,
        bloom: false,
        bloom_strength: 0.2,
        bloom_threshold: 1.,
        bloom_radius: 0.2,
        exposure_ev: 0.,
        saturation: 1.,
        contrast: 1.,
        vignette: 0.,
        normal_maps: true,
        normal_strength: 1.,
        specular: true,
        specular_strength: 1.,
        self_illumination: true,
        self_illum_strength: 1.,
        quality: "balanced".into(),
        tone_mapping: "source".into(),
    });
    let descriptor = root.path().join("portable.gsproject");
    project::save_project(&descriptor, &p).unwrap();
    assert!(lib
        .import_project(&descriptor)
        .unwrap_err()
        .to_string()
        .contains("checksum changed"));
    assert!(lib.list().unwrap().is_empty());
    p.assets[0].sha256 = maps::hash_file(&obj).unwrap();
    project::save_project(&descriptor, &p).unwrap();
    let imported = lib.import_project(&descriptor).unwrap();
    assert_ne!(p.id, imported.id);
    assert_eq!(imported.assets.len(), 1);
    assert_eq!(std::fs::read(&imported.assets[0].path).unwrap(), original);
    assert_eq!(std::fs::read(&obj).unwrap(), original);
    assert!(imported.world_environment.is_some());
    assert!(imported.render_features.is_some());
    assert_eq!(lib.list().unwrap().len(), 1);
    assert!(
        assets::parse_obj(std::str::from_utf8(original).unwrap())
            .unwrap()
            .complete_uvs
    );
}
#[test]
fn obj_material_work_is_bounded_and_partial_uvs_never_become_native_ready() {
    let directives = (0..20_000)
        .map(|n| format!("usemtl attacker_{n}\n"))
        .collect::<String>();
    assert!(assets::parse_obj(&directives)
        .unwrap_err()
        .to_string()
        .contains("256 materials"));
    let source = "v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvt 1 0\nf 1/1 2/2 3\n";
    let parsed = assets::parse_obj(source).unwrap();
    assert!(parsed.has_uvs);
    assert!(!parsed.complete_uvs);
    assert_eq!(parsed.materials, ["default"]);
    let long = format!("usemtl {}\n", "m".repeat(129));
    assert!(assets::parse_obj(&long)
        .unwrap_err()
        .to_string()
        .contains("128 bytes"));
}

#[test]
fn importing_a_descriptor_forks_the_same_source_map_without_overwriting_existing_edits() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("source.map");
    // Synthetic cache tests library identity/preservation only; it is not game acceptance.
    common::write_map(&path, 7);
    let bytes = std::fs::read(&path).unwrap();
    let lib = Library::open(&root.path().join("library")).unwrap();
    let (mut existing, _) = lib.import_map(&path, None).unwrap();
    let mut incoming = existing.clone();
    incoming.title = "Imported design".into();
    incoming.scene[0].position[0] += 4.;
    let descriptor = root.path().join("same-source.gsproject");
    project::save_project(&descriptor, &incoming).unwrap();
    existing.title = "My local work".into();
    existing.scene[0].position[1] -= 2.;
    lib.save(&existing, None).unwrap();
    let before = lib.get(&existing.id).unwrap().fingerprint().unwrap();
    let imported = lib.import_project(&descriptor).unwrap();
    assert_ne!(imported.id, existing.id);
    assert_eq!(
        lib.get(&existing.id).unwrap().fingerprint().unwrap(),
        before
    );
    assert_eq!(imported.title, incoming.title);
    assert_eq!(imported.scene, incoming.scene);
    assert_eq!(lib.list().unwrap().len(), 2);
    assert_ne!(
        imported.source.as_ref().unwrap().preserved_path,
        existing.source.as_ref().unwrap().preserved_path
    );
    assert_eq!(
        std::fs::read(&imported.source.as_ref().unwrap().preserved_path).unwrap(),
        bytes
    );
    assert_eq!(std::fs::read(path).unwrap(), bytes);
}


fn project_files(root:&std::path::Path)->std::collections::BTreeMap<PathBuf,String> {
    let directory=root.join("projects");let mut result=std::collections::BTreeMap::new();
    if !directory.exists(){return result;}
    let mut pending=vec![directory.clone()];
    while let Some(dir)=pending.pop(){for entry in std::fs::read_dir(dir).unwrap(){let file=entry.unwrap().path();if file.is_dir(){pending.push(file);}else{result.insert(file.strip_prefix(&directory).unwrap().to_owned(),maps::hash_file(&file).unwrap());}}}
    result
}
#[test]
fn ten_late_asset_rejections_leave_no_map_or_obj_copies_and_retain_existing_work() {
    let root=tempfile::tempdir().unwrap();let directory=root.path().join("library");let library=Library::open(&directory).unwrap();
    let map=root.path().join("source.map");common::write_map(&map,7);let source_bytes=std::fs::read(&map).unwrap();
    let (existing,_)=library.import_map(&map,None).unwrap();let mut incoming=existing.clone();
    incoming.title="Rejected multi-asset source".into();
    let obj=root.path().join("first.obj");let obj_bytes=include_bytes!("fixtures/static_wedge.obj");std::fs::write(&obj,obj_bytes).unwrap();
    let mut first=asset(obj.clone());first.sha256=maps::hash_file(&obj).unwrap();
    let bad=root.path().join("late.obj");std::fs::write(&bad,b"not an OBJ mesh").unwrap();
    let mut last=asset(bad.clone());last.id="late-asset".into();last.sha256=maps::hash_file(&bad).unwrap();
    incoming.assets=vec![first.clone(),last];let descriptor=root.path().join("incoming.gsproject");project::save_project(&descriptor,&incoming).unwrap();
    let before=project_files(&directory);let fingerprint=library.get(&existing.id).unwrap().fingerprint().unwrap();
    for _ in 0..10 {
        assert!(library.import_project(&descriptor).is_err());
        assert_eq!(library.list().unwrap().len(),1);assert_eq!(project_files(&directory),before);
        assert_eq!(std::fs::read_dir(directory.join("projects")).unwrap().count(),1);
    }
    assert_eq!(library.get(&existing.id).unwrap().fingerprint().unwrap(),fingerprint);
    assert_eq!(std::fs::read(&map).unwrap(),source_bytes);assert_eq!(std::fs::read(&obj).unwrap(),obj_bytes);
    incoming.assets=vec![first];project::save_project(&descriptor,&incoming).unwrap();
    let imported=library.import_project(&descriptor).unwrap();assert_ne!(existing.id,imported.id);
    assert_eq!(library.list().unwrap().len(),2);assert_eq!(std::fs::read(&imported.assets[0].path).unwrap(),obj_bytes);
    assert_eq!(library.get(&existing.id).unwrap().fingerprint().unwrap(),fingerprint);
}
#[test]
fn asset_hash_duplicate_identity_and_missing_scene_metadata_refuse_before_project_creation() {
    let root=tempfile::tempdir().unwrap();let directory=root.path().join("library");let library=Library::open(&directory).unwrap();
    let obj=root.path().join("source.obj");std::fs::write(&obj,include_bytes!("fixtures/static_wedge.obj")).unwrap();
    let mut first=asset(obj.clone());first.sha256=maps::hash_file(&obj).unwrap();
    let mut incoming=Project::new("Unpublished source");let descriptor=root.path().join("incoming.gsproject");
    let mut changed=first.clone();changed.id="changed".into();changed.sha256="f".repeat(64);
    for assets in [vec![first.clone(),changed],vec![first.clone(),first.clone()]] {
        incoming.assets=assets;project::save_project(&descriptor,&incoming).unwrap();assert!(library.import_project(&descriptor).is_err());
        assert!(library.list().unwrap().is_empty());assert!(!directory.join("projects").exists());
    }
    let map=root.path().join("fixture.map");common::write_map(&map,7);incoming.scene=maps::inspect_map(&map,None).unwrap().objects;
    incoming.scene[0].asset_id=Some("missing-mesh".into());incoming.assets=vec![first];project::save_project(&descriptor,&incoming).unwrap();
    assert!(library.import_project(&descriptor).unwrap_err().to_string().contains("missing its asset metadata"));
    assert!(library.list().unwrap().is_empty());assert!(!directory.join("projects").exists());
}


#[test]
fn database_publication_failure_removes_owned_map_and_asset_files_without_touching_sources() {
    let root=tempfile::tempdir().unwrap();let directory=root.path().join("library");let library=Library::open(&directory).unwrap();
    let existing=library.create("Saved work stays").unwrap();let before=project_files(&directory);
    let map=root.path().join("source.map");common::write_map(&map,7);let map_bytes=std::fs::read(&map).unwrap();
    let obj=root.path().join("source.obj");let obj_bytes=include_bytes!("fixtures/static_wedge.obj");std::fs::write(&obj,obj_bytes).unwrap();
    let mut incoming=Project::new("New asset project");let mut mesh=asset(obj.clone());mesh.sha256=maps::hash_file(&obj).unwrap();incoming.assets.push(mesh);
    let descriptor=root.path().join("incoming.gsproject");project::save_project(&descriptor,&incoming).unwrap();
    let database=rusqlite::Connection::open(directory.join("library.sqlite3")).unwrap();
    database.execute_batch("CREATE TRIGGER reject_import BEFORE INSERT ON projects BEGIN SELECT RAISE(ABORT, 'test-owned publication failure'); END;").unwrap();
    for _ in 0..10{
        assert!(library.import_map(&map,None).is_err());assert!(library.import_project(&descriptor).is_err());
        assert_eq!(library.list().unwrap().len(),1);assert_eq!(project_files(&directory),before);
        assert_eq!(std::fs::read_dir(directory.join("projects")).unwrap().count(),1);
    }
    assert_eq!(library.get(&existing.id).unwrap().title,existing.title);
    assert_eq!(std::fs::read(&map).unwrap(),map_bytes);assert_eq!(std::fs::read(&obj).unwrap(),obj_bytes);
    database.execute_batch("DROP TRIGGER reject_import;").unwrap();
    let imported=library.import_project(&descriptor).unwrap();assert_eq!(std::fs::read(&imported.assets[0].path).unwrap(),obj_bytes);
    assert_eq!(library.list().unwrap().len(),2);
}
