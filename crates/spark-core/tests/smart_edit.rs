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
