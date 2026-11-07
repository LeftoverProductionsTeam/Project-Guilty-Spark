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

#[test]
fn machine_readback_requires_each_authored_instance_not_just_a_matching_tag() {
    use spark_core::{maps,native_asset_imports as native,project::Project};
    let dir=tempfile::tempdir().unwrap();let file=dir.path().join("identity.map");common::write_map(&file,13);
    let before=maps::hash_file(&file).unwrap();let library=Library::open(&dir.path().join("library")).unwrap();
    let (_,mut compiled)=library.import_map(&file,None).unwrap();
    let mut project=Project::new("Imported machine identity");let id=uuid::Uuid::new_v4().to_string();let source=uuid::Uuid::new_v4().to_string();
    let binding=native::Binding{id:id.clone(),source_project_id:source.clone(),source_sha256:"a".repeat(64),tag_id:42,tag_class:"mach".into(),tag_path:"devices/door".into(),native_path:format!("gs_assets_{}/devices/door",id.replace('-',"")),receipt_sha256:"b".repeat(64),file_count:1};
    let mut tag=compiled.tags[0].clone();tag.id=4242;tag.class="mach".into();tag.path=binding.native_path.clone();compiled.tags.push(tag);
    let object=maps::SceneObject{id:uuid::Uuid::new_v4().to_string(),name:"Door".into(),kind:"Machine".into(),tag_id:Some(42),position:[8.,2.,0.],rotation:[0.;3],scale:[1.;3],visible:true,source_offset:None,rotation_offset:None,asset_id:None,source_model:Some(maps::SourceModelReference{project_id:source,source_sha256:"a".repeat(64),tag_id:42,path:"devices/door".into(),class:"mach".into()})};
    project.native_asset_imports.push(binding);project.scene.push(object.clone());
    project.validate().expect("The supported native door must survive project/Undo validation");
    let mut unknown=project.clone();unknown.scene[0].source_model.as_mut().unwrap().class="xxxx".into();assert!(unknown.validate().is_err(),"Unknown native classes remain refused");
    assert!(native::allowed_addition(&project,&object,&compiled));
    assert!(native::verify_compiled(&project,&compiled).is_err(),"A tag without a native scenario instance is not a placed door");
    let mut output=object.clone();output.tag_id=Some(4242);output.source_model=None;compiled.objects=vec![output.clone()];
    native::verify_compiled(&project,&compiled).unwrap();
    compiled.objects[0].position[0]+=1.;assert!(native::verify_compiled(&project,&compiled).is_err());compiled.objects[0]=output.clone();
    compiled.objects[0].rotation[0]=0.5;assert!(native::verify_compiled(&project,&compiled).is_err());compiled.objects[0]=output.clone();
    let mut copy=object;copy.id=uuid::Uuid::new_v4().to_string();project.scene.push(copy);
    assert!(native::verify_compiled(&project,&compiled).is_err(),"One output cannot satisfy two coincident authored instances");
    compiled.objects.push(output);native::verify_compiled(&project,&compiled).unwrap();
    compiled.objects[1].tag_id=Some(123);assert!(native::verify_compiled(&project,&compiled).is_err());
    assert_eq!(maps::hash_file(&file).unwrap(),before);
}
