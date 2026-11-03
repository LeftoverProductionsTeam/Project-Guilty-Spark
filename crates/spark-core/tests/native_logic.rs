use spark_core::{bsp_workshop, forge_session, native_logic as l, quickforge as q};
fn level() -> q::QuickForgeDocument {
    let mut d = bsp_workshop::example().unwrap();
    d.placements.push(q::ForgePlacement {
        id: "door".into(),
        name: "Door".into(),
        tag_path: "levels/a10/devices/doors/door small/door small".into(),
        tag_class: "mach".into(),
        position: [14., 0., 0.],
        rotation: [0., 0., 1.5707964],
        team: 0,
        respawn_seconds: 0,
        tag_id: None,
        source_project_id: None,
        source_sha256: None,
        visible: true,
        locked: false,
        published_asset_id: None,
    });
    d.logic=Some(serde_json::from_value(serde_json::json!({"schemaVersion":1,"triggers":[{"id":"volume","name":"Entry","position":[11.,0.,1.5],"rotation":[0.,0.,0.],"dimensions":[3.,4.,3.],"visible":true,"locked":false}],"devices":[{"placementId":"door","initialPosition":0.,"powered":true}],"rules":[{"id":"enter","name":"Entry opens door","enabled":true,"once":true,"event":{"kind":"enter","triggerId":"volume"},"actions":[{"kind":"devicePosition","targetId":"door","value":1.}]}]})).unwrap());
    d
}
#[test]
fn optional_logic_preserves_old_documents_and_does_not_change_geometry_buffers() {
    let d = bsp_workshop::example().unwrap();
    let encoded = serde_json::to_value(&d).unwrap();
    assert!(encoded.get("logic").is_none());
    assert_eq!(d, serde_json::from_value(encoded).unwrap());
    let next = level();
    assert_eq!(q::export_jms(&d).unwrap(), q::export_jms(&next).unwrap());
    assert!(q::validate(&next).unwrap().logic_preview.is_some());
}
#[test]
fn exports_standard_named_scenario_bindings_and_separate_hsc_without_overwriting() {
    let d = level();
    let tmp = tempfile::tempdir().unwrap();
    let out = tmp.path().join("export");
    let export = q::export_sources(&d, &out).unwrap();
    let hsc = l::script_path(&out, &export.scenario_path).unwrap();
    let generated = l::generate(&d).unwrap().unwrap();
    assert_eq!(std::fs::read_to_string(&hsc).unwrap(), generated.content);
    assert!(generated.content.contains("volume_test_objects"));
    assert!(generated.content.contains("device_set_position"));
    assert!(!generated.content.contains(".yelo"));
    let commands = q::scenario_commands(&d).unwrap();
    let naming = commands.iter().find(|c| c.phase == "logic-names").unwrap();
    assert!(naming.args.iter().any(|v| v == "-n"));
    assert!(!naming
        .args
        .iter()
        .any(|v| v.contains("object_type") || v.contains("object_index")));
    assert!(commands
        .iter()
        .filter(|c| c.phase != "logic-names")
        .all(|c| !c.args.iter().any(|v| v == "-n")));
    std::fs::write(&hsc, b"; handwritten source\n").unwrap();
    assert!(l::export(&d, &out, &export.scenario_path).is_err());
    assert_eq!(
        std::fs::read_to_string(&hsc).unwrap(),
        "; handwritten source\n"
    );
}
#[test]
fn rejects_dangling_instance_references_invalid_basis_and_non_yielding_timers() {
    let original = level();
    for bad in 0..10 {
        let mut d = original.clone();
        let logic = d.logic.as_mut().unwrap();
        match bad {
            0 => logic.triggers.clear(),
            1 => logic.devices[0].placement_id = "missing".into(),
            2 => d.placements[0].tag_class = "scen".into(),
            3 => logic.triggers[0].rotation[1] = 0.5,
            4 => logic.triggers[0].dimensions[0] = f32::INFINITY,
            5 => {
                logic.rules[0].once = false;
                logic.rules[0].event = l::Event::Timer { seconds: 0. };
            }
            6 => {
                logic.rules[0].actions = vec![l::Action::DevicePower {
                    target_id: "door".into(),
                    value: 2.,
                }]
            }
            7 => logic.triggers[0].id = "room-a".into(),
            8 => logic.manual_source = Some("\0".into()),
            _ => {
                logic.rules[0].condition = Some(l::Condition {
                    target_id: "missing".into(),
                    at_least: 0.5,
                })
            }
        }
        assert!(l::generate(&d).is_err(), "case {bad}");
        assert_eq!(original, level());
    }
}
#[test]
fn trigger_corner_and_basis_always_use_the_native_oriented_representation() {
    for yaw in [0.0_f32, 0.7, -1.5707964] {
        let mut d = level();
        d.logic.as_mut().unwrap().triggers[0].rotation[2] = yaw;
        let commands = q::scenario_commands(&d).unwrap();
        let args = &commands
            .iter()
            .find(|c| c.args.iter().any(|v| v == "trigger_volumes[0].type"))
            .unwrap()
            .args;
        let value = args
            .iter()
            .position(|v| v == "trigger_volumes[0].type")
            .unwrap()
            + 1;
        assert_eq!(
            args[value], "rotational",
            "fixed volumes read a different bounds layout"
        );
        let corner = args
            .iter()
            .position(|v| v == "trigger_volumes[0].starting_corner")
            .unwrap()
            + 1;
        let p: Vec<f32> = args[corner]
            .split(',')
            .map(|v| v.parse().unwrap())
            .collect();
        let (s, c) = yaw.sin_cos();
        // Transform the editor center into the exported forward/left/up basis:
        // each native coordinate must be half the positive box extent.
        let offset = [11. - p[0], -p[1], 1.5 - p[2]];
        assert!((offset[0] * c + offset[1] * s - 1.5).abs() < 0.0001);
        assert!((-offset[0] * s + offset[1] * c - 2.).abs() < 0.0001);
        assert!((offset[2] - 1.5).abs() < 0.0001);
    }
}
#[test]
fn repeated_events_yield_and_real_compiler_errors_link_to_the_right_rule() {
    let mut d = level();
    let logic = d.logic.as_mut().unwrap();
    logic.rules[0].once = false;
    logic.rules[0].condition = Some(l::Condition {
        target_id: "door".into(),
        at_least: 0.9,
    });
    logic.rules[0]
        .actions
        .insert(0, l::Action::Delay { seconds: 1.5 });
    let source = l::generate(&d).unwrap().unwrap();
    assert!(source.content.contains("(sleep 45)"));
    assert!(source
        .content
        .contains("(sleep_until (not (volume_test_objects"));
    assert!(source.content.contains("device_get_position"));
    let line = source.regions[0].first_line + 3;
    let message=format!("Script compilation error: gs_logic.hsc:{line}:3: error: function 'invalid_function' is not defined");
    assert!(l::compiler_diagnostic(&source, &[message.clone()]).contains("Entry opens door"));
    let mut manual = source;
    manual.manual = true;
    assert_eq!(l::compiler_diagnostic(&manual, &[message.clone()]), message);
}
#[test]
fn names_are_stable_native_identifiers_even_for_untrusted_display_names() {
    let mut d = level();
    d.logic.as_mut().unwrap().rules[0].name = "Display text: ); arbitrary(text".into();
    let s = l::generate(&d).unwrap().unwrap();
    assert!(!s.content.contains("arbitrary(text"));
    for region in s.regions {
        assert!(region.native_name.len() <= 31);
        assert!(region
            .native_name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_'));
    }
    assert_eq!(l::native_name("obj", "door"), l::native_name("obj", "door"));
    assert_ne!(
        l::native_name("obj", "door"),
        l::native_name("obj", "door2")
    );
}
#[test]
fn collaborative_logic_merges_independent_source_edits_but_never_silently_overwrites_a_graph() {
    let base = level();
    let mut graph = base.clone();
    graph.logic.as_mut().unwrap().rules[0].once = false;
    let mut moved = base.clone();
    moved.workshop.as_mut().unwrap().brushes[0].name = "Other author".into();
    let merged = forge_session::merge(&base, &graph, &moved).unwrap();
    assert_eq!(merged.logic, graph.logic);
    assert_eq!(merged.workshop, moved.workshop);
    let mut conflict = base.clone();
    conflict.logic.as_mut().unwrap().rules[0].enabled = false;
    assert!(forge_session::merge(&base, &graph, &conflict).is_err());
    assert!(conflict.logic.as_ref().unwrap().rules[0].enabled == false);
    let mut cleared = base.clone();
    cleared.logic = None;
    assert!(forge_session::merge(&base, &cleared, &moved)
        .unwrap()
        .logic
        .is_none());
}
