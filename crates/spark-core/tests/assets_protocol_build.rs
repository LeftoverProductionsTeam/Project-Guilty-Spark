mod common;
use spark_core::{
    assets,
    build::{self, Toolchain},
    library::Library,
    protocol::{self, LiveCommand, RuntimeCapabilities},
};
#[test]
fn obj_ingests_negative_indices_materials_and_uv_presence() {
    let obj = "v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nvt 0 0\nusemtl alloy\nf -4/1 -3/1 -2/1 -1/1";
    let a = assets::parse_obj(obj).unwrap();
    assert_eq!(a.mesh.positions.len(), 12);
    assert_eq!(a.mesh.indices, [0, 1, 2, 0, 2, 3]);
    assert!(a.has_uvs);
    assert_eq!(a.materials, ["alloy"]);
    assert!(a.warnings.iter().any(|w| w.contains("fan-triangulated")));
}
#[test]
fn obj_preserves_texture_seams_normals_and_material_parts() {
    let text = "v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\n\
vt 0 0\nvt 1 0\nvt 1 1\nvt 0 1\nvt 0.5 0.5\n\
vn 0 0 1\nusemtl stone\nf 1/1/1 2/2/1 3/3/1\n\
usemtl grass\nf 1/5/1 3/3/1 4/4/1";
    let result = assets::parse_obj(text).unwrap();
    assert_eq!(result.mesh.indices, [0, 1, 2, 3, 2, 4]);
    assert_eq!(result.mesh.positions.len(), 15); // UV seam creates distinct vertex
    assert_eq!(result.mesh.normals.len(), result.mesh.positions.len());
    assert_eq!(result.mesh.uvs.len(), 10);
    assert_eq!(&result.mesh.uvs[6..8], &[0.5, 0.5]);
    assert_eq!(result.mesh.parts.len(), 2);
    assert_eq!(result.mesh.parts[0].name, "stone");
    assert_eq!(result.mesh.parts[0].index_count, 3);
    assert_eq!(result.mesh.parts[1].name, "grass");
    assert_eq!(result.mesh.parts[1].index_start, 3);
}
#[test]
fn obj_generates_normals_and_rejects_bad_texture_indices() {
    let result = assets::parse_obj("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3").unwrap();
    assert_eq!(result.mesh.normals, [0.,0.,1., 0.,0.,1., 0.,0.,1.]);
    assert!(result.mesh.uvs.is_empty());
    assert!(assets::parse_obj("v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nf 1/2 2/1 3/1").is_err());
}
#[test]
fn obj_rejects_bad_indices_nonfinite_and_degenerate_faces() {
    for obj in [
        "v nan 0 0\nf 1 1 1",
        "v 0 0 0\nf 1 2 3",
        "v 0 0 0\nf 1 1",
        "v 0 0 0\nf 0 0 0",
        "v 0 0",
    ] {
        assert!(assets::parse_obj(obj).is_err());
    }
}
#[test]
fn live_commands_require_version_map_and_negotiated_capability() {
    let mut c = RuntimeCapabilities {
        adapter: "test-runtime".into(),
        protocol_version: 1,
        session_id: "session".into(),
        map_sha256: "a".into(),
        operations: vec!["setObjectTransform".into()],
        multiplayer_ai: false,
        openxr: false,
    };
    let command = LiveCommand::SetObjectTransform {
        object_id: 1,
        position: [0.; 3],
        rotation: [0.; 3],
    };
    assert!(protocol::validate(&c, "a", &command).is_ok());
    assert!(protocol::validate(&c, "b", &command).is_err());
    c.protocol_version = 2;
    assert!(protocol::validate(&c, "a", &command).is_err());
    c.protocol_version = 1;
    assert!(protocol::validate(&c, "a", &LiveCommand::ResetEncounter { encounter: 0 }).is_err());
    assert!(protocol::validate(
        &c,
        "a",
        &LiveCommand::SetObjectTransform {
            object_id: 1,
            position: [f32::INFINITY, 0., 0.],
            rotation: [0.; 3]
        }
    )
    .is_err());
}
#[test]
fn synthetic_fixtures_and_missing_tools_never_become_playable() {
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("fixture.map");
    common::write_map(&path, 6);
    let lib = Library::open(&d.path().join("lib")).unwrap();
    let (p, i) = lib.import_map(&path, None).unwrap();
    let report = build::compatibility(&p, &i, &Toolchain::default());
    assert!(!report.ready);
    assert!(report.blockers.iter().any(|b| b.contains("synthetic")));
    assert!(report.blockers.iter().any(|b| b.contains("invader-build")));
}
#[test]
fn mcc_viewer_pack_pins_do_not_become_unsupported_classic_build_resources() {
    let d=tempfile::tempdir().unwrap();let path=d.path().join("fixture.map");common::write_map(&path,13);
    let lib=Library::open(&d.path().join("lib")).unwrap();let(mut p,i)=lib.import_map(&path,None).unwrap();
    let packs=d.path().join("packs");std::fs::create_dir(&packs).unwrap();
    std::fs::write(packs.join("fixture.imeta"),b"bounded synthetic pin fixture").unwrap();std::fs::write(packs.join("common.ipak"),b"synthetic pixels").unwrap();
    let source=p.source.as_mut().unwrap();source.resource_directory=Some(packs.clone());source.resource_sha256=spark_core::mcc_textures::pin(&packs,"fixture").unwrap();
    let report=build::compatibility(&p,&i,&Toolchain::default());
    assert!(report.blockers.iter().all(|s|!s.contains("resource")),"A verified viewer pin must not be rejected as a classic resource-map key: {:?}",report.blockers);
    assert!(!report.ready,"A synthetic map still needs real tools and acceptance");
    std::fs::write(packs.join("common.ipak"),b"changed pixels").unwrap();
    let report=build::compatibility(&p,&i,&Toolchain::default());assert!(report.blockers.iter().any(|s|s.contains("MCC texture resources changed")));
}
#[test]
fn header_changes_are_not_accepted_as_conversion() {
    let mut bytes = common::fixture(6);
    common::put_u32(&mut bytes, 4, 13);
    assert_eq!(
        spark_core::maps::parse_header(&bytes, bytes.len() as u64)
            .unwrap()
            .version,
        6
    );
    let mut fake = common::fixture(7);
    common::put_u32(&mut fake, 4, 13);
    let d = tempfile::tempdir().unwrap();
    let path = d.path().join("fake.map");
    std::fs::write(&path, fake).unwrap();
    let lib = Library::open(&d.path().join("lib")).unwrap();
    let (p, i) = lib.import_map(&path, None).unwrap();
    let report = build::compatibility(&p, &i, &Toolchain::default());
    assert!(!report.ready);
    assert!(p.builds.is_empty());
}
#[test]
fn extraction_zero_exit_does_not_hide_per_tag_failures() {
    let log="Extracted levels\\map.scenario\nERROR: Failed to extract sound\\missing.sound: no resource\nExtracted 2 out of 3 matched tags with 0 warnings and 1 errors";
    assert_eq!(build::extraction_errors(log).len(), 1);
    assert!(build::extraction_errors(
        "Extracted 3 out of 3 matched tags with 0 warnings and 0 errors"
    )
    .is_empty());
}
#[test]
fn changed_recorded_resource_identity_blocks_the_build() {
    let d = tempfile::tempdir().unwrap();
    let map = d.path().join("fixture.map");
    common::write_map(&map, 6);
    let sounds = d.path().join("sounds.map");
    std::fs::write(&sounds, b"original resource identity").unwrap();
    let lib = Library::open(&d.path().join("lib")).unwrap();
    let (mut project, inspection) = lib.import_map(&map, Some(d.path())).unwrap();
    project.source.as_mut().unwrap().resource_sha256.insert(
        "sounds.map".into(),
        spark_core::maps::hash_file(&sounds).unwrap(),
    );
    std::fs::write(&sounds, b"different resources").unwrap();
    let report = build::compatibility(&project, &inspection, &Toolchain::default());
    assert!(report
        .blockers
        .iter()
        .any(|b| b.contains("sounds.map changed or is missing")));
}
