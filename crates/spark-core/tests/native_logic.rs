use spark_core::{bsp_workshop, forge_session, native_logic as l, quickforge as q};
fn level() -> q::QuickForgeDocument {
    let mut d = bsp_workshop::example().unwrap();
    d.placements.push(q::ForgePlacement { transport_signals:None, native_name: None,
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
fn switch_level() -> q::QuickForgeDocument {
    let mut d = level();
    let mut control = d.placements[0].clone();
    control.id = "switch".into();
    control.name = "Switch".into();
    control.tag_class = "ctrl".into();
    control.tag_path = "levels/b30/devices/interior tech objects/holo control/holo control".into();
    d.placements.push(control);
    let logic = d.logic.as_mut().unwrap();
    let mut binding = logic.devices[0].clone();
    logic.devices[0].position_control_id = Some("switch".into());
    binding.placement_id = "switch".into();
    binding.initial_position = 0.25;
    logic.devices.push(binding);
    d
}

#[test]
fn linked_switch_shares_one_native_group_with_its_machine() {
    use spark_core::maps::{ScenarioLogicReadback, ScenarioLogicDevice, ScenarioLogicGroup, ScenarioLogicName, ScenarioLogicVolume, ScenarioLogicVolumeGeometry};
    let d = switch_level();
    let group = l::native_name("dg", "switch");
    let commands = q::scenario_commands(&d).unwrap();
    let groups = commands.iter().filter(|command| command.phase == "logic-groups").collect::<Vec<_>>();
    assert_eq!(groups.len(), 1);
    assert!(groups[0].args.windows(2).any(|args| args == ["device_groups[0].name", group.as_str()]));
    assert!(groups[0].args.windows(2).any(|args| args == ["device_groups[0].initial_value", "0.25"]));
    for array in ["machines", "controls"] {
        assert!(commands.iter().any(|command| command.args.windows(2).any(|args| args == [format!("{array}[0].position_group"), "0".into()])));
    }
    let source = l::generate(&d).unwrap().unwrap().content;
    assert!(source.contains(&format!("(device_set_position_immediate {} 0.250000)", l::native_name("obj", "switch"))));
    assert!(!source.contains(&format!("(device_set_position_immediate {}", l::native_name("obj", "door"))));
    assert!(source.contains(&format!("(device_set_position {} 1.000000)", l::native_name("obj", "door"))));
    let trigger = d.logic.as_ref().unwrap().triggers.first().unwrap();
    let mut read = ScenarioLogicReadback {
        groups: vec![ScenarioLogicGroup { name: group, initial_value: 0.25, flags: 0 }],
        names: d.placements.iter().map(|p| ScenarioLogicName {
            name: l::native_name("obj", &p.id), object_index: 0, object_type: if p.tag_class == "ctrl" {8} else {7},
        }).collect(),
        devices: d.placements.iter().enumerate().map(|(index,p)| ScenarioLogicDevice {
            class: p.tag_class.clone(), index: 0, name_index: index as i16,
            tag_path: p.tag_path.clone(), position: p.position, rotation_radians: [0.;3],
            power_group: Some(-1), position_group: Some(0), usable_from_both_sides: None,
        }).collect(),
        vehicles: vec![],
        volumes: vec![ScenarioLogicVolume {
            name: l::native_name("tv", &trigger.id), kind: 1,
            geometry: Some(ScenarioLogicVolumeGeometry {
                forward: [1.,0.,0.], up: [0.,0.,1.], corner: [9.5,-2.,0.], dimensions: trigger.dimensions,
            }),
        }],
    };
    l::verify_marker_readback(&d, &read).unwrap();
    read.devices[0].position_group = Some(-1);
    assert!(l::verify_marker_readback(&d, &read).is_err());
    let mut dangling = d.clone();
    dangling.logic.as_mut().unwrap().devices[0].position_control_id = Some("missing".into());
    assert!(l::validate(&dangling).is_err());
    let mut reserved = d;
    reserved.logic.as_mut().unwrap().devices[1].native_name = Some("extraction_activate".into());
    assert!(l::validate(&reserved).is_err());
}

#[test]
#[ignore = "Requires explicitly installed Invader and Spark-owned disposable storage"]
fn linked_switch_wiring_is_written_by_invader() {
    let executable = std::path::PathBuf::from(std::env::var_os("SPARK_NATIVE_INVADER_EDIT").unwrap());
    let workspace = tempfile::tempdir_in(std::env::var_os("SPARK_GENERATED_ROOT").unwrap()).unwrap();
    let tags = workspace.path().join("tags");
    std::fs::create_dir(&tags).unwrap();
    let tag = "test.scenario";
    let run = |args: &[String]| {
        let output = std::process::Command::new(&executable).arg("-t").arg(&tags).args(args).output().unwrap();
        assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
        String::from_utf8(output.stdout).unwrap()
    };
    run(&["-N".into(), tag.into()]);
    for array in ["machines", "controls"] {
        run(&["-I".into(), array.into(), "1".into(), "end".into(), tag.into()]);
    }
    for command in l::scenario_commands(&switch_level(), "test").unwrap() {
        if ["logic-groups", "logic-names"].contains(&command.phase.as_str()) {
            run(&command.args);
        }
    }
    let read = run(&["-G", "machines[0].position_group", "-G", "controls[0].position_group", "-G",
        "device_groups[0].initial_value", "-G", "device_groups[0].name", tag].map(str::to_owned));
    assert_eq!(read.lines().collect::<Vec<_>>(), ["0", "0", "0.250000", &l::native_name("dg", "switch")]);
}

#[test]
fn foreign_round_lifecycle_events_cannot_be_reinterpreted_as_halo1_triggers() {
    let original=serde_json::to_value(level()).unwrap();
    for kind in ["roundEnd","roundStart","playerRespawn","playerReconnected"] {
        let mut foreign=original.clone();
        foreign["logic"]["rules"][0]["event"]=serde_json::json!({"kind":kind});
        let error=serde_json::from_value::<q::QuickForgeDocument>(foreign).unwrap_err().to_string();
        assert!(error.contains("unknown variant"),"{kind}: {error}");
    }
    assert_eq!(serde_json::to_value(level()).unwrap(),original);
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
#[test]
fn handwritten_modules_preserve_bytes_and_refuse_partial_overwrite_or_stale_validation() {
    let mut doc = level();
    let original = b"; Original author comment\r\n(global short user_counter 41)\r\n";
    doc.logic
        .as_mut()
        .unwrap()
        .handwritten_sources
        .push(l::HandwrittenSource {
            filename: "mission notes.hsc".into(),
            content: String::from_utf8(original.to_vec()).unwrap(),
        });
    let root = tempfile::tempdir().unwrap();
    let scenario = "levels/test/handwritten/handwritten";
    let main = l::script_path(root.path(), scenario).unwrap();
    let manual = main.parent().unwrap().join("mission notes.hsc");
    std::fs::create_dir_all(manual.parent().unwrap()).unwrap();
    std::fs::write(&manual, b"; external existing source").unwrap();
    assert!(l::export(&doc, root.path(), scenario).is_err());
    assert!(!main.exists());
    assert_eq!(
        std::fs::read(&manual).unwrap(),
        b"; external existing source"
    );
    let fresh = tempfile::tempdir().unwrap();
    l::export(&doc, fresh.path(), scenario).unwrap();
    let path = l::script_path(fresh.path(), scenario)
        .unwrap()
        .parent()
        .unwrap()
        .join("mission notes.hsc");
    assert_eq!(std::fs::read(&path).unwrap(), original);
    l::verify_exported_sources(&doc, fresh.path(), scenario).unwrap();
    std::fs::write(&path, b"; external legitimate changed source\r\n").unwrap();
    assert!(l::verify_exported_sources(&doc, fresh.path(), scenario).is_err());
    assert_eq!(
        std::fs::read(&path).unwrap(),
        b"; external legitimate changed source\r\n"
    );
    assert_eq!(l::source_modules(&doc).unwrap()[1].regions.len(), 0);
}
#[test]
fn source_names_encoding_and_native_target_budgets_are_not_silently_repaired() {
    let module = |filename: &str, content: &str| l::HandwrittenSource {
        filename: filename.into(),
        content: content.into(),
    };
    for filename in [
        "../escape.hsc",
        "a/b.hsc",
        "CON.hsc",
        "gs_logic.hsc",
        "global_scripts.hsc",
        "file.HSC",
    ] {
        assert!(
            l::validate_handwritten_sources(&[module(filename, "; source")]).is_err(),
            "{filename}"
        );
    }
    assert!(l::validate_handwritten_sources(&[
        module("mission.hsc", "; source"),
        module("MISSION.hsc", "; another")
    ])
    .is_err());
    assert!(l::validate_handwritten_sources(&[module("mission.hsc", "\u{feff}; source")]).is_err());
    let mut doc = level();
    let old = serde_json::to_value(&doc).unwrap();
    assert!(old["logic"].get("handwrittenSources").is_none());
    doc.logic.as_mut().unwrap().handwritten_sources =
        vec![module("large.hsc", &format!(";{}", "x".repeat(256 * 1024)))];
    assert!(l::validate(&doc).is_ok());
    doc.runtime_id = spark_core::runtime::RuntimeId::HaloCustomEdition;
    assert!(l::validate(&doc).is_err());
    doc.logic.as_mut().unwrap().handwritten_sources = (0..8)
        .map(|i| module(&format!("user_{i}.hsc"), "; source"))
        .collect();
    assert!(l::validate(&doc).is_err());
}


#[test]
fn compiled_extraction_markers_require_exact_names_devices_and_rotated_volumes() {
    use spark_core::maps::{ScenarioLogicReadback,ScenarioLogicName,ScenarioLogicDevice,ScenarioLogicVolume,ScenarioLogicVolumeGeometry};
    let mut doc=level();doc.placements[0].tag_class="ctrl".into();
    let logic=doc.logic.as_mut().unwrap();logic.devices[0].native_name=Some("extraction_deploy".into());
    logic.triggers[0].native_name=Some("extraction_return".into());logic.triggers[0].rotation[2]=std::f32::consts::FRAC_PI_2;
    let expected=ScenarioLogicReadback{groups:vec![],vehicles:vec![],
        names:vec![ScenarioLogicName{name:"extraction_deploy".into(),object_type:8,object_index:0}],
        devices:vec![ScenarioLogicDevice{power_group:Some(-1),position_group:Some(-1),usable_from_both_sides:Some(false),class:"ctrl".into(),index:0,name_index:0,tag_path:doc.placements[0].tag_path.clone(),position:[14.,0.,0.],rotation_radians:[0.;3]}],
        volumes:vec![ScenarioLogicVolume{name:"extraction_return".into(),kind:1,geometry:Some(ScenarioLogicVolumeGeometry{forward:[0.,1.,0.],up:[0.,0.,1.],corner:[13.,-1.5,0.],dimensions:[3.,4.,3.]})}],
    };
    l::verify_marker_readback(&doc,&expected).unwrap();
    for fault in 0..11 {
        let mut wrong=expected.clone();match fault {
            0=>wrong.names[0].name="other".into(),1=>wrong.names[0].object_type=7,2=>wrong.names[0].object_index=1,
            3=>wrong.devices[0].name_index=-1,4=>wrong.devices[0].tag_path="devices/other".into(),5=>wrong.devices[0].position[0]+=1.,
            6=>wrong.volumes[0].name="other".into(),7=>wrong.volumes[0].kind=0,8=>wrong.volumes[0].geometry.as_mut().unwrap().forward=[1.,0.,0.],
            9=>wrong.volumes[0].geometry.as_mut().unwrap().corner[2]+=1.,_=>wrong.volumes[0].geometry.as_mut().unwrap().dimensions[0]+=1.,
        }
        assert!(l::verify_marker_readback(&doc,&wrong).is_err(),"changed native marker {fault} must fail");
    }
    let mut missing=expected.clone();missing.volumes.clear();assert!(l::verify_marker_readback(&doc,&missing).is_err());
    let mut extra=expected.clone();extra.names.push(expected.names[0].clone());assert!(l::verify_marker_readback(&doc,&extra).is_err());
}


#[test]
#[ignore="Requires an explicitly selected owned CE609 Extraction map; read-only"]
fn installed_compiled_extraction_checks_all_hub_starts_and_native_bindings() {
    use spark_core::{maps,creative};
    let path=std::path::PathBuf::from(std::env::var_os("SPARK_NATIVE_EXTRACTION_CACHE").expect("Explicit owned native cache required"));
    let before=maps::hash_file(&path).unwrap();let map=maps::inspect_map(&path,None).unwrap();
    assert!(creative::compiled_extraction_mode(&path,&map).unwrap());
    let markers=maps::scenario_logic_readback(&path,&map).unwrap();
    l::validate_compiled_extraction_layout(&map,&markers).unwrap();
    for fault in 0..8 {
        let mut wrong=markers.clone();
        match fault {
            0=>{wrong.volumes.retain(|v|v.name!="extraction_return");},
            1=>{let row=wrong.volumes.iter().find(|v|v.name=="extraction_zone").unwrap().clone();wrong.volumes.push(row);},
            2=>wrong.volumes.iter_mut().find(|v|v.name=="extraction_return").unwrap().kind=0,
            3=>wrong.volumes.iter_mut().find(|v|v.name=="extraction_return").unwrap().geometry.as_mut().unwrap().forward=[0.;3],
            4=>wrong.names.iter_mut().find(|n|n.name=="extraction_deploy").unwrap().object_type=7,
            5=>wrong.names.iter_mut().find(|n|n.name=="extraction_activate").unwrap().object_index=-1,
            6=>{let row=wrong.names.iter().find(|n|n.name=="extraction_deploy").unwrap().clone();wrong.names.push(row);},
            _=>{for row in &mut wrong.devices {row.position=[f32::NAN,0.,0.];}},
        }
        assert!(l::validate_compiled_extraction_layout(&map,&wrong).is_err(),"native marker fault {fault}");
    }
    let mut wrong=map.clone();let spawn=wrong.objects.iter_mut().find(|o|o.kind=="Player spawn").expect("Native hub spawn");spawn.position=[f32::NAN,0.,0.];spawn.visible=false;
    assert!(l::validate_compiled_extraction_layout(&wrong,&markers).is_err(),"hidden invalid starts cannot be filtered away");
    let mut wrong=map.clone();let callback=wrong.scripts.iter_mut().find(|s|s.name=="forerunner_extraction_complete").unwrap();callback.script_type=0;
    assert!(creative::compiled_extraction_mode(&path,&wrong).is_err());
    let mut wrong=map.clone();wrong.scripts.retain(|s|s.name!="forerunner_extraction_complete");assert!(!creative::compiled_extraction_mode(&path,&wrong).unwrap());
    let mut wrong=map.clone();wrong.header.version=13;assert!(creative::compiled_extraction_mode(&path,&wrong).is_err());
    assert_eq!(before,maps::hash_file(&path).unwrap());
    println!("Compiled Extraction callback/markers/all {} hub starts PASS; cacheSHA={before}; not gameplay or control-use acceptance",map.objects.iter().filter(|o|o.kind=="Player spawn").count());
}


#[test]
fn solo_vehicle_names_share_native_names_and_keep_exact_pose_and_reverse_links() {
    use spark_core::maps::{ScenarioLogicReadback,ScenarioLogicName,ScenarioLogicDevice,ScenarioLogicVolume,ScenarioLogicVolumeGeometry};
    let mut doc=level();doc.game_mode="campaign".into();
    let mut unnamed=doc.placements[0].clone();unnamed.id="ordinary-vehicle".into();unnamed.tag_class="vehi".into();unnamed.tag_path="vehicles/warthog/warthog".into();
    let mut ship=unnamed.clone();ship.id="ship".into();ship.name="Authored transport".into();ship.tag_path="vehicles/pelican/pelican".into();ship.native_name=Some("extraction_pelican".into());ship.rotation=[0.,0.,std::f32::consts::FRAC_PI_2];
    doc.placements.extend([unnamed,ship.clone()]);l::validate(&doc).unwrap();
    let commands=l::scenario_commands(&doc,"levels/test/test").unwrap();let names=commands.iter().filter(|c|c.phase=="logic-names").collect::<Vec<_>>();assert_eq!(names.len(),2);
    assert!(names[1].args.windows(3).any(|a|a==["-S","vehicles[1].name","1"]));assert!(names[1].args.iter().any(|a|a=="extraction_pelican"));
    let device=&doc.placements[0];let trigger=&doc.logic.as_ref().unwrap().triggers[0];
    let read=ScenarioLogicReadback{groups:vec![],names:vec![ScenarioLogicName{name:l::native_name("obj",&device.id),object_type:7,object_index:0},ScenarioLogicName{name:"extraction_pelican".into(),object_type:1,object_index:1}],
      devices:vec![ScenarioLogicDevice{power_group:Some(-1),position_group:Some(-1),usable_from_both_sides:None,class:"mach".into(),index:0,name_index:0,tag_path:device.tag_path.clone(),position:device.position,rotation_radians:[0.;3]}],
      vehicles:vec![ScenarioLogicDevice{power_group:None,position_group:None,usable_from_both_sides:None,class:"vehi".into(),index:1,name_index:1,tag_path:ship.tag_path.clone(),position:ship.position,rotation_radians:[std::f32::consts::FRAC_PI_2,0.,0.]}],
      volumes:vec![ScenarioLogicVolume{name:l::native_name("tv",&trigger.id),kind:1,geometry:Some(ScenarioLogicVolumeGeometry{forward:[1.,0.,0.],up:[0.,0.,1.],corner:[9.5,-2.,0.],dimensions:[3.,4.,3.]})}]};
    l::verify_marker_readback(&doc,&read).unwrap();
    for fault in 0..7{let mut wrong=read.clone();match fault{0=>wrong.names[1].name="other".into(),1=>wrong.names[1].object_type=0,2=>wrong.names[1].object_index=0,3=>wrong.vehicles[0].name_index=0,4=>wrong.vehicles[0].tag_path="vehicles/warthog/warthog".into(),5=>wrong.vehicles[0].position[0]+=1.,_=>wrong.vehicles[0].rotation_radians[0]=0.};assert!(l::verify_marker_readback(&doc,&wrong).is_err(),"fault {fault}");}
    let unflagged=doc.clone();doc.placements[2].transport_signals=Some(true);
    let mut signalled=read.clone();signalled.groups=l::transport_signal_groups(&doc).into_iter().map(|name|spark_core::maps::ScenarioLogicGroup{name,initial_value:0.,flags:0}).collect();
    l::verify_marker_readback(&doc,&signalled).unwrap();
    let mut legacy=signalled.clone();legacy.groups.retain(|group|!group.name.ends_with("_landed"));
    assert!(l::verify_marker_readback(&doc,&legacy).is_err(),"Previous two-group builds must not pass current landing-source readback");
    assert_eq!(l::scenario_commands(&doc,"levels/test/test").unwrap().iter().filter(|c|c.phase=="logic-groups").count(),3);
    for fault in 0..7{let mut wrong=signalled.clone();match fault{0=>{wrong.groups.pop();},1=>wrong.groups[0].name="other".into(),2=>wrong.groups[0].initial_value=1.,3=>wrong.groups[0].flags=1,4=>wrong.devices[0].power_group=Some(0),5=>wrong.devices[0].position_group=Some(1),_=>wrong.devices[0].power_group=None};assert!(l::verify_marker_readback(&doc,&wrong).is_err(),"group fault {fault}");}
    doc.placements[2].transport_signals=Some(false);assert!(l::verify_marker_readback(&doc,&signalled).is_err());l::verify_marker_readback(&doc,&read).unwrap();
    doc.placements[2].transport_signals=Some(true);doc.placements[2].native_name=Some("ordinary_ship".into());assert!(l::validate(&doc).is_err());doc=unflagged;
    let json=serde_json::to_value(&doc).unwrap();assert_eq!(serde_json::from_value::<q::QuickForgeDocument>(json).unwrap(),doc);
    doc.logic=None;assert!(l::has_source(&doc));assert!(l::generate(&doc).unwrap().is_some());assert_eq!(l::scenario_commands(&doc,"levels/test/test").unwrap().len(),1);
    doc.game_mode="slayer".into();assert!(l::validate(&doc).is_err());doc.game_mode="campaign".into();
    doc.placements[1].native_name=Some("extraction_pelican".into());assert!(l::validate(&doc).is_err());doc.placements[1].native_name=None;
    doc.placements[2].native_name=Some("../bad".into());assert!(l::validate(&doc).is_err());
}


#[test]
#[ignore="Requires explicitly selected legitimate transport cache; read-only"]
fn installed_transport_cache_has_real_vehicle_reverse_names_and_unchanged_bytes(){
    use spark_core::maps;
    let path=std::path::PathBuf::from(std::env::var_os("SPARK_NATIVE_TRANSPORT_CACHE").expect("Explicit native cache required"));
    let before=maps::hash_file(&path).unwrap();let map=maps::inspect_map(&path,None).unwrap();let read=maps::scenario_logic_readback(&path,&map).unwrap();
    if let (Some(tags),Some(editor))=(std::env::var_os("SPARK_NATIVE_TRANSPORT_TAGS"),std::env::var_os("SPARK_NATIVE_INVADER_EDIT")){
        let tag=format!("{}.scenario",map.scenario_path);let source=std::path::Path::new(&tags).join(&tag);let source_sha=maps::hash_file(&source).unwrap();
        let fields=std::process::Command::new(editor).arg("-t").arg(&tags).arg("-L").arg(&tag).output().unwrap();assert!(fields.status.success());
        let fields=String::from_utf8(fields.stdout).unwrap();let inventory=spark_core::native_operations::scenario_transport_choices(&fields).unwrap();
        assert_eq!(inventory.vehicles.len(),2);assert_eq!(inventory.groups,vec!["extraction_pelican_boarded","extraction_spirit_boarded","extraction_pelican_called","extraction_pelican_landed"]);assert!(inventory.routes.contains(&"tf_field".to_owned()));assert!(inventory.routes.contains(&"tf_home".to_owned()));
        assert!(spark_core::native_operations::scenario_transport_choices(&fields.replace("can_change_only_once (0)","can_change_only_once (1)")).is_err());
        assert_eq!(source_sha,maps::hash_file(&source).unwrap());eprintln!("Native transport source inventory: routes={}, pilots={:?}, groups={:?}, unchanged scenario SHA256 {source_sha}",inventory.routes.len(),inventory.pilots,inventory.groups);
    }
    for name in ["extraction_pelican","extraction_spirit"]{
        let names=read.names.iter().enumerate().filter(|(_,row)|row.name==name).collect::<Vec<_>>();assert_eq!(names.len(),1);let(index,row)=names[0];assert_eq!(row.object_type,1);assert!(row.object_index>=0);
        let vehicles=read.vehicles.iter().filter(|vehicle|vehicle.index==row.object_index as usize&&vehicle.name_index==index as i16).collect::<Vec<_>>();assert_eq!(vehicles.len(),1);assert!(!vehicles[0].tag_path.is_empty());assert!(vehicles[0].position.iter().chain(vehicles[0].rotation_radians.iter()).all(|v|v.is_finite()));
        eprintln!("Native transport {name}: index {}, tag {}, position {:?}, rotation {:?}",row.object_index,vehicles[0].tag_path,vehicles[0].position,vehicles[0].rotation_radians);
    }
    // A vehicle-only source still needs the actual compiled name table. A
    // script-name match alone must not let a missing cache skip readback.
    let mut draft=level();draft.game_mode="campaign".into();draft.logic=None;
    draft.placements[0].tag_class="vehi".into();draft.placements[0].native_name=Some("extraction_pelican".into());
    let mut known=map.clone();known.scripts.push(maps::Script{name:"gs_logic_init".into(),script_type:0,return_type:0});
    let missing=tempfile::tempdir_in(std::env::var_os("SPARK_NATIVE_TEST_ROOT").expect("Explicit owned test root")).unwrap();assert!(l::verify_compiled(&draft,&known,&missing.path().join("not-compiled.map")).is_err());
    assert_eq!(before,maps::hash_file(&path).unwrap());eprintln!("Native transport cache unchanged SHA256 {before}");
}

#[test]
#[ignore="Requires explicitly selected installed invader-edit; generated source only"]
fn installed_invader_writes_transport_names_to_fresh_native_source(){
    use std::process::Command;
    let tool=std::path::PathBuf::from(std::env::var_os("SPARK_NATIVE_INVADER_EDIT").expect("Explicit native writer required"));let tool_sha=spark_core::maps::hash_file(&tool).unwrap();
    let temp=tempfile::tempdir_in(std::env::var_os("SPARK_NATIVE_TEST_ROOT").expect("Explicit owned test root")).unwrap();let tags=temp.path().join("tags");std::fs::create_dir(&tags).unwrap();
    let invoke=|args:&[String]|{let output=Command::new(&tool).arg("-t").arg(&tags).args(args).output().unwrap();assert!(output.status.success(),"{:?}: {}",args,String::from_utf8_lossy(&output.stderr));String::from_utf8(output.stdout).unwrap()};
    let mut doc=level();doc.game_mode="campaign".into();doc.logic=None;doc.spawns.clear();doc.placements.clear();
    for(index,name)in[None,Some("extraction_pelican")].iter().enumerate(){doc.placements.push(q::ForgePlacement{ transport_signals:None,native_name:name.map(str::to_owned),id:format!("ship-{index}"),name:format!("Ship {index}"),tag_path:"vehicles/pelican/pelican".into(),tag_class:"vehi".into(),position:[index as f32,0.,0.],rotation:[0.;3],team:0,respawn_seconds:0,tag_id:None,source_project_id:None,source_sha256:None,visible:true,locked:false,published_asset_id:None});}
    for pair in [false,true]{
        doc.placements[0].native_name=pair.then(||"extraction_spirit".into());for p in &mut doc.placements{p.transport_signals=Some(pair);}let scenario=if pair{"pair"}else{"single"};let tag=format!("{scenario}.scenario");
        invoke(&["-N".into(),tag.clone()]);invoke(&["-I".into(),"vehicles".into(),"2".into(),"end".into(),tag.clone()]);
        for command in l::scenario_commands(&doc,scenario).unwrap(){invoke(&command.args);}
        let name=invoke(&["-G".into(),format!("object_names[{}].name",usize::from(pair)),tag.clone()]);assert_eq!(name.trim(),"extraction_pelican");
        let reverse=invoke(&["-G".into(),"vehicles[1].name".into(),tag.clone()]);assert_eq!(reverse.trim(),if pair{"1"}else{"0"});
        let groups=invoke(&["-C".into(),"device_groups".into(),tag]);assert_eq!(groups.trim(),if pair{"6"}else{"0"});
    }
    let vehicle="vehicles/crew_probe.vehicle".to_owned();std::fs::create_dir_all(tags.join("vehicles")).unwrap();
    invoke(&["-N".into(),vehicle.clone()]);invoke(&["-I".into(),"seats".into(),"3".into(),"end".into(),"-S".into(),"seats[0].label".into(),"P-driver".into(),"-S".into(),"seats[1].label".into(),"P-passenger".into(),"-S".into(),"seats[2].label".into(),"P-passenger".into(),vehicle.clone()]);
    let before=spark_core::maps::hash_file(&tags.join(&vehicle)).unwrap();let fields=invoke(&["-L".into(),vehicle.clone()]);let labels=spark_core::native_operations::native_vehicle_seats(&fields).unwrap();assert_eq!(labels,vec!["P-driver","P-passenger","P-passenger"]);
    l::verify_vehicle_crew_seats(&crew_level(),"ship",&labels).unwrap();assert_eq!(before,spark_core::maps::hash_file(&tags.join(&vehicle)).unwrap());eprintln!("Fresh native seat inventory {:?}, unchanged vehicle SHA256 {before}",labels);

    // Native compiler proof only: fresh scenario symbols, no borrowed map or AI-combat claim.
    let mut crew=crew_level();crew.placements.retain(|p|p.id=="ship");let logic=crew.logic.as_mut().unwrap();logic.devices.clear();logic.triggers.clear();logic.rules.retain(|rule|rule.id=="crew");
    let scenario="crew";let tag="crew.scenario".to_owned();invoke(&["-N".into(),tag.clone()]);invoke(&["-I".into(),"vehicles".into(),"1".into(),"end".into(),"-I".into(),"encounters".into(),"1".into(),"end".into(),"-S".into(),"encounters[0].name".into(),"pilot".into(),tag.clone()]);
    for command in l::scenario_commands(&crew,scenario).unwrap(){invoke(&command.args);}
    l::export(&crew,temp.path(),scenario).unwrap();
    let compiler=tool.parent().unwrap().join("invader-script.exe");let compiler_sha=spark_core::maps::hash_file(&compiler).unwrap();
    let result=Command::new(&compiler).args(["-t"]).arg(&tags).arg("-d").arg(temp.path().join("data")).args(["-g","gbx-custom","-E",scenario]).current_dir(temp.path()).output().unwrap();assert!(result.status.success(),"Native AI crew script compilation: {}",String::from_utf8_lossy(&result.stderr));
    let fields=invoke(&["-L".into(),tag.clone()]);assert!(fields.contains(&l::generate(&crew).unwrap().unwrap().regions[0].native_name));assert!(fields.contains("gs_logic_init"));
    eprintln!("Native CE crew HSC compiled; scenario SHA256 {}; source SHA256 {}; compiler SHA256 {}",spark_core::maps::hash_file(&tags.join(tag)).unwrap(),spark_core::maps::hash_file(&l::script_path(temp.path(),scenario).unwrap()).unwrap(),compiler_sha);assert_eq!(compiler_sha,spark_core::maps::hash_file(&compiler).unwrap());
    assert_eq!(tool_sha,spark_core::maps::hash_file(&tool).unwrap());eprintln!("Fresh native single/pair vehicle name source readback passed; writer SHA256 {tool_sha}");
}


#[test]
fn native_vehicle_name_budget_rejects_overflow_instead_of_dropping_bindings(){
    let mut doc=level();doc.game_mode="campaign".into();doc.logic=None;
    let mut vehicle=doc.placements[0].clone();vehicle.tag_class="vehi".into();
    doc.placements=(0..513).map(|index|{let mut p=vehicle.clone();p.id=format!("ship-{index}");p.native_name=Some(format!("ship_{index}"));p}).collect();
    assert!(l::validate(&doc).unwrap_err().to_string().contains("limit512"));doc.placements.pop();l::validate(&doc).unwrap();
    doc.placements[1].native_name=doc.placements[0].native_name.clone();assert!(l::validate(&doc).is_err());
}


#[test]
#[ignore="Requires explicit read-only transport tags/cache and installed Invader; fresh scenario fixture, borrowed BSP only"]
fn installed_transport_scenario_writer_compiles_and_reads_back_native_vehicle_names(){
    use spark_core::{maps,runtime::RuntimeId};use std::process::Command;
    let fixture=std::path::PathBuf::from(std::env::var_os("SPARK_NATIVE_TRANSPORT_TAGS").expect("Explicit read-only fixture tags"));
    let cache=std::path::PathBuf::from(std::env::var_os("SPARK_NATIVE_TRANSPORT_CACHE").expect("Explicit original cache"));
    let editor=std::path::PathBuf::from(std::env::var_os("SPARK_NATIVE_INVADER_EDIT").expect("Explicit native writer"));let tools=editor.parent().unwrap();
    let original_hash=maps::hash_file(&cache).unwrap();let original=maps::inspect_map(&cache,None).unwrap();let markers=maps::scenario_logic_readback(&cache,&original).unwrap();
    let temp=tempfile::tempdir_in(std::env::var_os("SPARK_NATIVE_TEST_ROOT").expect("Explicit owned test root")).unwrap();let root=temp.path();let tags=root.join("tags");let data=root.join("data");let output=root.join("maps");for dir in [&tags,&data,&output]{std::fs::create_dir(dir).unwrap();}
    let invoke=|tool:&std::path::Path,args:&[String]|{let result=Command::new(tool).current_dir(root).args(args).output().unwrap();assert!(result.status.success(),"{} {:?}: {}",tool.display(),args,String::from_utf8_lossy(&result.stderr));if !result.stderr.is_empty(){eprintln!("Native tool diagnostics: {}",String::from_utf8_lossy(&result.stderr));}String::from_utf8(result.stdout).unwrap()};
    let original_tag=format!("{}.scenario",original.scenario_path.replace('\\',"/"));
    let bsp=invoke(&editor,&["-t".into(),fixture.to_string_lossy().into_owned(),"-G".into(),"structure_bsps[0].structure_bsp".into(),original_tag.clone()]);let bsp=bsp.trim();
    spark_core::safe_relative(bsp).unwrap();assert!(bsp.ends_with(".scenario_structure_bsp"));
    let mut protected=vec![fixture.join(spark_core::safe_relative(&original_tag).unwrap()),fixture.join(spark_core::safe_relative(bsp).unwrap()),fixture.join("globals/globals.globals")];
    let mut base=level();base.game_mode="campaign".into();base.runtime_id=RuntimeId::ChupathingyCe;base.placements.clear();base.objectives.clear();base.campaign_encounters.clear();base.starting_profile=None;
    for name in ["extraction_pelican","extraction_spirit"]{
        let row=markers.names.iter().enumerate().find(|(_,row)|row.name==name).unwrap();let vehicle=markers.vehicles.iter().find(|v|v.name_index==row.0 as i16).unwrap();assert!(vehicle.rotation_radians.iter().all(|v|v.is_finite()));
        protected.push(fixture.join(spark_core::safe_relative(&format!("{}.vehicle",vehicle.tag_path.replace('\\',"/"))).unwrap()));
        base.placements.push(q::ForgePlacement{transport_signals:None,native_name:Some(name.into()),id:name.into(),name:name.into(),tag_path:vehicle.tag_path.clone(),tag_class:"vehi".into(),position:vehicle.position,rotation:[0.,0.,0.25],team:0,respawn_seconds:0,tag_id:None,source_project_id:None,source_sha256:None,visible:true,locked:false,published_asset_id:None});
    }
    let control=markers.devices.iter().find(|device|device.class=="ctrl").expect("Real source control");protected.push(fixture.join(spark_core::safe_relative(&format!("{}.device_control",control.tag_path.replace('\\',"/"))).unwrap()));
    base.placements.push(q::ForgePlacement{transport_signals:None,native_name:None,id:"probe-control".into(),name:"Source control".into(),tag_path:control.tag_path.clone(),tag_class:"ctrl".into(),position:control.position,rotation:[0.;3],team:0,respawn_seconds:0,tag_id:None,source_project_id:None,source_sha256:None,visible:true,locked:false,published_asset_id:None});
    base.logic=Some(serde_json::from_value(serde_json::json!({"schemaVersion":1,"triggers":[],"devices":[{"placementId":"probe-control","nativeName":"probe_control","initialPosition":0,"powered":true}],"rules":[]})).unwrap());
    let before=protected.iter().map(|file|maps::hash_file(file).unwrap()).collect::<Vec<_>>();let source_start=original.objects.iter().find(|o|o.kind=="Player spawn").unwrap();base.spawns.truncate(1);base.spawns[0].position=source_start.position;
    let mut hashes=vec![];
    for enabled in [true,false]{
        let mut doc=base.clone();doc.name=if enabled{"Transport signals on"}else{"Transport signals off"}.into();for vehicle in doc.placements.iter_mut().filter(|p|p.tag_class=="vehi"){vehicle.transport_signals=Some(enabled);}
        if enabled{doc.logic.as_mut().unwrap().handwritten_sources.push(l::HandwrittenSource{filename:"transport_probe.hsc".into(),content:"(script static boolean gs_transport_probe (and (= (device_group_get extraction_pelican_boarded) 0) (= (device_group_get extraction_pelican_called) 0) (= (device_group_get extraction_spirit_boarded) 0) (= (device_group_get extraction_spirit_called) 0) (= (device_group_get extraction_pelican_landed) 0) (= (device_group_get extraction_spirit_landed) 0)))\n".into()});}
        let scenario=q::scenario_path(&doc).unwrap();let tag=format!("{scenario}.scenario");std::fs::create_dir_all(tags.join(spark_core::safe_relative(&tag).unwrap()).parent().unwrap()).unwrap();
        invoke(&editor,&["-t".into(),tags.to_string_lossy().into_owned(),"-N".into(),tag.clone()]);
        invoke(&editor,&["-t".into(),tags.to_string_lossy().into_owned(),"-I".into(),"structure_bsps".into(),"1".into(),"end".into(),"-S".into(),"structure_bsps[0].structure_bsp".into(),bsp.into(),tag.clone()]);
        assert_eq!(invoke(&editor,&["-t".into(),tags.to_string_lossy().into_owned(),"-C".into(),"device_groups".into(),tag.clone()]).trim(),"0");
        // Scenario/marker fixture only: the compiled BSP is borrowed unchanged.
        for command in q::scenario_commands(&doc).unwrap().iter().filter(|c|c.tool=="invaderEdit"){
            let mut args=vec!["-t".into(),tags.to_string_lossy().into_owned()];args.extend(command.args.clone());invoke(&editor,&args);
        }
        l::export(&doc,root,&scenario).unwrap();assert!(l::script_path(root,&scenario).unwrap().is_file());
        invoke(&tools.join("invader-script.exe"),&["-t".into(),tags.to_string_lossy().into_owned(),"-t".into(),fixture.to_string_lossy().into_owned(),"-d".into(),data.to_string_lossy().into_owned(),"-g".into(),"gbx-custom".into(),"-E".into(),scenario.clone()]);
        invoke(&tools.join("invader-build.exe"),&["-t".into(),tags.to_string_lossy().into_owned(),"-t".into(),fixture.to_string_lossy().into_owned(),"-m".into(),output.to_string_lossy().into_owned(),"-g".into(),"gbx-custom".into(),scenario.clone()]);
        let built=output.join(format!("{}.map",scenario.rsplit('\\').next().unwrap().rsplit('/').next().unwrap()));let map=maps::inspect_map(&built,None).unwrap();assert_eq!(map.header.version,609);assert_eq!(map.header.scenario_type,0);
        let read=l::verify_compiled(&doc,&map,&built).unwrap().expect("Named source requires marker readback");assert_eq!(read.names.len(),3);assert_eq!(read.vehicles.len(),2);assert_eq!(read.devices.len(),1);assert_eq!(read.groups.len(),if enabled{6}else{0});
        assert_eq!(map.scripts.iter().any(|s|s.name=="gs_transport_probe"),enabled);
        eprintln!("Fresh CE609 transport signals {enabled}: cache SHA256 {}; names {}, vehicles {}, devices {}, groups {}; borrowed BSP/original inputs unchanged",map.sha256,read.names.len(),read.vehicles.len(),read.devices.len(),read.groups.len());hashes.push(map.sha256);
    }
    assert_ne!(hashes[0],hashes[1]);assert_eq!(before,protected.iter().map(|file|maps::hash_file(file).unwrap()).collect::<Vec<_>>());assert_eq!(original_hash,maps::hash_file(&cache).unwrap());
}


fn crew_level()->q::QuickForgeDocument {
 let mut doc=level();doc.game_mode="campaign".into();doc.runtime_id=spark_core::runtime::RuntimeId::ChupathingyCe;
 let mut ship=doc.placements[0].clone();ship.id="ship".into();ship.tag_class="vehi".into();ship.tag_path="vehicles/pelican/pelican".into();ship.native_name=Some("extraction_pelican".into());doc.placements.push(ship);
 doc.campaign_encounters=vec![serde_json::from_value(serde_json::json!({"name":"pilot","actorPath":"characters/marine_armored/marine_armored","position":[0,0,0],"startActive":true,"count":1,"spacing":1})).unwrap()];
 doc.logic.as_mut().unwrap().rules.push(serde_json::from_value(serde_json::json!({"id":"crew","name":"Seat pilot","enabled":true,"once":true,"event":{"kind":"timer","seconds":0.1},"actions":[{"kind":"aiVehicleLoad","targetId":"ship","encounterName":"pilot","seat":"P-driver"}]})).unwrap());doc
}
#[test]
fn native_ai_crew_uses_existing_living_actors_and_exact_seat_text_without_spawning_ownership(){
 let doc=crew_level();l::validate(&doc).unwrap();let source=l::generate(&doc).unwrap().unwrap().content;
 assert!(source.contains("(ai_living_count pilot)"));assert!(source.contains("(unit_get_health (unit extraction_pelican))"));assert!(source.contains("(vehicle_load_magic (unit extraction_pelican) \"P-driver\" (ai_actors pilot))"));assert!(!source.contains("ai_place"));
 let value=serde_json::to_value(&doc).unwrap();assert_eq!(doc,serde_json::from_value(value).unwrap());
 let mut disabled=doc.clone();disabled.logic.as_mut().unwrap().rules.last_mut().unwrap().enabled=false;assert!(!l::generate(&disabled).unwrap().unwrap().content.contains("vehicle_load_magic"));
}
#[test]
fn native_ai_seating_rejects_missing_capacity_overlapping_owners_and_changed_source(){
 let doc=crew_level();l::verify_vehicle_crew_seats(&doc,"ship",&["P-driver".into(),"P-passenger".into()]).unwrap();
 assert!(l::verify_vehicle_crew_seats(&doc,"ship",&["p-driver".into()]).is_err());assert!(l::verify_vehicle_crew_seats(&doc,"ship",&[]).is_err());
 let mut crew=doc.clone();crew.campaign_encounters[0].count=2;assert!(l::verify_vehicle_crew_seats(&crew,"ship",&["P-driver".into()]).is_err());
 l::verify_vehicle_crew_seats(&crew,"ship",&["P-driver".into(),"P-driver".into()]).unwrap();
 let mut other=crew.campaign_encounters[0].clone();other.name="passengers".into();other.count=1;crew.campaign_encounters.push(other);let mut rule=crew.logic.as_ref().unwrap().rules.last().unwrap().clone();rule.id="other-crew".into();rule.actions[0]=l::Action::AiVehicleLoad{target_id:"ship".into(),encounter_name:"passengers".into(),seat:"P-".into()};crew.logic.as_mut().unwrap().rules.push(rule);
 assert!(l::verify_vehicle_crew_seats(&crew,"ship",&["P-driver".into(),"P-driver".into(),"P-passenger".into()]).unwrap_err().to_string().contains("overlap"));
 for fault in 0..5{let mut bad=doc.clone();match fault{0=>bad.campaign_encounters.clear(),1=>bad.placements.retain(|p|p.id!="ship"),2=>bad.placements.last_mut().unwrap().native_name=None,3=>bad.campaign_encounters[0].difficulty=Some(spark_core::native_operations::EncounterDifficulty{normal:0,insane:1}),_=>{let mut copy=bad.logic.as_ref().unwrap().rules.last().unwrap().clone();copy.id="duplicate".into();bad.logic.as_mut().unwrap().rules.push(copy);}}assert!(l::validate(&bad).is_err(),"crew fault {fault}");}
}
#[test]
fn native_seat_reader_preserves_duplicate_capacity_and_refuses_ambiguous_listings(){
 use spark_core::native_operations::native_vehicle_seats;
 let fields="seats[3] array\n    seats[0] struct\n        label (P-driver) string\n    seats[1] struct\n        label (P-passenger) string\n    seats[2] struct\n        label (P-passenger) string\n";
 assert_eq!(native_vehicle_seats(fields).unwrap(),vec!["P-driver","P-passenger","P-passenger"]);
 assert!(native_vehicle_seats(&fields.replace("seats[3]","seats[17]")).is_err());assert!(native_vehicle_seats(&fields.replace("label (P-driver)","other (P-driver)")).is_err());assert!(native_vehicle_seats(&format!("{fields}{fields}")).is_err());assert!(native_vehicle_seats(&fields.replace("string","enum")).is_err());
}
