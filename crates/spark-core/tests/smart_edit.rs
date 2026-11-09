//! Parser/layout contracts, not native game acceptance. The real desktop test
//! uses owned MCC caches, pinned Invader validators and actual H1A Tool.
mod common;
use spark_core::{library::Library, maps, project::TagEdit, smart_edit};

#[test]
fn scalar_and_existing_placement_roundtrip_without_changing_opaque_bytes() {
    let root = tempfile::tempdir().unwrap();
    let input = root.path().join("fixture.map");
    common::write_map(&input, 13);
    let lib = Library::open(&root.path().join("library")).unwrap();
    let (mut project, inspection) = lib.import_map(&input, None).unwrap();
    let before = std::fs::read(&input).unwrap();
    project.tag_edits.push(TagEdit {
        tag_id: 0xe0000001,
        field_key: "bounding-radius".into(),
        value: 0.75.into(),
    });
    let object = project
        .scene
        .iter_mut()
        .find(|o| o.kind == "Scenery")
        .unwrap();
    let id = object.id.clone();
    object.position = [2., 4., 6.];
    object.rotation = [0.2, 0.3, 0.4];
    let analysis = smart_edit::analyze(&project, &inspection).unwrap();
    assert!(
        analysis.direct_blockers.is_empty(),
        "{:?}",
        analysis.direct_blockers
    );
    let output = smart_edit::apply(&before, &analysis.cells).unwrap();
    assert!(smart_edit::verify_footprint(&before, &output, &analysis.cells).unwrap() > 0);
    let copy = root.path().join("edited.map");
    std::fs::write(&copy, &output).unwrap();
    let reopened = maps::inspect_map(&copy, None).unwrap();
    assert!(smart_edit::analyze(&project, &reopened)
        .unwrap()
        .cells
        .is_empty());
    let placement = reopened.objects.iter().find(|o| o.id == id).unwrap();
    assert_eq!(placement.position, [2., 4., 6.]);
    assert_eq!(placement.rotation, [0.2, 0.3, 0.4]);
    assert_eq!(std::fs::read(input).unwrap(), before);
    assert!(
        smart_edit::read_direct_source(&project).is_err(),
        "Synthetic fixtures never count as playable direct outputs"
    );
}
#[test]
fn references_structural_changes_and_spoofed_read_offsets_do_not_gain_direct_support() {
    let root = tempfile::tempdir().unwrap();
    let input = root.path().join("fixture.map");
    common::write_map(&input, 13);
    let lib = Library::open(&root.path().join("library")).unwrap();
    let (mut project, mut inspection) = lib.import_map(&input, None).unwrap();
    let tag = inspection.tags.iter().find(|t| t.id == 0xe0000001).unwrap();
    let reference = tag
        .fields
        .iter()
        .find(|f| f.kind == "reference" && f.target_class.as_deref() == Some("proj"))
        .unwrap();
    project.tag_edits = vec![TagEdit {
        tag_id: tag.id,
        field_key: reference.key.clone(),
        value: serde_json::json!(0xe0000003u32),
    }];
    let report = smart_edit::analyze(&project, &inspection).unwrap();
    assert!(!report.direct_blockers.is_empty());
    assert!(report.cells.is_empty());
    project.tag_edits = vec![TagEdit {
        tag_id: tag.id,
        field_key: "bounding-radius".into(),
        value: 0.75.into(),
    }];
    inspection
        .tags
        .iter_mut()
        .find(|t| t.id == 0xe0000001)
        .unwrap()
        .fields
        .iter_mut()
        .find(|f| f.key == "bounding-radius")
        .unwrap()
        .offset += 8;
    assert!(!smart_edit::analyze(&project, &inspection)
        .unwrap()
        .direct_blockers
        .is_empty());
    project.tag_edits.clear();
    project.scene[0].scale = [2.; 3];
    assert!(!smart_edit::analyze(&project, &inspection)
        .unwrap()
        .direct_blockers
        .is_empty());
    project.scene.pop();
    assert!(!smart_edit::analyze(&project, &inspection)
        .unwrap()
        .direct_blockers
        .is_empty());
}


#[test]
fn ce609_scenery_radius_uses_exact_native_layout_and_preserves_every_other_byte() {
    let root=tempfile::tempdir().unwrap();let input=root.path().join("ce-fixture.map");
    let mut bytes=common::fixture(609);
    // Synthetic parser/layout evidence only. The real Windows acceptance uses
    // an owned CE map, pinned Invader CRC/info and independent rebuilt readback.
    common::fourcc(&mut bytes,0x800+0x28+32,"scen");
    std::fs::write(&input,&bytes).unwrap();
    let library=Library::open(&root.path().join("library")).unwrap();
    let(mut project,inspection)=library.import_map(&input,None).unwrap();
    project.tag_edits=vec![TagEdit{tag_id:0xe0000001,field_key:"bounding-radius".into(),value:0.75.into()}];
    let analysis=smart_edit::analyze(&project,&inspection).unwrap();
    assert!(analysis.direct_blockers.is_empty(),"{:?}",analysis.direct_blockers);
    assert_eq!(analysis.cells.len(),1);assert_eq!(analysis.cells[0].offset,0x1804);
    let copied=smart_edit::apply(&bytes,&analysis.cells).unwrap();
    assert!(smart_edit::verify_footprint(&bytes,&copied,&analysis.cells).unwrap()>0);
    let output=root.path().join("copy.map");std::fs::write(&output,&copied).unwrap();
    let readback=maps::inspect_map(&output,None).unwrap();
    assert_eq!(readback.header.version,609);assert_eq!(readback.tags.len(),inspection.tags.len());
    assert!(smart_edit::analyze(&project,&readback).unwrap().cells.is_empty());
    assert_eq!(std::fs::read(&input).unwrap(),bytes);
    assert!(smart_edit::read_direct_source(&project).is_err(),"Synthetic maps never become native output acceptance");
    let mut bad=copied;bad[0x1800]^=1;assert!(smart_edit::verify_footprint(&bytes,&bad,&analysis.cells).is_err());
    let mut external=inspection.clone();external.tags.iter_mut().find(|tag|tag.id==0xe0000001).unwrap().external=true;
    assert!(!smart_edit::analyze(&project,&external).unwrap().direct_blockers.is_empty());
    let mut spoof=inspection.clone();spoof.tags.iter_mut().find(|tag|tag.id==0xe0000001).unwrap().fields.iter_mut().find(|field|field.key=="bounding-radius").unwrap().offset+=8;
    assert!(!smart_edit::analyze(&project,&spoof).unwrap().direct_blockers.is_empty());
    for version in [5,6,7,14] {
        let mut other=inspection.clone();other.header.version=version;
        assert!(!smart_edit::analyze(&project,&other).unwrap().direct_blockers.is_empty());
    }
    for flag in ["compressed","extended","repair"] {
        let mut altered=inspection.clone();
        match flag{"compressed"=>altered.header.compressed=true,"extended"=>altered.header.extended=true,_=>altered.header.legacy_tag_size_repair=true}
        assert!(!smart_edit::analyze(&project,&altered).unwrap().direct_blockers.is_empty());
    }
    project.tag_edits[0].field_key="acceleration-scale".into();
    let rejected=smart_edit::analyze(&project,&inspection).unwrap();assert!(!rejected.direct_blockers.is_empty());assert!(rejected.cells.is_empty());
    project.tag_edits.clear();project.scene[0].position[0]+=1.;
    let rejected=smart_edit::analyze(&project,&inspection).unwrap();assert!(!rejected.direct_blockers.is_empty());assert!(rejected.cells.is_empty());
}
#[test]
fn ce_direct_copy_never_inherits_the_mcc_scalar_or_hosting_runtime_permissions() {
    use spark_core::runtime::RuntimeId;
    let root=tempfile::tempdir().unwrap();let input=root.path().join("weapon-fixture.map");common::write_map(&input,609);
    let library=Library::open(&root.path().join("library")).unwrap();let(mut project,inspection)=library.import_map(&input,None).unwrap();
    project.tag_edits=vec![TagEdit{tag_id:0xe0000001,field_key:"bounding-radius".into(),value:0.75.into()}];
    let analysis=smart_edit::analyze(&project,&inspection).unwrap();assert!(!analysis.direct_blockers.is_empty());assert!(analysis.cells.is_empty(),"Readable CE weapons are not in the scenery-only writer");
    for (runtime,version,accepted) in [(RuntimeId::MccSteam,13,true),(RuntimeId::MccSteam,609,false),(RuntimeId::ChupathingyCe,609,true),(RuntimeId::HaloCustomEdition,609,true),(RuntimeId::ChupathingyCe,13,false),(RuntimeId::OpenCe,609,false),(RuntimeId::HaloPc,7,false),(RuntimeId::HaloXbox,5,false)]{
        assert_eq!(smart_edit::direct_runtime_compatible(runtime,version),accepted);
    }
    assert!(smart_edit::is_direct_target("mcc-direct"));assert!(smart_edit::is_direct_target("ce-direct"));
    assert!(!smart_edit::is_direct_target("mcc-cea"));assert!(!smart_edit::is_direct_target("gbx-custom"));
}


#[test]
fn direct_copy_retains_original_resource_pins_without_rebinding_its_native_identity() {
    let temp=tempfile::tempdir().unwrap();let original_dir=temp.path().join("original");let generated=temp.path().join("generated");
    std::fs::create_dir_all(&original_dir).unwrap();std::fs::create_dir_all(&generated).unwrap();
    let sounds=original_dir.join("sounds.map");std::fs::write(&sounds,[2u8,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]).unwrap();
    let file=original_dir.join("source.map");let mut bytes=common::fixture(609);common::fourcc(&mut bytes,0x800+0x28+32,"scen");std::fs::write(&file,&bytes).unwrap();
    let library=Library::open(&temp.path().join("library")).unwrap();let(mut origin,inspection)=library.import_map(&file,None).unwrap();
    let pins=origin.source.as_ref().unwrap().resource_sha256.clone();assert_eq!(pins["sounds.map"],maps::hash_file(&sounds).unwrap());
    origin.source.as_mut().unwrap().audio_resources=Some(spark_core::mcc_audio::Binding{kind:"classic".into(),directory:original_dir.clone(),sha256:pins.clone()});
    origin.tag_edits=vec![TagEdit{tag_id:0xe0000001,field_key:"bounding-radius".into(),value:0.75.into()}];
    let cells=smart_edit::analyze(&origin,&inspection).unwrap().cells;let changed=smart_edit::apply(&bytes,&cells).unwrap();
    let output=generated.join("copy.map");std::fs::write(&output,changed).unwrap();
    let(mut copy,map)=library.import_map(&output,None).unwrap();assert!(copy.source.as_ref().unwrap().resource_sha256.is_empty());
    let identity=copy.source.clone().unwrap();smart_edit::bind_copy_resources(&origin,&mut copy,&map).unwrap();
    let bound=copy.source.as_ref().unwrap();assert_eq!(bound.resource_directory,origin.source.as_ref().unwrap().resource_directory);
    assert_eq!(bound.resource_sha256,pins);assert_eq!(serde_json::to_value(&bound.audio_resources).unwrap(),serde_json::to_value(&origin.source.as_ref().unwrap().audio_resources).unwrap());
    assert_eq!(bound.sha256,identity.sha256);assert_ne!(bound.sha256,origin.source.as_ref().unwrap().sha256);
    assert_eq!(bound.original_path,identity.original_path);assert_eq!(bound.preserved_path,identity.preserved_path);assert_eq!(bound.scenario_path,identity.scenario_path);assert_eq!(bound.cache_version,609);
    library.save(&copy,Some(&map)).unwrap();let reopened=library.get(&copy.id).unwrap();assert_eq!(reopened.source.as_ref().unwrap().resource_sha256,pins);
    // A subsequently changed bank must not be silently re-admitted by a map copy.
    std::fs::write(&sounds,b"changed source bank").unwrap();smart_edit::bind_copy_resources(&origin,&mut copy,&map).unwrap();
    assert_eq!(copy.source.as_ref().unwrap().resource_sha256["sounds.map"],pins["sounds.map"]);assert_ne!(maps::hash_file(&sounds).unwrap(),pins["sounds.map"]);
    let expected=serde_json::to_value(&copy).unwrap();
    let mut wrong=map.clone();wrong.header.version=13;assert!(smart_edit::bind_copy_resources(&origin,&mut copy,&wrong).is_err());assert_eq!(serde_json::to_value(&copy).unwrap(),expected);
    let mut wrong=map.clone();wrong.sha256="f".repeat(64);assert!(smart_edit::bind_copy_resources(&origin,&mut copy,&wrong).is_err());
    let mut wrong=map.clone();wrong.scenario_path="different/scenario".into();assert!(smart_edit::bind_copy_resources(&origin,&mut copy,&wrong).is_err());
    let mut wrong=map.clone();wrong.header.compressed=true;assert!(smart_edit::bind_copy_resources(&origin,&mut copy,&wrong).is_err());
    assert_eq!(serde_json::to_value(&copy).unwrap(),expected);assert_eq!(std::fs::read(&file).unwrap(),bytes);
}
