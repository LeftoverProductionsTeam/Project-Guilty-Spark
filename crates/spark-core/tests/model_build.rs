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
fn model_only_shader_is_not_a_bsp_material_and_resolves_its_real_native_class() {
    let dir = tempfile::tempdir().unwrap();
    let mut p = source(dir.path());
    let before = p.fingerprint().unwrap();
    let doc = p.quick_forge.as_mut().unwrap();
    let mut material = doc.materials[0].clone();
    // The OBJ fixture names its material explicitly, unlike the room's surface.
    doc.materials[0].name = "BSP_floor".into();
    material.id = "model-only".into();
    material.shader_path = Some("objects/own/model_surface".into());
    doc.materials.push(material);
    let authored = p.fingerprint().unwrap();
    assert_ne!(before, authored);
    let plan = model_build::plan(&p).unwrap();
    assert_eq!(p.fingerprint().unwrap(), authored);
    assert!(!plan.document.materials.iter().any(|m| m.id == "model-only"));
    let (bsp, _) = spark_core::quickforge::source_requirements(&plan.document).unwrap();
    assert!(!bsp.iter().any(|d| d.tag_path == "objects/own/model_surface"));
    let shader = "objects/own/model_surface.shader_model";
    let dependencies = plan.shader_dependencies([shader]).unwrap();
    assert_eq!(dependencies.len(), 1);
    assert_eq!(dependencies[0].tag_path, "objects/own/model_surface");
    assert_eq!(dependencies[0].tag_class, "shader_model");
    assert!(plan.models[0].jms.contains("model_surface\n<none>"));
    assert!(plan.shader_dependencies([shader, "other/model_surface.shader_environment"]).is_err());
    assert!(plan.shader_dependencies(["other/model_surface.shader_model"]).is_err());
    assert!(plan.shader_dependencies(["objects/own/model_surface.shader_transparent_glass"]).is_err());
    assert_eq!(plan.shader_dependencies(["objects/own/model_surface.shader_environment"]).unwrap()[0].tag_class, "shader_environment");
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

#[test]
fn snapping_uses_pinned_closed_source_and_rechecks_after_every_external_save() {
    let dir = tempfile::tempdir().unwrap();
    let mut p = source(dir.path());
    let asset = p.assets[0].clone();
    let original = std::fs::read(&asset.path).unwrap();
    let raw = assets::parse_obj(std::str::from_utf8(&original).unwrap()).unwrap();
    let collider =
        model_build::source_collision(&p, &asset.id, &asset.sha256, [1.; 3], [0.; 3]).unwrap();
    assert_eq!(collider.positions, raw.mesh.positions);
    assert_eq!(collider.indices, raw.mesh.indices);
    assert!(
        model_build::source_collision(&p, &asset.id, &"0".repeat(64), [1.; 3], [0.; 3]).is_err()
    );
    assert!(model_build::source_collision(&p, "foreign", &asset.sha256, [1.; 3], [0.; 3]).is_err());
    for scale in [[0., 1., 1.], [f32::NAN, 1., 1.], [1000.; 3]] {
        assert!(
            model_build::source_collision(&p, &asset.id, &asset.sha256, scale, [0.; 3]).is_err()
        );
    }
    std::fs::write(&asset.path, b"external corrupt save").unwrap();
    assert!(
        model_build::source_collision(&p, &asset.id, &asset.sha256, [1.; 3], [0.; 3])
            .unwrap_err()
            .to_string()
            .contains("changed")
    );
    std::fs::write(&asset.path, &original).unwrap();
    assert!(model_build::source_collision(&p, &asset.id, &asset.sha256, [1.; 3], [0.; 3]).is_ok());
    let open = String::from_utf8(original)
        .unwrap()
        .lines()
        .filter(|s| *s != "f 1/1 4/4 3/3")
        .collect::<Vec<_>>()
        .join("\n");
    std::fs::write(&asset.path, open).unwrap();
    p.assets[0].sha256 = maps::hash_file(&asset.path).unwrap();
    assert!(
        model_build::source_collision(&p, &asset.id, &p.assets[0].sha256, [1.; 3], [0.; 3])
            .unwrap_err()
            .to_string()
            .contains("closed")
    );
}
