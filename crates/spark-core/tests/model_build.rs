use spark_core::{
    assets, bsp_workshop, maps, model_build,
    project::{Asset, Project},
};
fn source(root: &std::path::Path) -> Project {
    let path = root.join("wedge.obj");
    std::fs::write(&path, include_bytes!("fixtures/static_wedge.obj")).unwrap();
    let imported = assets::parse_obj(include_str!("fixtures/static_wedge.obj")).unwrap();
    let mut p = Project::new("Model source");
    let mut d = bsp_workshop::example().unwrap();
    d.materials[0].name = "example_tutorial_metal_floor".into();
    d.materials[0].shader_path =
        Some("levels/test/tutorial/shaders/example_tutorial_metal_floor".into());
    p.quick_forge = Some(d);
    p.assets.push(Asset {
        id: "mesh".into(),
        name: "Original wedge".into(),
        kind: "obj".into(),
        path: path.clone(),
        sha256: maps::hash_file(&path).unwrap(),
        vertices: imported.mesh.positions.len() / 3,
        triangles: 8,
        has_uvs: true,
        materials: imported.materials,
    });
    p.scene.push(maps::SceneObject {
        id: "custom-wedge".into(),
        name: "Original wedge".into(),
        kind: "Workshop mesh".into(),
        asset_id: Some("mesh".into()),
        position: [3., 3., 0.1],
        rotation: [0.4, -0.15, 0.12],
        scale: [1.3, 0.75, 1.4],
        visible: true,
        tag_id: None,
        source_offset: None,
        rotation_offset: None,
        source_model: None,
    });
    p
}
#[test]
fn source_hash_material_binding_and_closed_collision_are_required_before_any_native_write() {
    let dir = tempfile::tempdir().unwrap();
    let mut p = source(dir.path());
    assert_eq!(model_build::plan(&p).unwrap().models[0].triangles, 8);
    let original = std::fs::read(&p.assets[0].path).unwrap();
    p.quick_forge.as_mut().unwrap().materials[0].name = "wrong".into();
    assert!(model_build::plan(&p)
        .unwrap_err()
        .to_string()
        .contains("material"));
    p.quick_forge.as_mut().unwrap().materials[0].name = "example_tutorial_metal_floor".into();
    std::fs::write(&p.assets[0].path, b"corrupt external edit").unwrap();
    assert!(model_build::plan(&p)
        .unwrap_err()
        .to_string()
        .contains("changed"));
    std::fs::write(&p.assets[0].path, &original).unwrap();
    assert!(model_build::plan(&p).is_ok());
    let open = String::from_utf8(original.clone())
        .unwrap()
        .lines()
        .filter(|l| *l != "f 1/1 4/4 3/3")
        .collect::<Vec<_>>()
        .join("\n");
    std::fs::write(&p.assets[0].path, open).unwrap();
    p.assets[0].sha256 = maps::hash_file(&p.assets[0].path).unwrap();
    assert!(model_build::plan(&p)
        .unwrap_err()
        .to_string()
        .contains("closed"));
    assert!(!dir.path().join("tags").exists());
}
#[test]
fn transformed_models_share_only_identical_recipes_and_preserve_authored_source() {
    let dir = tempfile::tempdir().unwrap();
    let mut p = source(dir.path());
    let bytes = std::fs::read(&p.assets[0].path).unwrap();
    let fingerprint = p.fingerprint().unwrap();
    let mut copy = p.scene[0].clone();
    copy.id = "copy".into();
    copy.position = [-3., 3., 0.1];
    p.scene.push(copy);
    let plan = model_build::plan(&p).unwrap();
    assert_eq!(plan.models.len(), 1);
    assert_eq!(plan.document.placements.len(), 2);
    assert_eq!(plan.document.placements[0].rotation, [0.; 3]);
    let workspace = dir.path().join("job");
    plan.export(&workspace).unwrap();
    assert!(workspace.join("custom-model-sources.json").is_file());
    p.scene.pop();
    assert_eq!(p.fingerprint().unwrap(), fingerprint);
    assert_eq!(std::fs::read(&p.assets[0].path).unwrap(), bytes);
    p.scene[0].scale = [0.75, 2., 0.5];
    let different = model_build::plan(&p).unwrap();
    assert_ne!(plan.models[0].tag, different.models[0].tag);
    assert_ne!(plan.models[0].jms_sha256, different.models[0].jms_sha256);
    std::fs::write(&p.assets[0].path, b"changed after staging").unwrap();
    assert!(plan.verify_sources().is_err());
}

#[test]
fn native_transform_matches_z_up_yaw_and_incomplete_uvs_are_refused() {
    let dir = tempfile::tempdir().unwrap();
    let mut p = source(dir.path());
    p.scene[0].rotation = [std::f32::consts::FRAC_PI_2, 0., 0.];
    p.scene[0].scale = [2., 1., 0.5];
    let plan = model_build::plan(&p).unwrap();
    let b = plan.models[0].bounds;
    assert!((b[0][0] + 1.).abs() < 0.0001);
    assert!(b[1][0].abs() < 0.0001);
    assert!(b[0][1].abs() < 0.0001);
    assert!((b[1][1] - 4.).abs() < 0.0001);
    assert!((b[1][2] - 0.5).abs() < 0.0001);
    let text = include_str!("fixtures/static_wedge.obj").replace("f 1/1 4/4 3/3", "f 1 4/4 3/3");
    std::fs::write(&p.assets[0].path, text).unwrap();
    p.assets[0].sha256 = maps::hash_file(&p.assets[0].path).unwrap();
    assert!(model_build::plan(&p)
        .unwrap_err()
        .to_string()
        .contains("UV"));
}
