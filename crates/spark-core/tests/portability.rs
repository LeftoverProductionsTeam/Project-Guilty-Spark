mod common;
use common::*;
use spark_core::{
    build::Toolchain,
    library::Library,
    maps, portability,
    project::{self, TagEdit},
};

#[test]
fn native_noop_and_one_field_keep_every_unrelated_byte_including_signed_zero() {
    for version in [6, 7, 609, 13] {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("source.map");
        let mut bytes = fixture(version);
        put_f32(&mut bytes, 0x3008, -0.0);
        put_f32(&mut bytes, 0x300c, -0.0);
        bytes[0x5700..0x5720].copy_from_slice(&[0xa7; 32]); // Opaque native bytes outside inspected fields.
        std::fs::write(&path, &bytes).unwrap();
        let library = Library::open(&root.path().join("library")).unwrap();
        let (mut project, inspection) = library.import_map(&path, None).unwrap();
        // JavaScript JSON.stringify normalizes negative zero. Semantically
        // unchanged placements must not be reserialized while editing a tag.
        for object in &mut project.scene {
            for v in object.position.iter_mut().chain(object.rotation.iter_mut()) {
                if *v == 0.0 {
                    *v = 0.0;
                }
            }
        }
        let (noop, proof) = portability::verify_preservation(&project, &inspection).unwrap();
        assert!(proof.byte_identical);
        assert_eq!(noop, bytes);
        let tag = &inspection.tags[1];
        let field = tag
            .fields
            .iter()
            .find(|f| f.key == "bounding-radius")
            .unwrap();
        project.tag_edits.push(TagEdit {
            tag_id: tag.id,
            field_key: field.key.clone(),
            value: serde_json::json!(2.5),
        });
        let (edited, proof) = portability::verify_preservation(&project, &inspection).unwrap();
        assert!(!proof.byte_identical);
        assert!(proof.untouched_bytes_preserved);
        for at in 0..bytes.len() {
            if !(field.offset..field.offset + 4).contains(&at) {
                assert_eq!(edited[at], bytes[at], "cache {version} byte {at:X}");
            }
        }
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
        assert_eq!(
            std::fs::read(&project.source.as_ref().unwrap().preserved_path).unwrap(),
            bytes
        );
        let saved = root.path().join("saved.gsproject");
        project::save_project(&saved, &project).unwrap();
        let reopened = project::load_project(&saved).unwrap();
        assert_eq!(
            portability::verify_preservation(&reopened, &inspection)
                .unwrap()
                .0,
            edited
        );
    }
}

#[test]
fn native_scenario_additions_do_not_expand_the_original_cache_write_footprint() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("source.map");
    write_map(&path, 13);
    let original = std::fs::read(&path).unwrap();
    let library = Library::open(&root.path().join("library")).unwrap();
    let (mut project, inspection) = library.import_map(&path, None).unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    let binding = spark_core::native_asset_imports::Binding {
        id: id.clone(), source_project_id: uuid::Uuid::new_v4().to_string(),
        source_sha256: "a".repeat(64), tag_id: 17, tag_class: "scen".into(),
        tag_path: "scenery/rock".into(),
        native_path: format!("gs_assets_{}/scenery/rock", id.replace('-', "")),
        receipt_sha256: "b".repeat(64), file_count: 5,
    };
    let mut added = project.scene[0].clone();
    added.id = uuid::Uuid::new_v4().to_string();
    added.source_offset = None;
    added.rotation_offset = None;
    added.tag_id = None;
    added.asset_id = None;
    added.scale = [1.; 3];
    added.visible = true;
    added.source_model = Some(maps::SourceModelReference {
        project_id: binding.source_project_id.clone(), source_sha256: binding.source_sha256.clone(),
        tag_id: binding.tag_id, path: binding.tag_path.clone(), class: binding.tag_class.clone(),
    });
    project.native_asset_imports.push(binding);
    project.scene.push(added);
    let (input, proof) = portability::verify_preservation(&project, &inspection).unwrap();
    assert_eq!(input, original);
    assert!(proof.byte_identical && proof.untouched_bytes_preserved);
    assert!(proof.permitted_ranges.is_empty());
    project.scene.last_mut().unwrap().scale = [2.; 3];
    assert!(portability::verify_preservation(&project, &inspection).is_err());
    project.scene.last_mut().unwrap().scale = [1.; 3];
    project.native_asset_imports.clear();
    assert!(portability::verify_preservation(&project, &inspection).is_err());
    assert_eq!(std::fs::read(&path).unwrap(), original);
}

#[test]
fn reference_changes_leave_dependency_padding_untouched_and_changed_sources_fail() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("source.map");
    write_map(&path, 7);
    let library = Library::open(&root.path().join("library")).unwrap();
    let (mut project, inspection) = library.import_map(&path, None).unwrap();
    let field = inspection.tags[1]
        .fields
        .iter()
        .find(|f| f.kind == "reference")
        .unwrap();
    project.tag_edits.push(TagEdit {
        tag_id: inspection.tags[1].id,
        field_key: field.key.clone(),
        value: serde_json::json!(0xe0000003u32),
    });
    let (edited, proof) = portability::verify_preservation(&project, &inspection).unwrap();
    assert!(proof.untouched_bytes_preserved);
    let original = std::fs::read(&path).unwrap();
    assert_eq!(
        &edited[field.offset + 8..field.offset + 12],
        &original[field.offset + 8..field.offset + 12]
    );
    let changed = root.path().join("changed.map");
    std::fs::write(&changed, b"changed").unwrap();
    project.source.as_mut().unwrap().preserved_path = changed;
    assert!(portability::verify_preservation(&project, &inspection).is_err());
}

#[test]
fn edition_preflight_detects_real_class_hazards_without_equating_cache_versions() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("source.map");
    write_map(&path, 609);
    let library = Library::open(&root.path().join("library")).unwrap();
    let (project, mut inspection) = library.import_map(&path, None).unwrap();
    inspection.tags[2].class = "sotr".into();
    inspection.tags[3].class = "mod2".into();
    let targets = vec![
        "halo1-custom-edition".into(),
        "halo1-xbox".into(),
        "halo1-mcc-steam".into(),
    ];
    let report =
        portability::assess(&project, &inspection, &targets, &Toolchain::default()).unwrap();
    assert!(report.targets[0].cache_family_matches);
    assert!(report.targets[0]
        .findings
        .iter()
        .any(|f| f.code == "GENERIC_SHADER" && f.severity == "blocker"));
    assert!(report.targets[1]
        .findings
        .iter()
        .any(|f| f.code == "MODEL_CLASS"));
    assert!(!report.targets[2]
        .findings
        .iter()
        .any(|f| f.code == "GENERIC_SHADER"));
    assert!(!report.targets[0].conversion_available);
    assert!(report.targets[2].conversion_available);
    let extended = portability::assess(
        &project,
        &inspection,
        &["halo1-ce-open-sauce".into()],
        &Toolchain::default(),
    )
    .unwrap();
    assert!(extended.targets[0]
        .findings
        .iter()
        .any(|f| f.code == "GENERIC_SHADER_EXTENSION" && f.severity == "review"));
    assert!(portability::assess(
        &project,
        &inspection,
        &["fake-profile".into()],
        &Toolchain::default()
    )
    .is_err());
    assert!(portability::assess(
        &project,
        &inspection,
        &[targets[0].clone(), targets[0].clone()],
        &Toolchain::default()
    )
    .is_err());
    inspection.header.extended = true;
    assert!(
        portability::assess(&project, &inspection, &targets, &Toolchain::default())
            .unwrap()
            .targets[2]
            .findings
            .iter()
            .any(|f| f.code == "ENGINE_EXTENSIONS")
    );
}

#[test]
fn semantic_diff_resolves_relocated_datums_by_native_class_path_and_exposes_unknown_scope() {
    let root = tempfile::tempdir().unwrap();
    let path = root.path().join("source.map");
    write_map(&path, 7);
    let original = maps::inspect_map(&path, None).unwrap();
    let mut rebuilt = original.clone();
    rebuilt.header.version = 13;
    for tag in &mut rebuilt.tags {
        tag.id += 100;
        for field in &mut tag.fields {
            if field.kind == "reference" {
                if let Some(id) = field.value.as_u64() {
                    field.value = serde_json::json!(id + 100);
                }
            }
        }
    }
    let report = portability::compare(&original, &rebuilt).unwrap();
    assert_eq!(report.field_change_count, 0);
    assert_eq!(report.missing_tag_count, 0);
    assert!(report.unchanged_audited_fields > 0);
    rebuilt.tags[1]
        .fields
        .iter_mut()
        .find(|f| f.key == "bounding-radius")
        .unwrap()
        .value = serde_json::json!(2.5);
    let report = portability::compare(&original, &rebuilt).unwrap();
    assert_eq!(report.field_change_count, 1);
    assert_eq!(report.field_changes[0].field, "bounding-radius");
    assert!(report.scope.contains("Unknown fields"));
    rebuilt.tags.push(rebuilt.tags[0].clone());
    assert!(portability::compare(&original, &rebuilt).is_err());
}
