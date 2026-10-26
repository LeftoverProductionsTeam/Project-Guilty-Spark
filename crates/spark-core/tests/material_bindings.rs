use spark_core::{forge_build::audit_material_bindings,quickforge};
#[test]
fn tool_material_binding_requires_unique_shader_identity_across_classes_and_paths() {
    let mut doc=quickforge::create_arena("Material binding test","smallIndoorArena").unwrap();
    doc.materials[0].shader_path=Some("levels\\own\\shaders\\floor".into());
    let correct="levels/own/shaders/floor.shader_environment";
    assert!(audit_material_bindings(&doc,[correct,"levels/other/rock.shader_environment"]).unwrap().is_empty());
    assert!(audit_material_bindings(&doc,[correct,"levels/other/floor.shader_transparent_glass"]).unwrap()[0].contains("2 matches"));
    assert!(audit_material_bindings(&doc,[correct,"levels/other/floor.shader_environment"]).unwrap()[0].contains("2 matches"));
    assert!(!audit_material_bindings(&doc,["levels/other/floor.shader_environment"]).unwrap().is_empty());
    assert!(!audit_material_bindings(&doc,["levels/own/shaders/rock.shader_environment"]).unwrap().is_empty());
    assert!(audit_material_bindings(&doc,["LEVELS/OWN/SHADERS/FLOOR.SHADER_ENVIRONMENT"]).unwrap().is_empty());
    assert!(audit_material_bindings(&doc,["../outside.shader_environment"]).is_err());
}
