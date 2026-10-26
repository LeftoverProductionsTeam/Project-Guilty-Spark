//! Halo CE scenario netgame flag regression coverage. Requires Cargo/Rust;
//! this suite must NOT be reported as executed by the dependency-free JS check.
use spark_core::quickforge::{self, ForgeObjective, QuickForgeDocument};

fn original() -> QuickForgeDocument {
    quickforge::create_arena("Guilty Spark Game Type Test", "emptyArena").unwrap()
}
fn marker(id: &str, kind: &str, usage: i16, sequence: u16, pos: [f32; 3]) -> ForgeObjective {
    ForgeObjective {
        id: id.into(), name: id.into(), kind: kind.into(), position: pos,
        facing: 0., team: usage, sequence, visible: true, locked: false,
    }
}
fn unsafe_code(doc: &QuickForgeDocument, code: &str) -> bool {
    quickforge::validate(doc).unwrap().issues.iter().any(|issue| issue.code == code)
}
#[test]
fn king_requires_one_or_three_to_eight_markers_per_hill() {
    let mut doc = original();
    doc.game_mode = "king".into();
    doc.objectives = vec![
        marker("a", "hill", 0, 0, [0., 0., 1.]),
        marker("b", "hill", 0, 0, [5., 0., 1.]),
    ];
    assert!(unsafe_code(&doc, "CE_INVALID_HILL_COUNT"));
    assert!(quickforge::scenario_commands(&doc).is_err());
    doc.objectives.push(marker("c", "hill", 0, 0, [5., 5., 1.]));
    doc.objectives.push(marker("d", "hill", 0, 0, [0., 5., 1.]));
    assert!(!unsafe_code(&doc, "CE_INVALID_HILL_COUNT"));
    assert!(quickforge::scenario_commands(&doc).is_ok());
    doc.objectives.push(marker("duplicate-xy", "hill", 0, 0, [0., 0., 2.]));
    assert!(unsafe_code(&doc, "CE_DEGENERATE_HILL"));
    assert!(quickforge::scenario_commands(&doc).is_err());
}
#[test]
fn ctf_teams_and_objective_usage_are_not_confused() {
    let mut doc = original();
    doc.game_mode = "ctf".into();
    doc.objectives = vec![marker("red", "ctfFlag", 0, 0, [-8., 0., 0.]), marker("blue", "ctfFlag", 1, 0, [8., 0., 0.])];
    assert!(quickforge::scenario_commands(&doc).is_ok());
    doc.objectives[1].team = -1;
    assert!(unsafe_code(&doc, "CE_CTF_TEAM_RANGE"));
    assert!(quickforge::scenario_commands(&doc).is_err());
}
#[test]
fn ball_and_race_index_gaps_fail_closed() {
    let mut doc = original();
    doc.objectives.push(marker("ball-1", "oddball", 1, 1, [0., 0., 1.]));
    assert!(unsafe_code(&doc, "CE_INDEX_GAP"));
    assert!(quickforge::scenario_commands(&doc).is_err());
    doc.objectives.insert(0, marker("ball-0", "oddball", 0, 0, [0., 5., 1.]));
    assert!(quickforge::scenario_commands(&doc).is_ok());
    doc.objectives.push(marker("race-2", "raceCheckpoint", -1, 2, [0., 10., 1.]));
    assert!(unsafe_code(&doc, "CE_INDEX_GAP"));
    assert!(quickforge::scenario_commands(&doc).is_err());
}
#[test]
fn legacy_hill_sequence_is_preserved_as_usage_id() {
    let mut doc = original();
    doc.objectives = vec![marker("legacy-hill", "hill", -1, 7, [1., 2., 3.])];
    let commands = quickforge::scenario_commands(&doc).unwrap();
    assert!(commands.iter().any(|c| c.args.windows(3).any(|w| w[0] == "-S" && w[1] == "netgame_flags[0].usage_id" && w[2] == "7")));
}

#[test]
fn teleporter_source_channels_must_be_paired_and_map_to_native_types() {
    let mut doc=original();
    doc.objectives=vec![marker("door", "teleportFrom", 4, 0, [0.,0.,0.])];
    assert!(unsafe_code(&doc,"CE_TELEPORT_CHANNEL_UNPAIRED"));
    assert!(quickforge::scenario_commands(&doc).is_err());
    doc.objectives.push(marker("exit", "teleportTo", 4, 0, [8.,0.,0.]));
    assert!(!unsafe_code(&doc,"CE_TELEPORT_CHANNEL_UNPAIRED"));
    let commands=quickforge::scenario_commands(&doc).unwrap();
    assert!(commands.iter().any(|c| c.args.windows(3).any(|w|w[0]=="-S"&&w[1]=="netgame_flags[0].type"&&w[2]=="teleport_from")));
    assert!(commands.iter().any(|c| c.args.windows(3).any(|w|w[0]=="-S"&&w[1]=="netgame_flags[1].type"&&w[2]=="teleport_to")));
}
#[test]
fn race_vehicle_markers_export_as_race_vehicle_not_race_track() {
    let mut doc=original();
    doc.objectives=vec![marker("race-car-spot", "raceVehicle", 0, 0, [1.,2.,0.])];
    let commands=quickforge::scenario_commands(&doc).unwrap();
    assert!(commands.iter().any(|c| c.args.windows(3).any(|w|w[0]=="-S"&&w[1]=="netgame_flags[0].type"&&w[2]=="race_vehicle")));
    doc.objectives=(0..17).map(|i|marker(&format!("v-{i}"),"raceVehicle",0,0,[i as f32,0.,0.])).collect();
    assert!(unsafe_code(&doc,"CE_RACE_VEHICLE_LIMIT"));
    assert!(quickforge::scenario_commands(&doc).is_err());
}

#[test]
fn invalid_teleporter_channel_is_not_silently_normalized() {
    let mut doc=original();
    doc.objectives=vec![marker("entry","teleportFrom",-1,0,[0.,0.,0.]),marker("exit","teleportTo",0,0,[8.,0.,0.])];
    assert!(unsafe_code(&doc,"CE_TELEPORT_CHANNEL_RANGE"));
    assert!(quickforge::scenario_commands(&doc).is_err());
}

#[test]
fn ctf_rejects_all_starts_closer_to_enemy_flag() {
    let mut doc=original();
    doc.game_mode="ctf".into();
    doc.objectives=vec![marker("red","ctfFlag",0,0,[-10.,0.,0.]),marker("blue","ctfFlag",1,0,[10.,0.,0.])];
    for start in &mut doc.spawns {
        start.team=0;
        start.position=[8.,0.,0.];
        start.game_modes=vec!["allGames".into()];
    }
    assert!(unsafe_code(&doc,"CE_CTF_SPAWN_PROXIMITY"));
    assert!(quickforge::scenario_commands(&doc).is_err());
}

#[test]
fn guilty_spark_five_mode_template_has_real_source_markers_not_fake_assets() {
    let arena = quickforge::create_arena("Guilty Spark Test Arena", "guiltySparkTestArena").unwrap();
    assert_eq!(arena.template, "guiltySparkTestArena");
    assert_eq!(arena.runtime_id, spark_core::runtime::RuntimeId::HaloCustomEdition);
    assert_eq!(arena.geometry.len(), 6); // original sealed room, ramp and cover
    assert_eq!(arena.spawns.len(), 32);
    assert_eq!(arena.spawns.iter().filter(|s| s.team == 0).count(), 16);
    assert_eq!(arena.spawns.iter().filter(|s| s.team == 1).count(), 16);
    let starts = &arena.spawns;
    assert!(starts.iter().enumerate().all(|(i,a)|starts.iter().skip(i+1).all(|b|{
        let d = a.position.iter().zip(b.position.iter()).map(|(x,y)|(x-y).powi(2)).sum::<f32>();
        d >= 1.0
    })));
    assert!(arena.spawns.iter().all(|s| s.game_modes.len()==1 && s.game_modes[0] == "allGames"));
    assert_eq!(arena.objectives.iter().filter(|m| m.kind == "ctfFlag").count(), 2);
    assert_eq!(arena.objectives.iter().filter(|m| m.kind == "hill").count(), 8);
    assert_eq!(arena.objectives.iter().filter(|m| m.kind == "oddball").count(), 1);
    assert_eq!(arena.objectives.iter().filter(|m| m.kind == "raceCheckpoint").count(), 4);
    assert_eq!(arena.objectives.iter().filter(|m| m.kind == "raceVehicle").count(), 4);
    assert_eq!(arena.objectives.iter().filter(|m| m.kind.starts_with("teleport")).count(), 2);
    assert!(arena.placements.is_empty()); // no copyrighted game assets bundled
    assert!(quickforge::validate_document(&arena).is_ok());
    assert!(quickforge::scenario_commands(&arena).is_ok());
    let netgame=quickforge::validate(&arena).unwrap();
    assert!(!netgame.issues.iter().any(|i|i.code.starts_with("CE_")));
}
